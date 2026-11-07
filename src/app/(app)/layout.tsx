import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import MamaPreviewToggle from "@/components/kvit/MamaPreviewToggle";
import { getAuthUser } from "@/lib/supabase/auth";
import { canPreviewMama, getMembership } from "@/lib/data/kvit";
import SsoHashCleanup from "@/components/auth/SsoHashCleanup";
import Onboarding from "@/components/kvit/Onboarding";
import { IconBasket, IconCar, IconHandCoins, IconHome, IconHandshake, IconHistory, IconSettings } from "@/components/ui/icons";

const TABS = [
  { href: "/", label: "Domov", Icon: IconHome },
  { href: "/lajf", label: "Lajf", Icon: IconBasket },
  { href: "/dolg", label: "Dolg", Icon: IconHandCoins },
  { href: "/avti", label: "Avti", Icon: IconCar },
];

const HOVER =
  "rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200";
// Na telefonu: ikona nad majhnim napisom (ozko); na računalniku: ikona in napis v vrsti.
const TAB = `flex w-12 flex-col items-center gap-1 px-1 py-1.5 font-medium sm:w-auto sm:flex-row sm:gap-1.5 sm:p-2 ${HOVER}`;
const ICON_BTN = `flex items-center gap-1.5 p-2 text-sm font-medium ${HOVER}`;

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
      <header className="relative flex min-h-12 items-center justify-between gap-1 border-b border-gray-200 bg-white px-2 dark:border-gray-800 dark:bg-gray-900 sm:gap-2 sm:px-3">
        <Link
          href="/"
          className="flex shrink-0 flex-col items-center gap-1 px-1 py-1.5 font-semibold text-rose-600 dark:text-rose-400 sm:flex-row sm:gap-2 sm:p-1"
        >
          <IconHandshake className="h-5 w-5" />
          <span className="text-[10px] leading-none sm:text-base">Kvit</span>
        </Link>
        {membership && (
          <nav className="flex min-w-0 items-center gap-0.5 sm:gap-1">
            {/* Glavni zavihki: na telefonu ikona z napisom pod njo, na računalniku na sredini vrstice. */}
            <div className="flex items-center gap-0.5 sm:absolute sm:left-1/2 sm:-translate-x-1/2 sm:gap-1">
              {TABS.map(({ href, label, Icon }) => (
                <Link key={href} href={href} className={TAB}>
                  <Icon className="h-5 w-5" />
                  <span className="text-[10px] leading-none sm:text-sm">{label}</span>
                </Link>
              ))}
            </div>
            <Link href="/zgodovina" aria-label="Zgodovina" className={ICON_BTN}>
              <IconHistory className="h-5 w-5" />
              <span className="hidden sm:inline">Zgodovina</span>
            </Link>
            {/* ZA TESTIRANJE: predogled mamine domače strani (sin vidi, kar vidi mama). */}
            {canPreviewMama(membership.member) && (
              // Suspense: useSearchParams v client komponenti
              <Suspense fallback={null}>
                <MamaPreviewToggle className={ICON_BTN} />
              </Suspense>
            )}
            <Link href="/nastavitve" aria-label="Nastavitve" className={ICON_BTN}>
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
