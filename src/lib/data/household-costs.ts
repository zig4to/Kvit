import type { SupabaseClient } from "@supabase/supabase-js";
import { addMonths, monthKey } from "@/lib/kvit/balance";
import { heatingForMonth } from "@/lib/kvit/heating";
import type { CostCategory, Database } from "@/lib/types/database.types";

type Supa = SupabaseClient<Database>;

// Kategorije stroškov gospodinjstva (zavihki na /lajf) in RTV prispevek.
export const COST_CATEGORIES: { id: CostCategory; label: string }[] = [
  { id: "telekom", label: "Telekom" },
  { id: "elektrika", label: "Elektrika" },
  { id: "hrana", label: "Hrana" },
  { id: "ogrevanje", label: "Ogrevanje" },
  { id: "komunala", label: "Komunala" },
];
export const RTV_LABEL = "RTV prispevek";
export const RTV_MONTHLY = 14.02; // fiksni RTV prispevek na mesec
export const HEATING_EXCLUDED_UNTIL = "2027-09"; // ogrevanje ni v izračunu do vključno tega meseca
export const SHARE_PEOPLE = 3; // stroški gospodinjstva se delijo na tri

// note: majhno besedilo desno; prečrtana vrstica (inTotal = false) je izvzeta iz izračuna.
export type CostLine = { label: string; amount: number | null; inTotal: boolean; note?: string };
export type MonthCosts = { lines: CostLine[]; total: number; share: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getHeatingPeriods(supabase: Supa) {
  const { data } = await supabase
    .from("kvit_heating_periods")
    .select("*")
    .order("started_on", { ascending: false });
  return (data ?? []).map((p) => ({
    ...p,
    amount: Number(p.amount),
    liters: p.liters === null ? null : Number(p.liters),
  }));
}

// Hrana iz Cekarja (0019): tekoči mesec je živa vsota iz Cekarja; pretekli
// meseci so zapisani v kvit_household_costs. Pretekel mesec brez zapisa se ob
// prvem ogledu po koncu meseca zapiše s končno vsoto iz Cekarja (kasneje ga
// lahko ročno popraviš na zavihku Hrana). Vrne YYYY-MM → znesek od `fromKey`.
export async function getFood(supabase: Supa, fromKey: string) {
  const current = monthKey();
  const [{ data: stored }, { data: cekar }] = await Promise.all([
    supabase
      .from("kvit_household_costs")
      .select("month, amount")
      .eq("category", "hrana")
      .gte("month", `${fromKey}-01`),
    supabase.rpc("kvit_cekar_food", { p_from: `${fromKey}-01` }),
  ]);
  const values: Record<string, number> = {};
  for (const r of stored ?? []) values[String(r.month).slice(0, 7)] = Number(r.amount);
  const freeze: { category: "hrana"; month: string; amount: number }[] = [];
  for (const r of cekar ?? []) {
    const key = String(r.month).slice(0, 7);
    const amount = round2(Number(r.amount));
    if (key === current) values[key] = amount;
    else if (key < current && values[key] === undefined && amount > 0) {
      values[key] = amount;
      freeze.push({ category: "hrana", month: `${key}-01`, amount });
    }
  }
  if (freeze.length > 0)
    await supabase
      .from("kvit_household_costs")
      .upsert(freeze, { onConflict: "household_id,category,month", ignoreDuplicates: true });
  return values;
}

// Stroški gospodinjstva po mesecih od `fromKey` do `untilKey` (vključno):
// vrstice kategorij + RTV, vsota in delež na osebo (÷ 3). Delež je mesečni
// znesek v obračunu (getLedgers) in se spreminja iz meseca v mesec.
export async function getHouseholdCosts(
  supabase: Supa,
  fromKey: string,
  untilKey: string
): Promise<Map<string, MonthCosts>> {
  const [{ data: rows }, heating, food] = await Promise.all([
    supabase
      .from("kvit_household_costs")
      .select("category, month, amount")
      .gte("month", `${fromKey}-01`)
      .lte("month", `${untilKey}-01`),
    getHeatingPeriods(supabase),
    getFood(supabase, fromKey),
  ]);
  const result = new Map<string, MonthCosts>();
  for (let key = fromKey; key <= untilKey; key = addMonths(key, 1)) {
    const lines: CostLine[] = COST_CATEGORIES.map(({ id, label }) => {
      // Ogrevanje (1/12 polnitve olja, ki se kuri ta mesec) ni v izračunu do vključno
      // HEATING_EXCLUDED_UNTIL: prečrtano, „prišteto k dolgu“. Od oktobra 2027 šteje v vsoto.
      if (id === "ogrevanje") {
        const excluded = key <= HEATING_EXCLUDED_UNTIL;
        return {
          label,
          amount: heatingForMonth(heating, key),
          inTotal: !excluded,
          ...(excluded && { note: "Prišteto k dolgu" }),
        };
      }
      if (id === "hrana") return { label, amount: food[key] ?? null, inTotal: true };
      const found = (rows ?? []).find((r) => r.category === id && String(r.month).startsWith(key));
      return { label, amount: found ? Number(found.amount) : null, inTotal: true };
    });
    lines.push({ label: RTV_LABEL, amount: RTV_MONTHLY, inTotal: true });
    const total = round2(lines.reduce((a, c) => a + (c.inTotal ? (c.amount ?? 0) : 0), 0));
    result.set(key, { lines, total, share: round2(total / SHARE_PEOPLE) });
  }
  return result;
}
