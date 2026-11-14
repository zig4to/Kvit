import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { sessionCookieOptions } from "./cookie-options";
import type { Database } from "@/lib/types/database.types";

// Uporabi v Server Components / Server Actions / Route Handlers.
export async function createClient() {
  const cookieStore = await cookies();
  const https = (await headers()).get("x-forwarded-proto") === "https";

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: sessionCookieOptions(https),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll je bil klican iz Server Component-a - proxy v tem
            // primeru že skrbi za osveževanje seje, zato je varno ignorirati.
          }
        },
      },
    }
  );
}
