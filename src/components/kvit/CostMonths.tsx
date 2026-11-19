"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/Input";
import { saveHouseholdCostAction } from "@/actions/kvit";
import { amountInput, formatEur } from "@/lib/kvit/text";
import type { CostCategory } from "@/lib/types/database.types";

const MONTH_NAME = new Intl.DateTimeFormat("sl-SI", { month: "long", year: "numeric" });
const label = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  const s = MONTH_NAME.format(new Date(y, m - 1, 1));
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// Znesek kategorije po mesecih; shrani se ob zapustitvi polja (prazno = izbriši).
export default function CostMonths({
  category,
  months,
  values,
  liveKey,
}: {
  category: CostCategory;
  months: string[]; // YYYY-MM, najnovejši prvi
  values: Record<string, number>; // YYYY-MM → znesek
  liveKey?: string; // Hrana: ta mesec je živa vsota iz Cekarja (samo branje)
}) {
  const total = months.reduce((a, k) => a + (values[k] ?? 0), 0);
  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      {liveKey && (
        <p className="border-b border-gray-100 px-4 py-2.5 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
          Tekoči mesec se sproti posodablja iz Cekarja. Ob koncu meseca se zapiše končni znesek,
          ki ga lahko še popraviš.
        </p>
      )}
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {months.map((k) =>
          k === liveKey ? (
            <li key={k} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 text-sm">
                {label(k)}
                <span className="ml-1.5 text-xs text-gray-500 dark:text-gray-400">· iz Cekarja</span>
              </span>
              <span className="pr-1 text-sm font-semibold tabular-nums">{formatEur(values[k] ?? 0)}</span>
            </li>
          ) : (
            <Row key={`${category}-${k}-${values[k] ?? ""}`} category={category} month={k} value={values[k]} />
          )
        )}
      </ul>
      <div className="flex justify-between border-t border-gray-100 px-4 py-2.5 text-sm font-semibold dark:border-gray-800">
        <span>Skupaj ({months.length} mes.)</span>
        <span className="tabular-nums">{formatEur(total)}</span>
      </div>
    </div>
  );
}

function Row({ category, month, value }: { category: CostCategory; month: string; value?: number }) {
  const [text, setText] = useState(value === undefined ? "" : amountInput(value));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const save = () => {
    if (text === (value === undefined ? "" : amountInput(value))) return;
    setError(null);
    startTransition(async () => {
      const res = await saveHouseholdCostAction({ category, month, amount: text });
      if (res.error) setError(res.error);
    });
  };
  return (
    <li className="px-4 py-2">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 text-sm">{label(month)}</span>
        <div className="flex w-32 items-center gap-1">
          <Input
            inputMode="decimal"
            placeholder="0,00"
            aria-label={`${label(month)} — znesek`}
            value={text}
            disabled={pending}
            onChange={(e) => setText(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="text-right tabular-nums"
          />
          <span className="text-sm text-gray-500">€</span>
        </div>
      </div>
      {error && <p className="mt-1 text-right text-xs text-red-600 dark:text-red-400">{error}</p>}
    </li>
  );
}
