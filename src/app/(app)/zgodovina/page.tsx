import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getLedgers } from "@/lib/data/kvit";
import { monthKey, monthLabel } from "@/lib/kvit/balance";
import { formatEur } from "@/lib/kvit/text";
import { IconArrowLeft, IconCheck } from "@/components/ui/icons";

// Vsi meseci vseh članov, najnovejši zgoraj.
export default async function HistoryPage() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return null;
  const ledgers = await getLedgers(supabase, monthKey());
  const sorted = [
    ...ledgers.filter((l) => l.member.user_id === user.id),
    ...ledgers.filter((l) => l.member.user_id !== user.id),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/" aria-label="Nazaj" className="rounded-md p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800">
          <IconArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold">Zgodovina</h1>
      </div>
      <div className={sorted.length > 1 ? "grid gap-4 sm:grid-cols-2" : ""}>
        {sorted.map((l) => (
          <section
            key={l.member.user_id}
            className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
          >
            <h2 className="border-b border-gray-100 px-4 py-2.5 font-semibold dark:border-gray-800">
              {l.member.display_name || "Brez imena"}
              {l.member.user_id === user.id && <span className="font-normal text-gray-400"> (jaz)</span>}
            </h2>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {[...l.rows].reverse().map((r) => (
                <li key={r.key}>
                  <Link
                    href={`/?oseba=${l.member.user_id}&mesec=${r.key}`}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/60"
                  >
                    <span className="flex-1">{monthLabel(r.key)}</span>
                    {r.settled && <IconCheck className="h-4 w-4 text-emerald-500" />}
                    <span
                      className={
                        r.balance > 0.004
                          ? "font-semibold tabular-nums text-rose-600 dark:text-rose-400"
                          : "font-semibold tabular-nums text-emerald-600 dark:text-emerald-400"
                      }
                    >
                      {r.balance < -0.004 ? "dobropis " : ""}
                      {formatEur(Math.abs(r.balance))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
