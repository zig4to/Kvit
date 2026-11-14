import type { CookieOptionsWithName } from "@supabase/ssr";

// Piškotki s sejo morajo delovati tudi v iframe predogledu Klodija
// (klodi-ruby.vercel.app je druga stran kot ta aplikacija). Privzeti
// SameSite=Lax brskalnik v tujem iframe ne pošlje, zato strežnik ob vsakem
// kliku ne vidi prijave. SameSite=None zahteva Secure, ta pa HTTPS — na
// http://localhost ostanejo privzete nastavitve.
// Server actions so pred CSRF zaščitene s preverjanjem Origin (Next), v okvir
// pa aplikacijo sme vstaviti le Klodi (frame-ancestors v next.config.ts).
export function sessionCookieOptions(https: boolean): CookieOptionsWithName | undefined {
  return https ? { sameSite: "none", secure: true } : undefined;
}
