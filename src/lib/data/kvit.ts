import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  KvitCar,
  KvitCarDeadline,
  KvitCarRecord,
  KvitCarSettlement,
  KvitCarSpec,
  KvitDebt,
  KvitDebtPayment,
  KvitEntry,
  KvitMember,
  KvitMembership,
  KvitMonth,
  KvitSharedExpense,
} from "@/lib/types/database.types";
import { computeLedger, type LedgerRow } from "@/lib/kvit/balance";
import { pairDebts, recordDebts, type Debt } from "@/lib/kvit/cars";

type Supa = SupabaseClient<Database>;

export async function getMembership(
  supabase: Supa,
  userId: string
): Promise<KvitMembership | null> {
  const { data: member } = await supabase
    .from("kvit_members")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return null;
  const { data: household } = await supabase
    .from("kvit_households")
    .select("*")
    .eq("id", member.household_id)
    .maybeSingle();
  if (!household) return null;
  return { member: num(member), household };
}

// numeric pride iz PostgREST kot niz — pretvori v število.
function num<T extends object>(row: T): T {
  const r = { ...row } as Record<string, unknown>;
  for (const k of ["amount", "fixed_amount", "monthly_amount", "price", "settle_amount", "share"]) {
    if (k in r && r[k] !== null) r[k] = Number(r[k]);
  }
  return r as T;
}

export type MemberLedger = {
  member: KvitMember;
  rows: LedgerRow[];
  months: Map<string, KvitMonth>; // "2026-11" → vrstica (samo zapisani)
  entries: Map<string, KvitEntry[]>; // "2026-11" → vnosi, po dnevu
};

// Vsi člani gospodinjstva z obračunom do `untilKey`. RLS omeji na lastno
// gospodinjstvo, zato brez filtra — vse tri poizvedbe v enem krogu.
export async function getLedgers(supabase: Supa, untilKey: string): Promise<MemberLedger[]> {
  const [{ data: members }, { data: months }, { data: entries }] = await Promise.all([
    supabase.from("kvit_members").select("*").order("joined_at"),
    supabase.from("kvit_months").select("*").order("month"),
    supabase.from("kvit_entries").select("*").order("day", { nullsFirst: true }).order("created_at"),
  ]);

  const entriesByMonth = new Map<string, KvitEntry[]>();
  for (const e of entries ?? []) {
    const list = entriesByMonth.get(e.month_id) ?? [];
    list.push(num(e));
    entriesByMonth.set(e.month_id, list);
  }

  // Mama nima mesečnega obračuna.
  return (members ?? []).filter((m) => m.role !== "mama").map((raw) => {
    const member = num(raw);
    const own = (months ?? []).filter((m) => m.user_id === member.user_id).map(num);
    const monthMap = new Map(own.map((m) => [m.month.slice(0, 7), m]));
    const entryMap = new Map(own.map((m) => [m.month.slice(0, 7), entriesByMonth.get(m.id) ?? []]));
    const rows = computeLedger(
      own.map((m) => ({
        key: m.month.slice(0, 7),
        fixed: m.fixed_amount,
        settled: m.settled,
        entries: entryMap.get(m.month.slice(0, 7)) ?? [],
      })),
      member.monthly_amount,
      untilKey
    );
    return { member, rows, months: monthMap, entries: entryMap };
  });
}

export type DebtWithPayments = KvitDebt & {
  payments: KvitDebtPayment[]; // najnovejša zgoraj (vsa stanja)
  paid: number; // samo potrjena odplačila
  pending: number; // vsota odplačil, ki čakajo na mamino potrditev
  remaining: number; // amount − paid
};

