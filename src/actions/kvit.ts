"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { addMonths, monthKey } from "@/lib/kvit/balance";
import { firstName, getCarBalance } from "@/lib/data/kvit";
import type { EntryKind, EntryProof } from "@/lib/types/database.types";

export type KvitResult = { error?: string };

type Supa = Awaited<ReturnType<typeof createClient>>;

async function ctx(): Promise<
  | {
      supabase: Supa;
      userId: string;
      householdId: string;
      monthlyAmount: number;
      error?: undefined;
    }
  | { error: string }
> {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return { error: "Nisi prijavljen." };
  const { data } = await supabase
    .from("kvit_members")
    .select("household_id, monthly_amount")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return { error: "Nisi član gospodinjstva." };
  return {
    supabase,
    userId: user.id,
    householdId: data.household_id,
    monthlyAmount: Number(data.monthly_amount),
  };
}

type Ctx = Exclude<Awaited<ReturnType<typeof ctx>>, { error: string }>;

function done(): KvitResult {
  revalidatePath("/", "layout");
  return {};
}

const fail = (message: string | undefined, fallback: string): KvitResult => ({
  error: message || fallback,
});

const isKey = (k: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(k);

// Zagotovi, da mesec `key` obstaja v bazi, in zapolni vrzel od zadnjega
// zapisanega meseca do njega (s privzetim zneskom), da je prenos neprekinjen.
// Vrne id meseca.
async function ensureMonth(c: Ctx, key: string): Promise<string | null> {
  const { data: existing } = await c.supabase
    .from("kvit_months")
    .select("id, month")
    .eq("user_id", c.userId)
    .order("month");
  const keys = new Set((existing ?? []).map((m) => m.month.slice(0, 7)));
  const hit = (existing ?? []).find((m) => m.month.startsWith(key));
  if (hit) return hit.id;

  // Vrzel: med zadnjim mesecem pred `key` in `key`, ali med `key` in prvim po njem.
  const sorted = [...keys].sort();
  const before = sorted.filter((k) => k < key).pop();
  const after = sorted.find((k) => k > key);
  const toAdd: string[] = [];
  if (before) for (let k = addMonths(before, 1); k < key; k = addMonths(k, 1)) toAdd.push(k);
  toAdd.push(key);
  if (after) for (let k = addMonths(key, 1); k < after; k = addMonths(k, 1)) toAdd.push(k);

  const { error } = await c.supabase.from("kvit_months").upsert(
    toAdd.map((k) => ({
      household_id: c.householdId,
      user_id: c.userId,
      month: `${k}-01`,
      fixed_amount: c.monthlyAmount,
    })),
    { onConflict: "user_id,month", ignoreDuplicates: true }
  );
  if (error) return null;
  const { data } = await c.supabase
    .from("kvit_months")
    .select("id")
    .eq("user_id", c.userId)
    .eq("month", `${key}-01`)
    .maybeSingle();
  return data?.id ?? null;
}

// ===== Gospodinjstvo =====

export async function createHouseholdAction(name: string, displayName: string): Promise<KvitResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("kvit_create_household", {
    p_name: name,
    p_display_name: displayName,
  });
  if (error) return fail(error.message, "Gospodinjstva ni bilo mogoče ustvariti.");
  return done();
}

