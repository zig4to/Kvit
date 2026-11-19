"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dropSsoTokens, takeSsoTokens } from "@/lib/sso";

/**
 * Prijava v ozadju iz huba (Bitneverse).
 *
 * Povezava do te aplikacije lahko nosi fragment
 * `#sb_at=<access_token>&sb_rt=<refresh_token>`. Ker middleware neprijavljene
 * obiskovalce preusmeri na `/login`, brskalnik ta fragment prenese sem (cilj
 * preusmeritve svojega fragmenta nima). Tu žetona zamenjamo za sejo —
 * `@supabase/ssr` browser klient zapiše piškotke `sb-<ref>-auth-token(.0/.1…)`,
 * ki jih bere isti strežniški klient v middleware — počistimo naslovno vrstico
 * in osvežimo usmerjevalnik; middleware ob tem vidi svežo sejo in nas z
 * `/login` preusmeri na `/`. Ob neuspehu (žeton preklican/potekel) ostane
 * običajni prijavni obrazec.
 */
export default function SsoBridge() {
  const router = useRouter();

  useEffect(() => {
    const sso = takeSsoTokens();
    if (!sso) return;

    let cancelled = false;
    createClient()
      .auth.setSession(sso)
      .then(({ error }) => {
        dropSsoTokens();
        if (cancelled || error) return;
        router.replace("/");
        router.refresh();
      })
      .catch(() => {
        dropSsoTokens();
        /* neveljaven žeton — ostane prijavni obrazec */
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
