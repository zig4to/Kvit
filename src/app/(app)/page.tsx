import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getLedgers, labelSuggestions } from "@/lib/data/kvit";
import { monthKey } from "@/lib/kvit/balance";
import MonthView from "@/components/kvit/MonthView";

// Mesec osebe (?oseba=<user_id>&mesec=2026-11); privzeto jaz in tekoči mesec.
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ oseba?: string; mesec?: string }>;
}) {
  const supabase = await createClient();
  const [user, params] = await Promise.all([getAuthUser(supabase), searchParams]);
  if (!user) return null;

  const current = monthKey();
  const ledgers = await getLedgers(supabase, current);
  const mine = ledgers.find((l) => l.member.user_id === user.id);
  if (!mine) return null; // layout pokaže Onboarding

  const ledger = ledgers.find((l) => l.member.user_id === params.oseba) ?? mine;
  const wanted = params.mesec && /^\d{4}-\d{2}$/.test(params.mesec) ? params.mesec : current;
  const index = Math.max(
    0,
    ledger.rows.findIndex((r) => r.key === wanted) === -1
      ? ledger.rows.findIndex((r) => r.key === current)
      : ledger.rows.findIndex((r) => r.key === wanted)
  );
  const row = ledger.rows[index];

  // Jaz najprej, nato ostali.
  const people = [mine, ...ledgers.filter((l) => l !== mine)].map((l) => ({
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
    />
  );
}
