import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  KvitEntry,
  KvitMember,
  KvitMembership,
  KvitMonth,
} from "@/lib/types/database.types";
import { computeLedger, type LedgerRow } from "@/lib/kvit/balance";

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
  for (const k of ["amount", "fixed_amount", "monthly_amount"]) {
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

  return (members ?? []).map((raw) => {
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