export async function joinHouseholdAction(
  code: string,
  displayName: string,
  role: "sin" | "mama" = "sin"
): Promise<KvitResult> {
  if (!code.trim()) return { error: "Vnesi kodo." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("kvit_join_household", {
    p_code: code,
    p_display_name: displayName,
    p_role: role === "mama" ? "mama" : "sin",
  });
  if (error) return fail(error.message, "Pridružitev ni uspela.");
  return done();
}

export async function renameHouseholdAction(name: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  if (!name.trim()) return { error: "Ime ne sme biti prazno." };
  const { error } = await c.supabase
    .from("kvit_households")
    .update({ name: name.trim() })
    .eq("id", c.householdId);
  if (error) return fail(undefined, "Shranjevanje ni uspelo.");
  return done();
}

export async function setDisplayNameAction(name: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { error } = await c.supabase
    .from("kvit_members")
    .update({ display_name: name.trim() })
    .eq("user_id", c.userId);
  if (error) return fail(undefined, "Shranjevanje ni uspelo.");
  return done();
}

// Privzeti mesečni znesek: velja za nove mesece in tudi za tekoči mesec, če
// zanj fiksni znesek še ni bil ročno spremenjen (= enak staremu privzetemu).
export async function setMonthlyAmountAction(amount: number): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  if (!(amount >= 0)) return { error: "Vpiši znesek." };
  // Pretekle (še nezapisane) mesece zapiši s starim zneskom, da se ne spremenijo.
  await ensureMonth(c, monthKey());
  const { error } = await c.supabase
    .from("kvit_members")
    .update({ monthly_amount: amount })
    .eq("user_id", c.userId);
  if (error) return fail(undefined, "Shranjevanje ni uspelo.");
  await c.supabase
    .from("kvit_months")
    .update({ fixed_amount: amount })
    .eq("user_id", c.userId)
    .eq("month", `${monthKey()}-01`)
    .eq("fixed_amount", c.monthlyAmount);
  return done();
}

export async function leaveHouseholdAction(): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { error } = await c.supabase.from("kvit_members").delete().eq("user_id", c.userId);
  if (error) return fail(undefined, "Izstop ni uspel.");
  revalidatePath("/", "layout");
  redirect("/");
}

// ===== Meseci =====

export async function setFixedAmountAction(key: string, amount: number): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  if (!isKey(key) || !(amount >= 0)) return { error: "Vpiši znesek." };
  const id = await ensureMonth(c, key);
  if (!id) return { error: "Meseca ni bilo mogoče ustvariti." };
  const { error } = await c.supabase.from("kvit_months").update({ fixed_amount: amount }).eq("id", id);
  if (error) return fail(undefined, "Shranjevanje ni uspelo.");
  return done();
}

export async function setMonthNoteAction(key: string, note: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  if (!isKey(key)) return { error: "Neveljaven mesec." };
  const id = await ensureMonth(c, key);
  if (!id) return { error: "Meseca ni bilo mogoče ustvariti." };
  const { error } = await c.supabase
    .from("kvit_months")
    .update({ note: note.trim() || null })
    .eq("id", id);
  if (error) return fail(undefined, "Shranjevanje ni uspelo.");
  return done();
}

// Doda prazen mesec pred prvim (za vnos zgodovine).
export async function addMonthAction(key: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  if (!isKey(key)) return { error: "Neveljaven mesec." };
  const id = await ensureMonth(c, key);
  if (!id) return { error: "Meseca ni bilo mogoče ustvariti." };
  return done();
}

// Poravnaj: če je ostal dolg, ga zapiše kot plačilo mami; mesec označi kot
// poravnan. `balance` pošlje odjemalec (prikazano stanje) — strežnik ga ne
// računa ponovno, ker zahteva celotno verigo mesecev.
// „Poravnaj mesec“. Če je v gospodinjstvu mama, poravnava čaka na njeno
// potrditev (kvit_confirm_month zapiše plačilo in settled); sicer takoj.
export async function settleMonthAction(key: string, balance: number): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  if (!isKey(key)) return { error: "Neveljaven mesec." };
  const id = await ensureMonth(c, key);
  if (!id) return { error: "Meseca ni bilo mogoče ustvariti." };
  const { count } = await c.supabase
    .from("kvit_members")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "mama");
  if (count && count > 0) {
    const { error } = await c.supabase
      .from("kvit_months")
      .update({
        settle_requested_at: new Date().toISOString(),
        settle_amount: Math.max(0, Math.round(balance * 100) / 100),
      })
      .eq("id", id);
    if (error) return fail(undefined, "Shranjevanje ni uspelo.");
    return done();
  }
  if (balance > 0) {
    const { error } = await c.supabase.from("kvit_entries").insert({
      month_id: id,
      kind: "placilo",
      label: "Poravnava",
      amount: Math.round(balance * 100) / 100,
      created_by: c.userId,
    });
    if (error) return fail(undefined, "Plačila ni bilo mogoče zapisati.");
  }
  const { error } = await c.supabase.from("kvit_months").update({ settled: true }).eq("id", id);
  if (error) return fail(undefined, "Shranjevanje ni uspelo.");
  return done();
}

