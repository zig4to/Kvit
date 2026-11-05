"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import { IconBasket, IconCheck, IconHandCoins, IconInfo } from "@/components/ui/icons";
import { confirmMonthAction, rejectMonthAction, type KvitResult } from "@/actions/kvit";
import { monthGenitive, monthLabel } from "@/lib/kvit/balance";
import { formatEur } from "@/lib/kvit/text";
import clsx from "@/lib/utils/clsx";

export type MamaRequest = { monthId: string; name: string; monthKey: string; amount: number };
export type MamaSonMonth = {
  userId: string;
  name: string;
  monthKey: string;
  balance: number;
  settled: boolean;
  pending: boolean;
};
export type MamaSonDebt = { userId: string; name: string; total: number; paid: number; remaining: number };

const CARD = "rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900";

// Nadzorna plošča za mamo: poravnave za potrditev (Aktualno), ta mesec obeh
// sinov in skupni dolg obeh sinov.
export default function MamaDashboard({
  requests,
  months,
  debts,
}: {
  requests: MamaRequest[];
  months: MamaSonMonth[];
  debts: MamaSonDebt[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  // Ko sin klikne „Poravnaj“, se prošnja pokaže takoj.
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };
    const channel = supabase.channel("kvit-mama");
    for (const table of ["kvit_months", "kvit_entries", "kvit_debts", "kvit_debt_payments"])
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  const run = (fn: () => Promise<KvitResult>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res.error) setError(res.error);
    });

  return (
    <div className="space-y-3">
      <section className={CARD}>
        <Header icon={<IconInfo className="h-5 w-5" />} title="Aktualno" subtitle="Plačila za potrditev" />
        <div className="mt-3 space-y-2">
          {requests.length === 0 ? (
            <p className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
              <IconCheck className="h-4 w-4" /> Ni plačil za potrditev
            </p>
          ) : (
            requests.map((r) => (
              <div
                key={r.monthId}
                className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40"
              >
                <p className="text-sm text-emerald-900 dark:text-emerald-200">
                  {r.amount > 0 ? (
                    <>
                      <span className="font-semibold">{r.name}</span> pravi, da ti je plačal{" "}
                      <span className="font-bold tabular-nums">{formatEur(r.amount)}</span> za stroške{" "}
                      {monthGenitive(r.monthKey)}.
                    </>
                  ) : (
                    <>
                      <span className="font-semibold">{r.name}</span> je {monthLabel(r.monthKey)} označil kot
                      poravnan (nič za doplačilo).
                    </>
                  )}
                </p>
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="secondary" disabled={busy} onClick={() => run(() => rejectMonthAction(r.monthId))}>
                    Zavrni
                  </Button>
                  <Button disabled={busy} onClick={() => run(() => confirmMonthAction(r.monthId))}>
                    <IconCheck /> Potrdi
                  </Button>
                </div>
              </div>
            ))
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
      </section>

      <section className={CARD}>
        <Header
          icon={<IconBasket className="h-5 w-5" />}
          title="Ta mesec"
          subtitle={months[0] ? monthLabel(months[0].monthKey) : "Mesečni stroški"}
        />
        <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
          {months.map((m) => {
            const owes = m.balance > 0.004;
            const status = m.settled
              ? { text: "Plačano", tone: "text-emerald-600 dark:text-emerald-400" }
              : m.pending
                ? { text: "Čaka na tvojo potrditev", tone: "text-amber-600 dark:text-amber-400" }
                : owes
                  ? { text: `Še ni plačal · ${formatEur(m.balance)}`, tone: "text-rose-600 dark:text-rose-400" }
                  : { text: m.balance < -0.004 ? `Dobropis ${formatEur(-m.balance)}` : "Kvit", tone: "text-emerald-600 dark:text-emerald-400" };
            return (
              <li key={m.userId}>
                <Link
                  href={`/lajf?oseba=${m.userId}&mesec=${m.monthKey}`}
                  className="-mx-2 flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/60"
                >
                  <span className="font-medium">{m.name}</span>
                  <span className={clsx("flex items-center gap-1 text-sm font-semibold tabular-nums", status.tone)}>
                    {m.settled && <IconCheck className="h-4 w-4" />}
                    {status.text}
                  </span>
                </Link>
              </li>
            );
          })}
          {months.length === 0 && <li className="py-2 text-sm text-gray-500">Noben sin se še ni pridružil.</li>}
        </ul>
      </section>

      <section className={CARD}>
        <Header icon={<IconHandCoins className="h-5 w-5" />} title="Skupni dolg" subtitle="Dolg obeh sinov" />
        <ul className="mt-3 space-y-3">
          {debts.map((d) => (
            <li key={d.userId}>
              <Link href={`/dolg?oseba=${d.userId}`} className="-mx-2 block rounded-lg px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{d.name}</span>
                  {d.total > 0 ? (
                    <span className="text-sm tabular-nums">
                      <span className={clsx("font-bold", d.remaining > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
                        {d.remaining > 0 ? formatEur(d.remaining) : "Odplačano"}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400"> / {formatEur(d.total)}</span>
                    </span>
                  ) : (
                    <span className="text-sm text-gray-500 dark:text-gray-400">ni vpisan</span>
                  )}
                </div>
                {d.total > 0 && (
                  <>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (d.paid / d.total) * 100)}%` }} />
                    </div>
                    <p className="mt-1 text-xs tabular-nums text-gray-500 dark:text-gray-400">Odplačano {formatEur(d.paid)}</p>
                  </>
                )}
              </Link>
            </li>
          ))}
          {debts.length > 1 && (
            <li className="flex justify-between border-t border-gray-100 pt-2 text-sm dark:border-gray-800">
              <span className="text-gray-500 dark:text-gray-400">Skupaj še</span>
              <span className="font-bold tabular-nums">{formatEur(debts.reduce((a, d) => a + Math.max(0, d.remaining), 0))}</span>
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function Header({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>
    </div>
  );
}
