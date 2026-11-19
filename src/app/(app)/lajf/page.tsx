import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getLedgers, labelSuggestions } from "@/lib/data/kvit";
import { addMonths, monthKey } from "@/lib/kvit/balance";
import MonthView from "@/components/kvit/MonthView";
import CostMonths from "@/components/kvit/CostMonths";
import HeatingPeriods from "@/components/kvit/HeatingPeriods";
import { heatingForMonth } from "@/lib/kvit/heating";
import type { CostCategory } from "@/lib/types/database.types";
import Link from "next/link";
import clsx from "@/lib/utils/clsx";

// Zavihki na vrhu /lajf (?zavihek=...). „lajf“ je mesečni obračun, ostali so zaenkrat prazni.
const TABS = [
  { id: "lajf", label: "Lajf" },
  { id: "telekom", label: "Telekom" },
  { id: "elektrika", label: "Elektrika" },
  { id: "hrana", label: "Hrana" },
  { id: "ogrevanje", label: "Ogrevanje" },
  { id: "komunala", label: "Komunala" },
] as const;
const COST_TABS = TABS.filter((t) => t.id !== "lajf");
const RTV_MONTHLY = 14.02; // fiksni RTV prispevek na mesec (informativni izračun)
type Tab = (typeof TABS)[number]["id"];