export async function unsettleMonthAction(key: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { error } = await c.supabase
    .from("kvit_months")
    .update({ settled: false, settle_requested_at: null, settle_amount: null })
    .eq("user_id", c.userId)
    .eq("month", `${key}-01`);
  if (error) return fail(undefined, "Shranjevanje ni uspelo.");
  return done();
}

// Mama potrdi ali zavrne poravnavo meseca (RPC preveri vlogo).
export async function confirmMonthAction(monthId: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { error } = await c.supabase.rpc("kvit_confirm_month", { p_month_id: monthId });
  if (error) return fail(error.message, "Potrditev ni uspela.");
  return done();
}

export async function rejectMonthAction(monthId: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { error } = await c.supabase.rpc("kvit_reject_month", { p_month_id: monthId });
  if (error) return fail(error.message, "Zavrnitev ni uspela.");
  return done();
}

// ===== Vnosi =====

export type EntryInput = {
  id?: string;
  monthKey: string;
  kind: EntryKind;
  label: string;
  amount: number;
  proof: EntryProof | null;
  day: string | null; // "YYYY-MM-DD"
  receiptPath?: string | null; // slika računa (že naložena iz brskalnika)
};

export async function saveEntryAction(input: EntryInput): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  if (!isKey(input.monthKey)) return { error: "Neveljaven mesec." };
  if (!(input.amount > 0)) return { error: "Znesek mora biti večji od 0." };
  if (!["nakup", "placilo", "posojilo"].includes(input.kind)) return { error: "Neveljavna vrsta." };
  const day = input.day && /^\d{4}-\d{2}-\d{2}$/.test(input.day) ? input.day : null;

  const id = await ensureMonth(c, input.monthKey);
  if (!id) return { error: "Meseca ni bilo mogoče ustvariti." };

  // Slika računa: samo iz moje mape v bucketu.
  const receipt = input.receiptPath ?? null;
  if (receipt && !receipt.startsWith(`${c.householdId}/${c.userId}/`)) return { error: "Neveljavna slika računa." };
  const old = input.id
    ? (await c.supabase.from("kvit_entries").select("receipt_path").eq("id", input.id).maybeSingle()).data
    : null;

  const row = {
    month_id: id,
    kind: input.kind,
    label: input.label.trim(),
    amount: Math.round(input.amount * 100) / 100,
    proof: receipt && !input.proof ? ("racun" as const) : input.proof,
    day,
    receipt_path: receipt,
  };
  const { error } = input.id
    ? await c.supabase.from("kvit_entries").update(row).eq("id", input.id)
    : await c.supabase.from("kvit_entries").insert({ ...row, created_by: c.userId });
  if (error) return fail(undefined, "Vnosa ni bilo mogoče shraniti.");
  if (old?.receipt_path && old.receipt_path !== receipt)
    await c.supabase.storage.from("kvit-racuni").remove([old.receipt_path]);
  return done();
}

export async function deleteEntryAction(id: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { data: entry } = await c.supabase.from("kvit_entries").select("receipt_path").eq("id", id).maybeSingle();
  const { error } = await c.supabase.from("kvit_entries").delete().eq("id", id);
  if (error) return fail(undefined, "Brisanje ni uspelo.");
  if (entry?.receipt_path) await c.supabase.storage.from("kvit-racuni").remove([entry.receipt_path]);
  return done();
}

// ===== Dolg (ločen od mesečnih stroškov) =====

const isDay = (d: string | null | undefined) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

