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
  const max = Math.max(...series.map((d) => d.total), 1);
  if (!shown) return null;

  return (
    <div className="mt-3 border-t border-amber-300 pt-3 dark:border-amber-700/60">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide">Po mesecih</span>
        <span className="text-xs tabular-nums" aria-live="polite">
          {long(shown.key)} · <span className="font-semibold">{formatEur(shown.total)}</span>
          <span className="opacity-70"> · {formatEur(shown.total / 3)} na osebo</span>
        </span>
      </div>

      {/* Filter: skupni stroški ali ena kategorija. */}
      <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Filter grafa">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={f === filter}
            onClick={() => setFilter(f)}
            className={clsx(
              "whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              f === filter
                ? "border-amber-600 bg-amber-600 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-amber-950"
                : "border-amber-300 hover:bg-amber-100 dark:border-amber-700/60 dark:hover:bg-amber-900/40"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="relative" onMouseLeave={() => setActive(null)}>
        {/* Vodilna črta na polovici najvišjega stolpca — recesivna. */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-amber-300/70 dark:border-amber-700/40" />
        <div className="flex h-28 items-end gap-1.5 border-b border-amber-300 dark:border-amber-700/60">
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
                  className={clsx(
                    "w-full max-w-9 rounded-t-[4px] transition-all duration-300",
                    isSel
                      ? "bg-gradient-to-t from-amber-600 to-amber-500 dark:from-amber-500 dark:to-amber-300"
                      : "bg-amber-600/45 dark:bg-amber-400/40",
                    isActive && !isSel && "bg-amber-600/70 dark:bg-amber-400/65",
                    "group-focus-visible:ring-2 group-focus-visible:ring-amber-600 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-amber-50 dark:group-focus-visible:ring-offset-amber-950"
                  )}
                  style={{ height: `${Math.max(3, (d.total / max) * 100)}%` }}
                />
              </button>
            );
          })}
        </div>
        <div className="mt-1 flex gap-1.5">
          {data.map((d) => (
            <span
              key={d.key}
              className={clsx(
                "flex-1 text-center text-[11px] capitalize",
                d.empty ? "opacity-35" : d.key === shown.key ? "font-semibold" : "opacity-70"
              )}
            >
              {short(d.key)}
            </span>
          ))}
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