// /lajf — zavihki (?zavihek=, privzeto lajf); zavihek „lajf“ kaže mesec osebe
// (?oseba=<user_id>&mesec=2026-11), privzeto jaz in tekoči mesec.
export default async function LajfPage({
  searchParams,
}: {
  searchParams: Promise<{ zavihek?: string; oseba?: string; mesec?: string }>;
}) {
  const params = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === params.zavihek) ? (params.zavihek as Tab) : "lajf";
  return (
    <div className="space-y-4">
      <nav className="flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
        {TABS.map(({ id, label }) => (
          <Link
            key={id}
            href={id === "lajf" ? "/lajf" : `/lajf?zavihek=${id}`}
            replace
            className={clsx(
              "flex-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-center text-sm font-medium sm:px-3",
              id === tab
                ? "bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100"
                : "text-gray-500 dark:text-gray-400"
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "lajf" ? (
        <LajfTab params={params} />
      ) : tab === "ogrevanje" ? (
        <HeatingTab />
      ) : (
        <CostTab category={tab} />
      )}
    </div>
  );
}

async function getHeatingPeriods(supabase: Awaited<ReturnType<typeof createClient>>) {
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

// Ogrevanje: polnitve olja od natankanja do dneva, ko ga zmanjka (najnovejša prva).
async function HeatingTab() {
  const supabase = await createClient();
  return <HeatingPeriods periods={await getHeatingPeriods(supabase)} />;
}

// Hrana iz Cekarja (0019): tekoči mesec je živa vsota iz Cekarja; pretekli
// meseci so zapisani v kvit_household_costs. Pretekel mesec brez zapisa se ob
// prvem ogledu po koncu meseca zapiše s končno vsoto iz Cekarja (kasneje ga
// lahko ročno popraviš na zavihku Hrana). Vrne YYYY-MM → znesek od `fromKey`.
async function getFood(supabase: Awaited<ReturnType<typeof createClient>>, fromKey: string) {
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
    const amount = Math.round(Number(r.amount) * 100) / 100;
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

// Zadnjih 12 mesecev (tekoči prvi) z vnosnim poljem za znesek kategorije.
async function CostTab({ category }: { category: Exclude<CostCategory, "ogrevanje"> }) {
  const supabase = await createClient();
  const current = monthKey();
  const months = Array.from({ length: 12 }, (_, i) => addMonths(current, -i));
  if (category === "hrana") {
    const values = await getFood(supabase, months[months.length - 1]);
    return <CostMonths category={category} months={months} values={values} liveKey={current} />;
  }
  const { data } = await supabase
    .from("kvit_household_costs")
    .select("month, amount")
    .eq("category", category);
  const values: Record<string, number> = {};
  for (const r of data ?? []) values[String(r.month).slice(0, 7)] = Number(r.amount);
  return <CostMonths category={category} months={months} values={values} />;
}

async function LajfTab({ params }: { params: { oseba?: string; mesec?: string } }) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return null;

  const current = monthKey();
  const [ledgers, { data: mamas }] = await Promise.all([
    getLedgers(supabase, current),
    supabase.from("kvit_members").select("user_id").eq("role", "mama"),
  ]);
  const isMama = (mamas ?? []).some((m) => m.user_id === user.id);
  const mine = ledgers.find((l) => l.member.user_id === user.id);
  if (!mine && !isMama) return null; // layout pokaže Onboarding

  // Mama nima svojega obračuna — privzeto vidi prvega sina (samo branje).
  const ledger = ledgers.find((l) => l.member.user_id === params.oseba) ?? mine ?? ledgers[0];
  if (!ledger) {
    return <p className="text-center text-sm text-gray-500 dark:text-gray-400">Noben sin še nima obračuna.</p>;
  }
  const wanted = params.mesec && /^\d{4}-\d{2}$/.test(params.mesec) ? params.mesec : current;
  const index = Math.max(
    0,
    ledger.rows.findIndex((r) => r.key === wanted) === -1
      ? ledger.rows.findIndex((r) => r.key === current)
      : ledger.rows.findIndex((r) => r.key === wanted)
  );
  const row = ledger.rows[index];

  // Slike računov tega meseca: začasne povezave (1 h) iz zasebnega bucketa.
  const withReceipt = (ledger.entries.get(row.key) ?? []).filter((e) => e.receipt_path);
  const receiptUrls: Record<string, string> = {};
  if (withReceipt.length > 0) {
    const { data: signed } = await supabase.storage
      .from("kvit-racuni")
      .createSignedUrls(withReceipt.map((e) => e.receipt_path!), 3600);
    withReceipt.forEach((e, i) => {
      const url = signed?.[i]?.signedUrl;
      if (url) receiptUrls[e.id] = url;
    });
  }

  // Stroški meseca iz zavihkov Telekom, Elektrika, Hrana, Ogrevanje, Komunala (informativni seštevek).
  // Ogrevanje: znesek polnitve olja ÷ 12 za vsak mesec, ko se kuri.
  // Hrana: iz Cekarja (tekoči mesec živo, pretekli zapisani).
  // Graf: do 6 mesecev do izbranega, ne pred prvim mesecem obračuna.
  const firstKey = ledger.rows[0]?.key ?? row.key;
  const allChartKeys = Array.from({ length: 6 }, (_, i) => addMonths(row.key, i - 5));
  const chartKeys = allChartKeys.filter((k) => k >= firstKey);
  const [{ data: costRows }, heating, food] = await Promise.all([
    supabase
      .from("kvit_household_costs")
      .select("category, month, amount")
      .gte("month", `${chartKeys[0]}-01`)
      .lte("month", `${row.key}-01`),
    getHeatingPeriods(supabase),
    getFood(supabase, chartKeys[0]),
  ]);
  const costsFor = (key: string) => {
    const list: { label: string; amount: number | null; inTotal: boolean }[] = COST_TABS.map(({ id, label }) => {
      // Ogrevanje: 1/12 polnitve olja, ki se kuri ta mesec.
      if (id === "ogrevanje") return { label, amount: heatingForMonth(heating, key), inTotal: true };
      if (id === "hrana") return { label, amount: food[key] ?? null, inTotal: true };
      const found = (costRows ?? []).find((r) => r.category === id && String(r.month).startsWith(key));
      return { label, amount: found ? Number(found.amount) : null, inTotal: true };
    });
    // RTV prispevek: fiksen znesek vsak mesec, na koncu seznama.
    list.push({ label: "RTV prispevek", amount: RTV_MONTHLY, inTotal: true });
    return list;
  };
  const costs = costsFor(row.key);
  // Graf: vsota in posamezne kategorije (brez RTV, ki je fiksen) po mesecih.
  // Meseci pred prvim mesecem obračuna so prazna mesta (empty), da ima graf vedno 6 stolpcev.
  const costHistory = allChartKeys.map((key) => {
    if (key < firstKey) return { key, total: 0, parts: {}, empty: true };
    const list = costsFor(key);
    return {
      empty: false,
      key,
      total: list.reduce((a, c) => a + (c.inTotal ? (c.amount ?? 0) : 0), 0),
      parts: Object.fromEntries(
        list.filter((c) => c.label !== "RTV prispevek").map((c) => [c.label, c.amount ?? 0])
      ),
    };
  });

  // Jaz najprej, nato ostali.
  const people = [...(mine ? [mine] : []), ...ledgers.filter((l) => l !== mine)].map((l) => ({
    userId: l.member.user_id,
    name: l.member.display_name || "Brez imena",
    isMe: l === mine,
  }));

  return (
    <MonthView
      key={`${ledger.member.user_id}-${row.key}`}
      people={people}
      personId={ledger.member.user_id}
      row={row}
      prevKey={ledger.rows[index - 1]?.key ?? null}
      nextKey={ledger.rows[index + 1]?.key ?? null}
      entries={ledger.entries.get(row.key) ?? []}
      note={ledger.months.get(row.key)?.note ?? null}
      editable={ledger === mine}
      suggestions={labelSuggestions(ledgers)}
      settleRequest={(() => {
        const m = ledger.months.get(row.key);
        return m?.settle_requested_at ? { amount: m.settle_amount ?? 0 } : null;
      })()}
      hasMama={(mamas ?? []).length > 0}
      householdId={ledger.member.household_id}
      receiptUrls={receiptUrls}
      costs={costs}
      costHistory={costHistory}
    />
  );
}