export async function saveDebtAction(input: {
  id?: string;
  label: string;
  amount: number;
  startedOn: string | null;
}): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  if (!(input.amount > 0)) return { error: "Znesek dolga mora biti večji od 0." };
  const row = {
    label: input.label.trim() || "Dolg",
    amount: Math.round(input.amount * 100) / 100,
    started_on: isDay(input.startedOn) ? input.startedOn : null,
  };
  const { error } = input.id
    ? await c.supabase.from("kvit_debts").update(row).eq("id", input.id)
    : await c.supabase
        .from("kvit_debts")
        .insert({ ...row, household_id: c.householdId, user_id: c.userId });
  if (error) return fail(undefined, "Dolga ni bilo mogoče shraniti.");
  return done();
}

export async function deleteDebtAction(id: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { error } = await c.supabase.from("kvit_debts").delete().eq("id", id);
  if (error) return fail(undefined, "Brisanje ni uspelo.");
  return done();
}

export async function saveDebtPaymentAction(input: {
  id?: string;
  debtId: string;
  amount: number;
  day: string;
  note: string;
}): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  if (!(input.amount > 0)) return { error: "Znesek mora biti večji od 0." };
  if (!isDay(input.day)) return { error: "Izberi datum." };
  const row = {
    amount: Math.round(input.amount * 100) / 100,
    day: input.day,
    note: input.note.trim(),
  };
  const { error } = input.id
    ? await c.supabase.from("kvit_debt_payments").update(row).eq("id", input.id)
    : await c.supabase
        .from("kvit_debt_payments")
        .insert({ ...row, debt_id: input.debtId, created_by: c.userId });
  if (error) return fail(undefined, "Plačila ni bilo mogoče shraniti.");
  return done();
}

// Mama potrdi ali zavrne odplačilo dolga (RPC preveri vlogo in stanje).
export async function confirmDebtPaymentAction(id: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { error } = await c.supabase.rpc("kvit_confirm_debt_payment", { p_id: id });
  if (error) return fail(error.message, "Potrditev ni uspela.");
  return done();
}

export async function rejectDebtPaymentAction(id: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { error } = await c.supabase.rpc("kvit_reject_debt_payment", { p_id: id });
  if (error) return fail(error.message, "Zavrnitev ni uspela.");
  return done();
}

export async function deleteDebtPaymentAction(id: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { error } = await c.supabase.from("kvit_debt_payments").delete().eq("id", id);
  if (error) return fail(undefined, "Brisanje ni uspelo.");
  return done();
}

// ===== Avti (skupni za gospodinjstvo) =====

const DEFAULT_DEADLINES = ["Tehnični pregled", "Registracija", "Zavarovanje", "Vinjeta"];

export async function saveCarAction(input: {
  id?: string;
  name: string;
  plate: string;
  owners: string[];
  photoZoom?: number;
  photoOffset?: number;
}): Promise<KvitResult & { id?: string }> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const name = input.name.trim();
  if (!name) return { error: "Vpiši ime avta." };
  const owners = [...new Set(input.owners.map((o) => o.trim()).filter(Boolean))];
  if (owners.length === 0) return { error: "Izberi vsaj enega lastnika." };
  const offset = Math.min(40, Math.max(-40, Math.round(input.photoOffset ?? 0)));
  const zoom = Math.min(2.5, Math.max(1, Math.round((input.photoZoom ?? 1) * 100) / 100));
  const row = { name, plate: input.plate.trim().toUpperCase(), owners, photo_zoom: zoom, photo_offset: offset };
  if (input.id) {
    const { error } = await c.supabase.from("kvit_cars").update(row).eq("id", input.id);
    if (error) return fail(undefined, "Shranjevanje ni uspelo.");
    return done();
  }
  const { count } = await c.supabase.from("kvit_cars").select("id", { count: "exact", head: true });
  const { data, error } = await c.supabase
    .from("kvit_cars")
    .insert({ ...row, household_id: c.householdId, position: (count ?? 0) + 1 })
    .select("id")
    .single();
  if (error || !data) return fail(undefined, "Avta ni bilo mogoče dodati.");
  // Nov avto dobi iste roke in podatke kot v starem Excelu.
  await c.supabase
    .from("kvit_car_deadlines")
    .insert(DEFAULT_DEADLINES.map((n, i) => ({ car_id: data.id, name: n, position: i + 1 })));
  await c.supabase.from("kvit_car_specs").insert({ car_id: data.id, name: "Velikost gum", position: 1 });
  done();
  return { id: data.id };
}

