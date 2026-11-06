import Link from "next/link";
import clsx from "@/lib/utils/clsx";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { firstName, getCarBalance, getDebts, getLedgers, getMembership } from "@/lib/data/kvit";
import MamaDashboard from "@/components/kvit/MamaDashboard";
import CarBalance from "@/components/kvit/CarBalance";
import { monthKey, monthLabel } from "@/lib/kvit/balance";
import { formatEur } from "@/lib/kvit/text";
import { IconBasket, IconCheck, IconChevronRight, IconHandCoins, IconInfo } from "@/components/ui/icons";

// Domača stran: vsak član vidi svoje kartice (podatki prijavljenega člana).
// 0. Aktualno — kdo komu dolguje za skupne avte (moj pogled) → /avti
// 1. Lajf — stanje tekočega meseca (za doplačilo / dobropis / kvit) → /lajf
// 2. Skupni dolg — preostanek dolga do mame in napredek odplačevanja → /dolg
export default async function HomePage() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return null;

  const current = monthKey();
  const [ledgers, debts, membership] = await Promise.all([
    getLedgers(supabase, current),
    getDebts(supabase),
    getMembership(supabase, user.id),
  ]);

  // Mama: nadzorna plošča (ledgers so samo sinovi).
  if (membership?.member.role === "mama") {
    const name = (l: (typeof ledgers)[number]) => l.member.display_name || "Brez imena";
    return (
      <MamaDashboard
        requests={ledgers.flatMap((l) =>
          [...l.months.values()]
            .filter((m) => m.settle_requested_at && !m.settled)
            .map((m) => ({ monthId: m.id, name: name(l), monthKey: m.month.slice(0, 7), amount: m.settle_amount ?? 0 }))
        )}
        months={ledgers.map((l) => {
          const r = l.rows.find((x) => x.key === current) ?? l.rows[l.rows.length - 1];
          return {
            userId: l.member.user_id,
            name: name(l),
            monthKey: r?.key ?? current,
            balance: r?.balance ?? 0,
            settled: r?.settled ?? false,
            pending: !!l.months.get(r?.key ?? current)?.settle_requested_at,
          };
        })}
        debts={ledgers.map((l) => {
          const own = debts.filter((d) => d.user_id === l.member.user_id);
          const total = own.reduce((a, d) => a + d.amount, 0);
          const paid = own.reduce((a, d) => a + d.paid, 0);
          return { userId: l.member.user_id, name: name(l), total, paid, remaining: Math.round((total - paid) * 100) / 100 };
        })}
      />
    );
  }

  const mine = ledgers.find((l) => l.member.user_id === user.id);
  if (!mine) return null; // layout pokaže Onboarding

  // Aktualno: neporavnani skupni stroški avtov in poravnave, ki čakajo na potrditev.
  const carBalance = await getCarBalance(supabase, firstName(mine.member.display_name));
  // Lajf
  const row = mine.rows.find((r) => r.key === current) ?? mine.rows[mine.rows.length - 1];
  const balance = row?.balance ?? 0;
  const status =
    balance > 0.004
      ? { label: "Za doplačilo", tone: "text-rose-600 dark:text-rose-400" }
      : balance < -0.004
        ? { label: "Dobropis", tone: "text-emerald-600 dark:text-emerald-400" }
        : { label: "Kvit", tone: "text-emerald-600 dark:text-emerald-400" };

  // Skupni dolg (vsi moji dolgovi skupaj)
  const myDebts = debts.filter((d) => d.user_id === user.id);
  const total = myDebts.reduce((a, d) => a + d.amount, 0);
  const paid = myDebts.reduce((a, d) => a + d.paid, 0);
  const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
  const progress = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
  const lastPayment = myDebts
    .flatMap((d) => d.payments)
    .sort((a, b) => (a.day < b.day ? 1 : -1))[0];

  return (
    <div className="space-y-3">
      <Card href="/avti" whole={false} accent icon={<IconInfo className="h-5 w-5" />} title="Aktualno" subtitle="Skupni stroški avtov">
        <div className="mt-3">
          <CarBalance balance={carBalance} />
        </div>
      </Card>

      <Card href="/lajf" icon={<IconBasket className="h-5 w-5" />} title="Lajf" subtitle={monthLabel(row?.key ?? current)}>
        <div className="mt-3 flex items-end justify-between gap-2">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{status.label}</p>
            <p className={clsx("text-3xl font-bold tabular-nums", status.tone)}>{formatEur(Math.abs(balance))}</p>
          </div>
          {row?.settled && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <IconCheck className="h-3.5 w-3.5" /> Poravnano
            </span>
          )}
        </div>
        {row && (
          <p className="mt-2 text-xs tabular-nums text-gray-500 dark:text-gray-400">
            Fiksni {formatEur(row.fixed)}
            {row.carryIn !== 0 && ` · prenos ${row.carryIn > 0 ? "+" : "−"}${formatEur(Math.abs(row.carryIn))}`}
            {row.deducted > 0 && ` · odšteto ${formatEur(row.deducted)}`}
            {row.added > 0 && ` · posojila ${formatEur(row.added)}`}
          </p>
        )}
      </Card>

      <Card href="/dolg" icon={<IconHandCoins className="h-5 w-5" />} title="Skupni dolg" subtitle="Dolg do mame">
        {myDebts.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Dolg še ni vpisan.</p>
        ) : (
          <>
            <div className="mt-3 flex items-end justify-between gap-2">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{remaining > 0 ? "Preostanek" : "Odplačano"}</p>
                <p
                  className={clsx(
                    "text-3xl font-bold tabular-nums",
                    remaining > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                  )}
                >
                  {formatEur(remaining > 0 ? remaining : total)}
                </p>
              </div>
              <p className="text-right text-xs tabular-nums text-gray-500 dark:text-gray-400">
                od {formatEur(total)}
                <br />
                odplačano {formatEur(paid)}
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
            </div>
            {lastPayment && (
              <p className="mt-2 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                Zadnje odplačilo {formatEur(lastPayment.amount)} ·{" "}
                {new Date(lastPayment.day + "T12:00:00").toLocaleDateString("sl-SI")}
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

// Kartica: privzeto je cela povezava; z whole={false} (gumbi v vsebini) je
// povezava samo glava.
function Card({
  href,
  whole = true,
  accent = false,
  icon,
  title,
  subtitle,
  children,
}: {
  href: string;
  whole?: boolean;
  /** Tanek rožnat rob (kartica Aktualno). */
  accent?: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const box = clsx(
    "block rounded-xl border bg-white p-4 transition dark:bg-gray-900",
    accent ? "border-rose-600 dark:border-rose-400" : "border-gray-200 dark:border-gray-800",
  );
  const hover = "hover:border-rose-300 hover:shadow-sm dark:hover:border-rose-800";
  const header = (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>
      <IconChevronRight className="h-5 w-5 text-gray-400" />
    </div>
  );
  return whole ? (
    <Link href={href} className={clsx(box, hover)}>
      {header}
      {children}
    </Link>
  ) : (
    <div className={box}>
      <Link href={href} className="-m-2 block rounded-lg p-2 hover:bg-gray-50 dark:hover:bg-gray-800/60">
        {header}
      </Link>
      {children}
    </div>
  );
}
