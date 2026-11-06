"use client";

import { useState } from "react";
import clsx from "@/lib/utils/clsx";

// Zamegljeni zneski (npr. skupni dolg na domači strani), ki se razkrijejo s
// klikom in s ponovnim klikom spet skrijejo; ob vsakem nalaganju strani so
// spet skriti. Zamegli se vsak potomec z razredi
//   group-data-[shown=false]/reveal:blur-sm group-data-[shown=false]/reveal:select-none
// (glej HIDDEN v src/app/(app)/page.tsx — konstanta iz "use client" modula
// bi na strežniku postala referenca, ne niz), ostalo (oznake) ostane vidno.
// Klik ne sproži povezave okoli (kartica je cela povezava), zato div z
// role="button" — gumb znotraj <a> ni veljaven HTML.

export default function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const [shown, setShown] = useState(false);
  const toggle = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShown((s) => !s);
  };
  return (
    <div
      role="button"
      tabIndex={0}
      data-shown={shown}
      aria-pressed={shown}
      title={shown ? "Skrij znesek" : "Pokaži znesek"}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return; // Enter na notranjem gumbu
        if (e.key === "Enter" || e.key === " ") toggle(e);
      }}
      className={clsx(
        "group/reveal cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-rose-500",
        className
      )}
    >
      {children}
    </div>
  );
}
