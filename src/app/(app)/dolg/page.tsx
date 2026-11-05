import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getDebts } from "@/lib/data/kvit";
import DebtView from "@/components/kvit/DebtView";

// Dolg do mame (?oseba=<user_id>, privzeto jaz) — ločen od mesečnih stroškov.
export default async function DebtPage({
  searchParams,
}: {
  searchParams: Promise<{ oseba?: string }>;
}) {
  const supabase = await createClient();
  const [user, params] = await Promise.all([getAuthUser(supabase), searchParams]);
  if (!user) return null;

  const [{ data: members }, debts] = await Promise.all([
    supabase.from("kvit_members").select("user_id, display_name").order("joined_at"),
    getDebts(supabase),
  ]);
  const all = members ?? [];
  if (!all.some((m) => m.user_id === user.id)) return null; // layout pokaže Onboarding

  const personId = all.some((m) => m.user_id === params.oseba) ? params.oseba! : user.id;
  const people = [
    ...all.filter((m) => m.user_id === user.id),
    ...all.filter((m) => m.user_id !== user.id),
  ].map((m) => ({
    userId: m.user_id,
    name: m.display_name || "Brez imena",
    isMe: m.user_id === user.id,
  }));

  return (
    <DebtView
      people={people}
      personId={personId}
      debts={debts.filter((d) => d.user_id === personId)}
      editable={personId === user.id}
    />
  );
}
