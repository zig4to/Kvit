"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import clsx from "@/lib/utils/clsx";
import { IconEye, IconX } from "@/components/ui/icons";

// ZA TESTIRANJE: gumb „Mati“ v zgornji vrstici odpre predogled mamine domače
// strani (/?pogled=mama). V predogledu je obarvan („Predogled“ + X) in klik
// vrne na mojo domačo stran. Client komponenta, ker layout ne dobi searchParams.
export default function MamaPreviewToggle({ className }: { className: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const on = pathname === "/" && params.get("pogled") === "mama";
  return on ? (
    <Link
      href="/"
      aria-label="Zapri predogled mame"
      className={clsx(
        className,
        "bg-amber-100 text-amber-900 hover:bg-amber-200 hover:text-amber-950 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900 dark:hover:text-amber-100"
      )}
    >
      <IconEye className="h-5 w-5" />
      <span className="hidden sm:inline">Predogled: mama</span>
      <IconX className="h-4 w-4" />
    </Link>
  ) : (
    <Link href="/?pogled=mama" aria-label="Predogled mame" className={className}>
      <IconEye className="h-5 w-5" />
      <span className="hidden sm:inline">Mati</span>
    </Link>
  );
}
