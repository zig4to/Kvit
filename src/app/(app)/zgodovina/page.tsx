import Link from "next/link";
import clsx from "@/lib/utils/clsx";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getCars, getDebts, getLedgers } from "@/lib/data/kvit";
import { monthKey, monthLabel } from "@/lib/kvit/balance";
import { formatEur } from "@/lib/kvit/text";
import type { SVGProps } from "react";
import {
  IconArrowLeft,
  IconBasket,
  IconCar,
  IconCheck,
  IconChevronDown,
  IconHandCoins,
} from "@/components/ui/icons";

// Zgodovina po razdelkih (?zavihek=lajf|dolg|avti, privzeto lajf):
// - Lajf: vsi vnosi osebe, po mesecih, s stanjem ob koncu meseca (?oseba=).
// - Dolg: vsa odplačila (sin samo svoja, mama obeh sinov).
// - Avti: vsi servisi in popravila vseh avtov, po mesecih.

type Tab = "lajf" | "dolg" | "avti";
const TABS: { id: Tab; label: string; Icon: (p: SVGProps<SVGSVGElement>) => React.ReactNode }[] = [
  { id: "lajf", label: "Lajf", Icon: IconBasket },
  { id: "dolg", label: "Dolg", Icon: IconHandCoins },
  { id: "avti", label: "Avti", Icon: IconCar },
];

// Oznake kot v EntryDialog (KINDS je v "use client" modulu, strežnik ga ne more brati).
const KIND_LABEL: Record<string, string> = { nakup: "Nakup", placilo: "Plačilo mami", posojilo: "Posojilo" };

const CARD = "rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900";
const MONTH_HEAD =
  "flex items-center gap-2 border-b border-gray-100 px-4 py-2.5 font-semibold dark:border-gray-800";
const EMPTY = "p-5 text-center text-sm text-gray-500 dark:text-gray-400";

