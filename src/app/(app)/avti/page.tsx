import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { firstName, getCarBalance, getCars } from "@/lib/data/kvit";
import CarsView from "@/components/kvit/CarsView";
import { CARS_OPEN_COOKIE, parseOpen } from "@/lib/kvit/collapsed";

// Servisna evidenca avtov (?avto=<id>, privzeto prvi).
export default async function CarsPage({
  searchParams,
}: {
  searchParams: Promise<{ avto?: string }>;
}) {
  const supabase = await createClient();
  const [user, params, jar] = await Promise.all([getAuthUser(supabase), searchParams, cookies()]);
  if (!user) return null;

  const [{ data: members }, cars] = await Promise.all([
    supabase.from("kvit_members").select("user_id, display_name").order("joined_at"),
    getCars(supabase),
  ]);
  const me = (members ?? []).find((m) => m.user_id === user.id);
  if (!me) return null; // layout pokaže Onboarding
  const balance = await getCarBalance(supabase, firstName(me.display_name));

  // „Plačal“: prvo ime člana (Žiga Tomše → Žiga) — enako kot v starem Excelu.
  const memberNames = (members ?? []).map((m) => firstName(m.display_name)).filter(Boolean);

  return (
    <CarsView
      cars={cars}
      balance={balance}
      carId={params.avto ?? null}
      memberNames={memberNames}
      initialOpen={parseOpen(jar.get(CARS_OPEN_COOKIE)?.value)}
    />
  );
}
