"use client";

import { useState } from "react";
import { formatEur } from "@/lib/kvit/text";
import clsx from "@/lib/utils/clsx";

const SHORT = new Intl.DateTimeFormat("sl-SI", { month: "short" });
const LONG = new Intl.DateTimeFormat("sl-SI", { month: "long", year: "numeric" });
const date = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1);
};
const short = (key: string) => SHORT.format(date(key)).replace(".", "");
const long = (key: string) => {
  const s = LONG.format(date(key));
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const TOTAL = "Skupaj";
const EUR0 = new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

// Oznake skale: 0 … lep zgornji rob (korak 1/2/2,5/5 × 10^n), 4–5 oznak.
function niceTicks(max: number) {
  if (max <= 0) return [0, 10, 20, 30, 40];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let t = 0; t < max + step * 0.001; t += step) ticks.push(Math.round(t * 100) / 100);
  if (ticks[ticks.length - 1] < max) ticks.push(Math.round(ticks[ticks.length - 1] * 100 + step * 100) / 100);
  return ticks;
}

// Informativni stroški po mesecih: stolpci (vsota ali ena kategorija po
// filtru), izbrani mesec poudarjen. Hover / dotik / fokus pokaže mesec v
// vrstici nad grafom.
export default function CostChart({
  data,
  selectedKey,
}: {
  // najstarejši prvi; empty = mesec pred začetkom obračuna (prazno mesto)
  data: { key: string; total: number; parts: Record<string, number>; empty: boolean }[];
  selectedKey: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [filter, setFilter] = useState(TOTAL);
  const filters = [TOTAL, ...Object.keys(data.find((d) => !d.empty)?.parts ?? {})];
  const series = data.map((d) => ({
    key: d.key,
    empty: d.empty,
    total: filter === TOTAL ? d.total : (d.parts[filter] ?? 0),
  }));
  const shown =
    series.find((d) => d.key === (active ?? selectedKey) && !d.empty) ?? series[series.length - 1];
  const ticks = niceTicks(Math.max(...series.map((d) => d.total), 0));
  const top = ticks[ticks.length - 1];
  if (!shown) return null;

  return (
    <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Po mesecih
        </span>
        <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400" aria-live="polite">
          {long(shown.key)} ·{" "}
          <span className="font-semibold text-gray-900 dark:text-gray-100">{formatEur(shown.total)}</span>
          {" "}· {formatEur(shown.total / 3)} na osebo
        </span>
      </div>

      {/* Filter: skupni stroški ali ena kategorija. */}
      <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Filter grafa">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={f === filter}
            onClick={() => setFilter(f)}
            className={clsx(
              "whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-all",
              f === filter
                ? "bg-violet-600 text-white dark:bg-violet-500"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex gap-2" onMouseLeave={() => setActive(null)}>
        {/* Skala v € — prilagodi se najvišjemu znesku izbranega filtra. */}
        <div className="relative h-36 w-12 shrink-0 text-right text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2 transition-all duration-500"
              style={{ top: `${100 - (t / top) * 100}%` }}
            >
              {EUR0.format(t)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
        <div className="relative">
        {/* Mreža — recesivna, ena črta na oznako skale. */}
        {ticks.map((t) => (
          <div
            key={t}
            className={clsx(
              "pointer-events-none absolute inset-x-0 border-t transition-all duration-500",
              t === 0 ? "border-gray-300 dark:border-gray-700" : "border-dashed border-gray-200 dark:border-gray-800"
            )}
            style={{ top: `${100 - (t / top) * 100}%` }}
          />
        ))}
        <div className="flex h-36 items-end gap-2">
          {series.map((d) => {
            const isSel = d.key === selectedKey;
            const isActive = d.key === shown.key;
            if (d.empty) return <span key={d.key} className="flex-1" aria-hidden />;
            return (
              <button
                key={d.key}
                type="button"
                aria-label={`${long(d.key)}: ${formatEur(d.total)}`}
                onMouseEnter={() => setActive(d.key)}
                onFocus={() => setActive(d.key)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(d.key)}
                className="group relative flex h-full flex-1 items-end justify-center focus:outline-none"
              >
                <span
                  key={filter} // nov filter = stolpec znova zraste od spodaj
                  className={clsx(
                    // Ob prikazu in menjavi filtra stolpec zraste od spodaj (@starting-style).
                    "relative z-10 w-full max-w-10 origin-bottom rounded-t-md transition-[height,background-color,opacity,transform] duration-500 ease-out starting:scale-y-0",
                    isSel
                      ? "bg-gradient-to-t from-violet-600 to-violet-400"
                      : "bg-violet-400/35 dark:bg-violet-400/30",
                    isActive && !isSel && "bg-violet-400/60 dark:bg-violet-400/55",
                    "group-focus-visible:ring-2 group-focus-visible:ring-violet-500 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-white dark:group-focus-visible:ring-offset-gray-900"
                  )}
                  style={{ height: `${d.total > 0 ? Math.max(2, (d.total / top) * 100) : 0}%` }}
                />
              </button>
            );
          })}
        </div>
        </div>
        <div className="mt-1.5 flex gap-2">
          {data.map((d) => (
            <span
              key={d.key}
              className={clsx(
                "flex-1 text-center text-[11px] capitalize",
                d.empty
                  ? "text-gray-300 dark:text-gray-700"
                  : d.key === shown.key
                    ? "font-semibold text-gray-900 dark:text-gray-100"
                    : "text-gray-500 dark:text-gray-400"
              )}
            >
              {short(d.key)}
            </span>
          ))}
        </div>
        </div>
      </div>

      {/* Tabelarični pogled za bralnike zaslona. */}
      <table className="sr-only">
        <caption>Informativni stroški po mesecih · {filter}</caption>
        <thead>
          <tr>
            <th>Mesec</th>
            <th>Skupaj</th>
            <th>Na osebo</th>
          </tr>
        </thead>
        <tbody>
          {series.filter((d) => !d.empty).map((d) => (
            <tr key={d.key}>
              <td>{long(d.key)}</td>
              <td>{formatEur(d.total)}</td>
              <td>{formatEur(d.total / 3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