// Poravnaj delitev: vsi neporavnani vnosi s ceno na teh avtih postanejo
// poravnani (izravnava med lastniki je bila plačana).
async function myFirstName(c: Ctx) {
  const { data } = await c.supabase
    .from("kvit_members")
    .select("display_name")
    .eq("user_id", c.userId)
    .maybeSingle();
  return firstName(data?.display_name ?? "");
}

// „Poravnaj“ skupnih stroškov avtov. Dolžnik plačilo samo prijavi (čaka na
// potrditev upnika); upnik, ki je denar dobil, poravna takoj.
export async function settleCarsAction(): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const me = await myFirstName(c);
  const balance = await getCarBalance(c.supabase, me);
  // Poravnava po parih: samo vnosi, pri katerih sem udeležen. Če komu dolgujem
  // (neto), plačilo čaka na potrditev upnika — z vnosi tega para; dolgov drugih
  // do mene se takrat ne dotakne (gumb pove „Si plačal …?“). Če samo terjam,
  // je to „Si dobil denar?“ → moji vnosi se poravnajo takoj. Pari, ki se
  // izidejo na nič, se poravnajo takoj.
  const debtorTo = new Set(balance.owed.filter((o) => o.from === me).map((o) => o.to));
  const creditorOf = new Set(balance.owed.filter((o) => o.to === me).map((o) => o.from));
  const pendingIds = new Map<string, string[]>([...debtorTo].map((to) => [to, []]));
  const direct: string[] = [];
  for (const r of balance.reasons) {
    const others = r.debts
      .filter((d) => d.from === me || d.to === me)
      .map((d) => (d.from === me ? d.to : d.from));
    if (others.length === 0) continue;
    const owe = others.find((o) => debtorTo.has(o));
    if (owe) pendingIds.get(owe)!.push(r.id);
    else if (debtorTo.size === 0 || !others.some((o) => creditorOf.has(o))) direct.push(r.id);
  }
  if (direct.length === 0 && debtorTo.size === 0) return {};
  if (direct.length > 0 && !(await markSettled(c, direct))) return fail(undefined, "Poravnava ni uspela.");
  if (debtorTo.size > 0) {
    const { error } = await c.supabase.from("kvit_car_settlements").insert(
      balance.owed
        .filter((o) => o.from === me)
        .map((o) => ({
          household_id: c.householdId,
          from_name: o.from,
          to_name: o.to,
          amount: o.amount,
          record_ids: pendingIds.get(o.to) ?? [],
          created_by: c.userId,
        }))
    );
    if (error) return fail(undefined, "Poravnava ni uspela.");
  }
  return done();
}