// Dolgovi vseh članov gospodinjstva s plačili (RLS omeji na gospodinjstvo).
export async function getDebts(supabase: Supa): Promise<DebtWithPayments[]> {
  const [{ data: debts }, { data: payments }] = await Promise.all([
    supabase.from("kvit_debts").select("*").order("created_at"),
    supabase
      .from("kvit_debt_payments")
      .select("*")
      .order("day", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  return (debts ?? []).map((raw) => {
    const debt = num(raw);
    const own = (payments ?? []).filter((p) => p.debt_id === debt.id).map(num);
    const sum = (status: KvitDebtPayment["status"]) =>
      Math.round(own.filter((p) => p.status === status).reduce((a, p) => a + p.amount, 0) * 100) / 100;
    const paid = sum("confirmed");
    return {
      ...debt,
      payments: own,
      paid,
      pending: sum("pending"),
      remaining: Math.round((debt.amount - paid) * 100) / 100,
    };
  });
}

export type CarDetail = KvitCar & {
  photo_url: string | null; // začasna povezava (1 h) do slike avta
  records: KvitCarRecord[]; // najnovejši zgoraj
  deadlines: KvitCarDeadline[];
  specs: KvitCarSpec[];
};

// Vsi avti gospodinjstva z vso evidenco (RLS omeji na gospodinjstvo).
export async function getCars(supabase: Supa): Promise<CarDetail[]> {
  const [{ data: cars }, { data: records }, { data: deadlines }, { data: specs }] =
    await Promise.all([
      supabase.from("kvit_cars").select("*").order("position").order("created_at"),
      supabase
        .from("kvit_car_records")
        .select("*")
        .order("day", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),
      supabase.from("kvit_car_deadlines").select("*").order("position"),
      supabase.from("kvit_car_specs").select("*").order("position"),
    ]);
  // Bucket je zaseben: začasne povezave za slike v enem klicu.
  const paths = (cars ?? []).map((c) => c.photo_path).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from("kvit-avti").createSignedUrls(paths, 60 * 60);
    for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  }
  return (cars ?? []).map((car) => ({
    ...car,
    photo_url: car.photo_path ? (urls.get(car.photo_path) ?? null) : null,
    records: (records ?? []).filter((r) => r.car_id === car.id).map(num),
    deadlines: (deadlines ?? []).filter((d) => d.car_id === car.id),
    specs: (specs ?? []).filter((s) => s.car_id === car.id),
  }));
}

// Predlogi opisov: najpogostejši pretekli opisi gospodinjstva + trgovine.
export function labelSuggestions(ledgers: MemberLedger[]) {
  const counts = new Map<string, { label: string; n: number }>();
  for (const l of ledgers)
    for (const list of l.entries.values())
      for (const e of list) {
        const label = e.label.trim();
        if (!label) continue;
        const k = label.toLowerCase();
        const c = counts.get(k) ?? { label, n: 0 };
        c.n++;
        counts.set(k, c);
      }
  for (const s of ["Lidl", "Hofer", "Mercator", "Spar", "Eurospin", "Tuš"]) {
    if (!counts.has(s.toLowerCase())) counts.set(s.toLowerCase(), { label: s, n: 0 });
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).map((c) => c.label);
}

// „Plačal“ in lastniki avtov so imena — prva beseda display_name (Žiga Tomše → Žiga).
export const firstName = (displayName: string) => displayName.trim().split(/\s+/)[0] ?? "";

export type CarReason = {
  id: string;
  text: string;
  car: string | null; // null = skupni strošek izven avtov (kvit_shared_expenses)
  paidBy: string;
  price: number;
  share: number; // delež enega lastnika (avto) oziroma koliko dolguje owedBy (strošek)
  owedBy?: string; // samo strošek
  expense?: KvitSharedExpense; // samo strošek — za urejanje
  debts: Debt[]; // kdo komu dolguje zaradi tega vnosa (za poravnavo po parih)
};

export type CarBalance = {
  myName: string;
  owed: Debt[]; // neto po parih, brez vnosov, ki čakajo na potrditev
  reasons: CarReason[]; // odprti vnosi, ki tvorijo `owed`
  pending: (KvitCarSettlement & { reasons: CarReason[] })[];
};

// Kdo komu dolguje za skupne avte in skupne stroške (Dodaj strošek). Vnosi iz
// poravnav, ki čakajo na potrditev, niso več v `owed` — prikažejo se pri `pending`.
export async function getCarBalance(supabase: Supa, myName: string): Promise<CarBalance> {
  const [{ data: cars }, { data: records }, { data: pending }, { data: expenses }] = await Promise.all([
    supabase.from("kvit_cars").select("id, name, owners"),
    supabase
      .from("kvit_car_records")
      .select("id, car_id, day, description, price, paid_by, settled")
      .eq("settled", false)
      .not("price", "is", null)
      .order("day"),
    supabase.from("kvit_car_settlements").select("*").eq("status", "pending").order("created_at"),
    supabase.from("kvit_shared_expenses").select("*").eq("settled", false).order("day").order("created_at"),
  ]);
  const shared = new Map((cars ?? []).filter((c) => c.owners.length > 1).map((c) => [c.id, c]));
  const open = (records ?? [])
    .filter((r) => shared.has(r.car_id) && Number(r.price) > 0 && r.paid_by.trim())
    .map((r) => ({ ...r, price: Number(r.price) }));
  const openExp = (expenses ?? []).map((e) => ({ ...num(e), share: Number(e.share) }));
  const toReason = (r: (typeof open)[number]): CarReason => {
    const car = shared.get(r.car_id)!;
    return {
      id: r.id,
      text: r.description.trim() || "Strošek",
      car: car.name,
      paidBy: r.paid_by.trim(),
      price: r.price,
      share: Math.round((r.price / car.owners.length) * 100) / 100,
      debts: recordDebts(r, car.owners),
    };
  };
  const expReason = (e: (typeof openExp)[number]): CarReason => ({
    id: e.id,
    text: e.label.trim() || "Strošek",
    car: null,
    paidBy: e.paid_by,
    price: e.amount,
    share: e.share,
    owedBy: e.owed_by,
    expense: e,
    debts: [{ from: e.owed_by, to: e.paid_by, amount: e.share }],
  });
  const pendingRows = (pending ?? []).map((p) => ({ ...p, amount: Number(p.amount) }));
  const inPending = new Set(pendingRows.flatMap((p) => p.record_ids));
  const reasonsOf = (ids: (id: string) => boolean) => [
    ...open.filter((r) => ids(r.id)).map(toReason),
    ...openExp.filter((e) => ids(e.id)).map(expReason),
  ];
  const reasons = reasonsOf((id) => !inPending.has(id));
  return {
    myName,
    owed: pairDebts(reasons.flatMap((r) => r.debts)),
    reasons,
    pending: pendingRows.map((p) => ({ ...p, reasons: reasonsOf((id) => p.record_ids.includes(id)) })),
  };
}
