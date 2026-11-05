import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getMembership } from "@/lib/data/kvit";
import SsoHashCleanup from "@/components/auth/SsoHashCleanup";
import Onboarding from "@/components/kvit/Onboarding";
import { IconHandshake, IconHistory, IconSettings } from "@/components/ui/icons";

// Ogrodje aplikacije Kvit: zgornja vrstica (logo → domov, zgodovina, nastavitve), pod
// njo drseča vsebina. Uporabnik brez gospodinjstva namesto vsebine vidi
// Onboarding (ustvari gospodinjstvo / pridruži se s kodo).
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  const membership = user ? await getMembership(supabase, user.id) : null;

  return (
    <div className="flex h-screen w-full flex-col">
      <SsoHashCleanup />
      <header className="flex min-h-12 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 dark:border-gray-800 dark:bg-gray-900">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold text-rose-600 dark:text-rose-400"
        >
          <IconHandshake className="h-5 w-5" />
          Kvit
        </Link>
        {membership && (
          <nav className="flex items-center gap-1">
            <Link
              href="/zgodovina"
              aria-label="Zgodovina"
              className="flex items-center gap-1.5 rounded-md p-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <IconHistory className="h-5 w-5" />
              <span className="hidden sm:inline">Zgodovina</span>
            </Link>
            <Link
              href="/nastavitve"
              aria-label="Nastavitve"
              className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <IconSettings className="h-5 w-5" />
            </Link>
          </nav>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <main className="mx-auto w-full max-w-xl px-4 py-5">
          {membership ? children : <Onboarding email={user?.email ?? null} />}
        </main>
      </div>
    </div>
  );
}