// Upnik potrdi, da je denar dobil → vnosi so poravnani.
export async function confirmCarSettlementAction(id: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const me = await myFirstName(c);
  const { data: s } = await c.supabase.from("kvit_car_settlements").select("*").eq("id", id).maybeSingle();
  if (!s || s.status !== "pending") return { error: "Poravnava ne čaka več na potrditev." };
  if (s.to_name !== me) return { error: `Plačilo lahko potrdi samo ${s.to_name}.` };
  if (s.record_ids.length > 0 && !(await markSettled(c, s.record_ids))) {
    return fail(undefined, "Potrditev ni uspela.");
  }
  const { error } = await c.supabase
    .from("kvit_car_settlements")
    .update({ status: "confirmed", resolved_by: c.userId, resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return fail(undefined, "Potrditev ni uspela.");
  return done();
}

// Poravnava pokrije vnose avtov in skupne stroške (id-ji iz obeh tabel).
async function markSettled(c: Ctx, ids: string[]) {
  const [records, expenses] = await Promise.all([
    c.supabase.from("kvit_car_records").update({ settled: true }).in("id", ids),
    c.supabase.from("kvit_shared_expenses").update({ settled: true }).in("id", ids),
  ]);
  return !records.error && !expenses.error;
}

export type SharedExpenseInput = {
  id?: string;
  label: string;
  amount: number;
  paidBy: string;
  owedBy: string[]; // več dolžnikov → ena vrstica na dolžnika (urejanje: točno en)
  share: number; // koliko dolguje vsak
  day: string;
};

// Skupni strošek (gumb „Dodaj strošek“ na domači strani): kdo je plačal,
// kdo dolguje in koliko (cel znesek, pol ali poljuben znesek).
export async function saveSharedExpenseAction(input: SharedExpenseInput): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const label = input.label.trim();
  const amount = Math.round(input.amount * 100) / 100;
  const share = Math.round(input.share * 100) / 100;
  if (!label) return { error: "Vpiši, kaj si kupil." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Vpiši znesek." };
  if (!Number.isFinite(share) || share <= 0) return { error: "Vpiši, koliko dolguje." };
  const debtors = [...new Set(input.owedBy)];
  if (debtors.length === 0) return { error: "Izberi, kdo dolguje." };
  if (input.id && debtors.length !== 1) return { error: "Pri urejanju je dolžnik lahko samo en." };
  if (share * debtors.length > amount + 0.01) return { error: "Deleži skupaj ne morejo biti večji od zneska." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day)) return { error: "Neveljaven datum." };
  const { data: members } = await c.supabase.from("kvit_members").select("display_name");
  const names = new Set((members ?? []).map((m) => firstName(m.display_name)));
  if (![input.paidBy, ...debtors].every((n) => names.has(n))) return { error: "Izberi člana gospodinjstva." };
  if (debtors.includes(input.paidBy)) return { error: "Plačnik ne more biti tudi dolžnik." };
  const rows = debtors.map((owed_by) => ({ label, amount, share, paid_by: input.paidBy, owed_by, day: input.day }));
  const { error } = input.id
    ? await c.supabase.from("kvit_shared_expenses").update(rows[0]).eq("id", input.id).eq("settled", false)
    : await c.supabase.from("kvit_shared_expenses").insert(rows);
  if (error) return fail(undefined, "Shranjevanje ni uspelo.");
  return done();
}

export async function deleteSharedExpenseAction(id: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { error } = await c.supabase.from("kvit_shared_expenses").delete().eq("id", id);
  if (error) return fail(undefined, "Brisanje ni uspelo.");
  return done();
}

// Upnik zavrne ali dolžnik prekliče prijavljeno plačilo → dolg je spet odprt.
export async function rejectCarSettlementAction(id: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { error } = await c.supabase
    .from("kvit_car_settlements")
    .update({ status: "rejected", resolved_by: c.userId, resolved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending");
  if (error) return fail(undefined, "Preklic ni uspel.");
  return done();
}

export async function deleteCarAction(id: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { data: car } = await c.supabase.from("kvit_cars").select("photo_path").eq("id", id).maybeSingle();
  const { error } = await c.supabase.from("kvit_cars").delete().eq("id", id);
  if (error) return fail(undefined, "Brisanje ni uspelo.");
  if (car?.photo_path) await c.supabase.storage.from("kvit-avti").remove([car.photo_path]);
  return done();
}

const toInt = (n: number | null) =>
  n === null || !Number.isFinite(n) ? null : Math.max(0, Math.round(n));

export type CarRecordInput = {
  id?: string;
  carId: string;
  kind: "servis" | "popravilo";
  day: string | null;
  km: number | null;
  description: string;
  nextServiceKm: number | null;
  price: number | null;
  paidBy: string;
  settled: boolean;
  note: string;
};

export async function saveCarRecordAction(input: CarRecordInput): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  if (!input.description.trim()) return { error: "Vpiši, kaj je bilo narejeno." };
  if (input.kind !== "servis" && input.kind !== "popravilo") return { error: "Neveljavna vrsta." };
  const row = {
    kind: input.kind,
    day: isDay(input.day) ? input.day : null,
    km: toInt(input.km),
    description: input.description.trim(),
    next_service_km: input.kind === "servis" ? toInt(input.nextServiceKm) : null,
    price: input.price === null || !(input.price >= 0) ? null : Math.round(input.price * 100) / 100,
    paid_by: input.paidBy.trim(),
    settled: input.settled,
    note: input.note.trim(),
  };
  const { error } = input.id
    ? await c.supabase.from("kvit_car_records").update(row).eq("id", input.id)
    : await c.supabase
        .from("kvit_car_records")
        .insert({ ...row, car_id: input.carId, created_by: c.userId });
  if (error) return fail(undefined, "Vnosa ni bilo mogoče shraniti.");
  return done();
}

export async function deleteCarRecordAction(id: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { error } = await c.supabase.from("kvit_car_records").delete().eq("id", id);
  if (error) return fail(undefined, "Brisanje ni uspelo.");
  return done();
}

export async function saveCarDeadlineAction(input: {
  id?: string;
  carId: string;
  name: string;
  validFrom: string | null;
  validUntil: string | null;
  note: string;
}): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const name = input.name.trim();
  if (!name) return { error: "Vpiši ime roka." };
  const row = {
    name,
    valid_from: isDay(input.validFrom) ? input.validFrom : null,
    valid_until: isDay(input.validUntil) ? input.validUntil : null,
    note: input.note.trim(),
  };
  const { error } = input.id
    ? await c.supabase.from("kvit_car_deadlines").update(row).eq("id", input.id)
    : await c.supabase
        .from("kvit_car_deadlines")
        .insert({ ...row, car_id: input.carId, position: 99 });
  if (error) return fail(undefined, "Shranjevanje ni uspelo (ime roka mora biti edinstveno).");
  return done();
}

export async function deleteCarDeadlineAction(id: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { error } = await c.supabase.from("kvit_car_deadlines").delete().eq("id", id);
  if (error) return fail(undefined, "Brisanje ni uspelo.");
  return done();
}

export async function saveCarSpecAction(input: {
  id?: string;
  carId: string;
  name: string;
  value: string;
  note: string;
}): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const name = input.name.trim();
  if (!name) return { error: "Vpiši, za kateri del gre." };
  const row = { name, value: input.value.trim(), note: input.note.trim() };
  const { error } = input.id
    ? await c.supabase.from("kvit_car_specs").update(row).eq("id", input.id)
    : await c.supabase.from("kvit_car_specs").insert({ ...row, car_id: input.carId, position: 99 });
  if (error) return fail(undefined, "Shranjevanje ni uspelo.");
  return done();
}

export async function deleteCarSpecAction(id: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { error } = await c.supabase.from("kvit_car_specs").delete().eq("id", id);
  if (error) return fail(undefined, "Brisanje ni uspelo.");
  return done();
}

// Slika avta: pot iz uploadCarPhoto (ali null = odstrani). Stara datoteka se
// izbriše iz bucketa.
export async function setCarPhotoAction(carId: string, path: string | null): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  if (path && !path.startsWith(`${c.householdId}/${carId}/`)) return { error: "Neveljavna pot slike." };
  const { data: car } = await c.supabase.from("kvit_cars").select("photo_path").eq("id", carId).maybeSingle();
  if (!car) return { error: "Avto ne obstaja." };
  const { error } = await c.supabase.from("kvit_cars").update({ photo_path: path }).eq("id", carId);
  if (error) return fail(undefined, "Slike ni bilo mogoče shraniti.");
  if (car.photo_path && car.photo_path !== path) {
    await c.supabase.storage.from("kvit-avti").remove([car.photo_path]);
  }
  return done();
}
