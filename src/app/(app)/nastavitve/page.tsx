import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getMembership } from "@/lib/data/kvit";
import Settings from "@/components/kvit/Settings";

export default async function SettingsPage() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return null;
  const [membership, { data: members }] = await Promise.all([
    getMembership(supabase, user.id),
    supabase.from("kvit_members").select("*").order("joined_at"),
  ]);
  if (!membership) return null;
  return (
    <Settings
      email={user.email}
      membership={membership}
      members={(members ?? []).map((m) => ({ ...m, monthly_amount: Number(m.monthly_amount) }))}
    />
  );
}
