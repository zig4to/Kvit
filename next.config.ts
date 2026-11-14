import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js privzeto blokira cross-origin zahteve do dev sredstev (_next/*),
  // zato brez tega telefon prek LAN IP-ja dobi HTML, JS pa se ne naloži in
  // gumbi/kliki ne delujejo. Dovolimo lokalno omrežje za `npm run dev`.
  allowedDevOrigins: ["**.trycloudflare.com", "192.168.*.*", "10.*.*.*", "**.ts.net"],

  // Server Actions prek tunela: origin (tunel) se ne ujema z x-forwarded-host (localhost).
  experimental: {
    serverActions: { allowedOrigins: ["*.trycloudflare.com", "*.ts.net"] },
  },

  // Skrij Next.js značko/indikator v spodnjem levem kotu med razvojem.
  // Napake pri prevajanju/izvajanju se še vedno prikažejo.
  devIndicators: false,

  // Piškotki s sejo so SameSite=None (src/lib/supabase/cookie-options.ts), da
  // prijava deluje v predogledu Klodija. Zato aplikacijo v okvir (iframe) sme
  // vstaviti le ona sama in Klodi — sicer bi jo lahko tuja stran prekrila
  // (clickjacking). Samo produkcija: dev strežnike vstavljata Klodi (tunel) in
  // Live Claude v zaganjalniku.
  async headers() {
    if (process.env.NODE_ENV !== "production") return [];
    return [
      {
        source: "/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self' https://klodi-ruby.vercel.app" }],
      },
    ];
  },

  // Ne generiraj samodejnih AGENTS.md / CLAUDE.md datotek ob build/dev.
  agentRules: false,
};

export default nextConfig;
