import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getMembership } from "@/lib/data/kvit";
import SsoHashCleanup from "@/components/auth/SsoHashCleanup";
import Onboarding from "@/components/kvit/Onboarding";
import { IconBasket, IconCar, IconHandCoins, IconHome, IconHandshake, IconHistory, IconSettings } from "@/components/ui/icons";

// Ogrodje aplikacije Kvit: zgornja vrstica (logo → domov, domov, lajf, dolg, avti, zgodovina, nastavitve), pod
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
      <header className="relative flex min-h-12 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 dark:border-gray-800 dark:bg-gray-900">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold text-rose-600 dark:text-rose-400"
        >
          <IconHandshake className="h-5 w-5" />
          Kvit
        </Link>
        {membership && (
          <nav className="flex items-center gap-1">
            {/* Glavni zavihki: na računalniku na sredini vrstice. */}
            <div className="flex items-center gap-1 sm:absolute sm:left-1/2 sm:-translate-x-1/2">
            <Link
              href="/"
              aria-label="Domov"
              className="flex items-center gap-1.5 rounded-md p-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <IconHome className="h-5 w-5" />
              <span className="hidden sm:inline">Domov</span>
            </Link>
            <Link
              href="/lajf"
              className="flex items-center gap-1.5 rounded-md p-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <IconBasket className="h-5 w-5" />
              Lajf
            </Link>
            <Link
              href="/dolg"
              className="flex items-center gap-1.5 rounded-md p-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <IconHandCoins className="h-5 w-5" />
              Dolg
            </Link>
            <Link
              href="/avti"
              className="flex items-center gap-1.5 rounded-md p-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <IconCar className="h-5 w-5" />
              Avti
            </Link>
            </div>
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
