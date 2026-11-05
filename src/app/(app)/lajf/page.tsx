import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getLedgers, labelSuggestions } from "@/lib/data/kvit";
import { monthKey } from "@/lib/kvit/balance";
import MonthView from "@/components/kvit/MonthView";

// /lajf — mesec osebe (?oseba=<user_id>&mesec=2026-11); privzeto jaz in tekoči mesec.
export default async function LajfPage({
  searchParams,
}: {
  searchParams: Promise<{ oseba?: string; mesec?: string }>;
}) {
  const supabase = await createClient();
  const [user, params] = await Promise.all([getAuthUser(supabase), searchParams]);
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
    />
  );
}
