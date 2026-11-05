import clsx from "@/lib/utils/clsx";

// Znak znamke avta, prepoznan po imenu modela (Passat → VW, Berlingo →
// Citroën, Megane → Renault). Poenostavljeni znaki, narisani v SVG (brez
// datotek); neznan avto dobi prvo črko na barvi aplikacije.

type Brand = "vw" | "citroen" | "renault";

const BRANDS: { brand: Brand; re: RegExp }[] = [
  { brand: "vw", re: /\b(vw|volkswagen|passat|golf|polo|touran|tiguan|caddy|sharan|up)\b/ },
  { brand: "citroen", re: /\b(citroen|berlingo|c[1-6]|xsara|picasso|jumpy|saxo)\b/ },
  { brand: "renault", re: /\b(renault|megane|clio|kangoo|scenic|twingo|laguna|captur|kadjar|espace)\b/ },
];

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function carBrand(name: string): Brand | null {
  const n = norm(name);
  return BRANDS.find((b) => b.re.test(n))?.brand ?? null;
}

export default function CarLogo({ name, className }: { name: string; className?: string }) {
  const brand = carBrand(name);
  const cls = clsx("flex-shrink-0", className ?? "h-5 w-5");

  if (brand === "vw")
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-label="Volkswagen" role="img">
        <circle cx="12" cy="12" r="12" fill="#001E50" />
        <circle cx="12" cy="12" r="10.2" fill="none" stroke="#fff" strokeWidth="1.2" />
        <g fill="none" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
          <path d="M8.1 3.6 12 11.4l3.9-7.8" />
          <path d="M3.6 8.6 7.7 18.9 12 13.1l4.3 5.8 4.1-10.3" />
        </g>
      </svg>
    );

  if (brand === "citroen")
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-label="Citroën" role="img">
        <rect width="24" height="24" rx="7" fill="#A6192E" />
        <g fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5.5 11.2 12 7.4l6.5 3.8" />
          <path d="M5.5 16.6 12 12.8l6.5 3.8" />
        </g>
      </svg>
    );

  if (brand === "renault")
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-label="Renault" role="img">
        <rect width="24" height="24" rx="7" fill="#FFCC33" />
        <g fill="none" stroke="#111" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M12 3.6 17.6 12 12 20.4 6.4 12Z" />
          <path d="M12 7.6 14.9 12 12 16.4 9.1 12Z" />
        </g>
      </svg>
    );

  return (
    <span
      className={clsx(
        cls,
        "inline-flex items-center justify-center rounded-md bg-gradient-to-br from-rose-500 to-violet-500 text-[0.6rem] font-bold uppercase text-white"
      )}
      aria-hidden="true"
    >
      {name.trim().charAt(0)}
    </span>
  );
}
