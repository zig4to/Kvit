import { createBrowserClient } from "@supabase/ssr";
import { sessionCookieOptions } from "./cookie-options";
import type { Database } from "@/lib/types/database.types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: sessionCookieOptions(typeof location !== "undefined" && location.protocol === "https:") }
  );
}