const fmtDay = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${Number(day)}. ${Number(m)}. ${y}`;
};

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ zavihek?: string; oseba?: string; mesecev?: string }>;
}) {
  const supabase = await createClient();
  const [user, params] = await Promise.all([getAuthUser(supabase), searchParams]);
  if (!user) return null;

  const tab: Tab = TABS.some((t) => t.id === params.zavihek) ? (params.zavihek as Tab) : "lajf";
  const { data: members } = await supabase
    .from("kvit_members")
    .select("user_id, display_name, role")
    .order("joined_at");
  if (!(members ?? []).some((m) => m.user_id === user.id)) return null; // layout pokaže Onboarding
  const isMama = (members ?? []).some((m) => m.user_id === user.id && m.role === "mama");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/" aria-label="Nazaj" className="rounded-md p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800">
          <IconArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold">Zgodovina</h1>
      </div>

      <nav className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
        {TABS.map(({ id, label, Icon }) => (
          <Link
            key={id}
            href={`/zgodovina?zavihek=${id}`}
            replace
            className={clsx(
              "flex min-w-0 flex-1 basis-0 items-center justify-center gap-1.5 rounded-md px-1.5 py-1.5 text-sm font-medium sm:px-3",
              id === tab
                ? "bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100"
                : "text-gray-500 dark:text-gray-400"
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        ))}
      </nav>

      {tab === "lajf" && <LajfHistory userId={user.id} personParam={params.oseba} />}
      {tab === "dolg" && <DebtHistory userId={user.id} isMama={isMama} members={members ?? []} />}
      {tab === "avti" && (
        <CarHistory limit={Math.max(MONTHS_STEP, Number(params.mesecev) || MONTHS_STEP)} />
      )}
    </div>
  );
}

// ——— Lajf ———

async function LajfHistory({ userId, personParam }: { userId: string; personParam?: string }) {
  const supabase = await createClient();
  const ledgers = await getLedgers(supabase, monthKey());
  if (ledgers.length === 0) return <p className={EMPTY}>Še ni obračunov.</p>;

  const sorted = [
    ...ledgers.filter((l) => l.member.user_id === userId),
    ...ledgers.filter((l) => l.member.user_id !== userId),
  ];
  const ledger = sorted.find((l) => l.member.user_id === personParam) ?? sorted[0];
  const months = [...ledger.rows].reverse();

  return (
    <div className="space-y-4">
      {sorted.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {sorted.map((l) => (
            <Link
              key={l.member.user_id}
              href={`/zgodovina?zavihek=lajf&oseba=${l.member.user_id}`}
              replace
              className={clsx(
                "rounded-full border px-3 py-1 text-sm",
                l === ledger
                  ? "border-rose-500 bg-rose-50 font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                  : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"
              )}
            >
              {l.member.display_name || "Brez imena"}
              {l.member.user_id === userId && " (jaz)"}
            </Link>
          ))}
        </div>
      )}

      {months.map((r) => {
        const entries = [...(ledger.entries.get(r.key) ?? [])].reverse();
        return (
          <section key={r.key} className={CARD}>
            <Link
              href={`/lajf?oseba=${ledger.member.user_id}&mesec=${r.key}`}
              className={clsx(MONTH_HEAD, "hover:bg-gray-50 dark:hover:bg-gray-800/60")}
            >
              <span className="flex-1">{monthLabel(r.key)}</span>
              {r.settled && <IconCheck className="h-4 w-4 text-emerald-500" />}
              <span
                className={clsx(
                  "text-sm tabular-nums",
                  r.balance > 0.004
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-emerald-600 dark:text-emerald-400"
                )}
              >
                {r.balance > 0.004 ? "za doplačilo " : r.balance < -0.004 ? "dobropis " : "kvit "}
                {Math.abs(r.balance) > 0.004 && formatEur(Math.abs(r.balance))}
              </span>
            </Link>
            {entries.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">Ni vnosov.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {entries.map((e) => {
                  const plus = e.kind === "posojilo";
                  const kind = KIND_LABEL[e.kind];
                  return (
                    <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{e.label || kind}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {[e.day && fmtDay(e.day), e.label && kind].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span
                        className={clsx(
                          "whitespace-nowrap text-sm font-semibold tabular-nums",
                          plus ? "text-rose-600 dark:text-rose-400" : "text-gray-900 dark:text-gray-100"
                        )}
                      >
                        {plus ? "+" : "−"}
                        {formatEur(e.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ——— Dolg ———

async function DebtHistory({
  userId,
  isMama,
  members,
}: {
  userId: string;
  isMama: boolean;
  members: { user_id: string; display_name: string; role: string }[];
}) {
  const supabase = await createClient();
  const debts = await getDebts(supabase);
  // Sin vidi samo svoj dolg, mama oba sinova.
  const people = members.filter((m) => m.role !== "mama" && (isMama || m.user_id === userId));
  const sections = people
    .map((m) => ({ member: m, debts: debts.filter((d) => d.user_id === m.user_id) }))
    .filter((s) => s.debts.length > 0);
  if (sections.length === 0) return <p className={EMPTY}>Ni vpisanega dolga.</p>;

  return (
    <div className="space-y-4">
      {sections.map(({ member, debts: own }) => {
        const payments = own
          .flatMap((d) => d.payments.map((p) => ({ ...p, debtLabel: d.label })))
          .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
        const remaining = own.reduce((a, d) => a + d.remaining, 0);
        return (
          <section key={member.user_id} className={CARD}>
            <h2 className={MONTH_HEAD}>
              <span className="flex-1">
                {isMama ? member.display_name || "Brez imena" : "Odplačila"}
              </span>
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                ostane <span className="font-semibold tabular-nums">{formatEur(remaining)}</span>
              </span>
            </h2>
            {payments.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">Še ni odplačil.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{fmtDay(p.day)}</p>
                      {(p.note || own.length > 1) && (
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {[own.length > 1 && p.debtLabel, p.note].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatEur(p.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ——— Avti ———

const MONTHS_STEP = 3; // Avti: zadnji 3 meseci, „Naloži več“ doda še 3 (?mesecev=)

async function CarHistory({ limit }: { limit: number }) {
  const supabase = await createClient();
  const cars = await getCars(supabase);
  const records = cars
    .flatMap((c) => c.records.map((r) => ({ ...r, carName: c.name })))
    .sort((a, b) => ((a.day ?? "") < (b.day ?? "") ? 1 : (a.day ?? "") > (b.day ?? "") ? -1 : 0));
  if (records.length === 0) return <p className={EMPTY}>Še ni vnosov za avte.</p>;

  // Po mesecih, najnovejši zgoraj; vnosi brez datuma na koncu.
  const groups = new Map<string, typeof records>();
  for (const r of records) {
    const key = r.day ? r.day.slice(0, 7) : "";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const all = [...groups];
  const shown = all.slice(0, limit);

  return (
    <div className="space-y-4">
      {/* Meseci so zložljivi (<details>, brez JS); odprt je samo najnovejši. */}
      {shown.map(([key, list], i) => (
        <details key={key || "brez"} open={i === 0} className={clsx(CARD, "group overflow-hidden")}>
          <summary className="flex cursor-pointer list-none items-center gap-2 border-gray-100 px-4 py-2.5 font-semibold hover:bg-gray-50 group-open:border-b dark:border-gray-800 dark:hover:bg-gray-800/60 [&::-webkit-details-marker]:hidden">
            <IconChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-gray-400 transition-transform group-open:rotate-0" />
            <span className="flex-1">{key ? monthLabel(key) : "Brez datuma"}</span>
            {list.some((r) => r.price) && (
              <span className="text-sm font-normal tabular-nums text-gray-500 dark:text-gray-400">
                {formatEur(list.reduce((a, r) => a + (r.price ?? 0), 0))}
              </span>
            )}
          </summary>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {list.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/avti?avto=${r.car_id}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {r.description.trim() || (r.kind === "servis" ? "Servis" : "Popravilo")}
                    </p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {[
                        r.day && fmtDay(r.day),
                        r.carName,
                        r.kind === "servis" ? "Servis" : "Popravilo",
                        r.km !== null && `${r.km.toLocaleString("sl-SI")} km`,
                        r.paid_by.trim() && `plačal ${r.paid_by.trim()}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {r.settled && <IconCheck className="h-4 w-4 shrink-0 text-emerald-500" />}
                  {r.price !== null && (
                    <span className="whitespace-nowrap text-sm font-semibold tabular-nums">
                      {formatEur(r.price)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ))}
      {all.length > shown.length && (
        <Link
          href={`/zgodovina?zavihek=avti&mesecev=${limit + MONTHS_STEP}`}
          replace
          scroll={false}
          className="block rounded-xl border border-gray-200 py-2.5 text-center text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/60"
        >
          Naloži več
        </Link>
      )}
    </div>
  );
}
