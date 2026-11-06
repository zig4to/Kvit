"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import { IconCheck, IconChevronDown, IconPlus } from "@/components/ui/icons";
import ExpenseDialog from "@/components/kvit/ExpenseDialog";
import {
  confirmCarSettlementAction,
  rejectCarSettlementAction,
  settleCarsAction,
  type KvitResult,
} from "@/actions/kvit";
import { dative } from "@/lib/kvit/cars";
import { formatEur } from "@/lib/kvit/text";
import type { CarBalance as Balance, CarReason } from "@/lib/data/kvit";
import type { KvitSharedExpense } from "@/lib/types/database.types";

// Kdo komu dolguje za skupne avte — iz pogleda prijavljenega člana — s
// poravnavo s potrditvijo: dolžnik klikne „Poravnaj“ → plačilo čaka, upnik ga
// potrdi (vnosi postanejo poravnani) ali zavrne. Na domači strani (Aktualno)
// in na vrhu /avti (oboje z `collapsible`: razlogi in Poravnaj pod črto so zloženi).
export default function CarBalance({
  balance,
  collapsible = false,
  names,
}: {
  balance: Balance;
  collapsible?: boolean;
  /** Imena članov — z njimi se pokaže „Dodaj strošek“ in urejanje stroškov. */
  names?: string[];
}) {
  const router = useRouter();
  const { myName, owed, reasons, pending } = balance;
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  // Dialog skupnega stroška: null = zaprt, "nov" = dodaj, sicer urejanje.
  const [expense, setExpense] = useState<KvitSharedExpense | "nov" | null>(null);
  const onEdit = names ? (e: KvitSharedExpense) => setExpense(e) : undefined;

  // Bratova poravnava/potrditev se pokaže takoj.
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };
    const channel = supabase
      .channel("kvit-car-balance")
      .on("postgres_changes", { event: "*", schema: "public", table: "kvit_car_settlements" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "kvit_car_records" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "kvit_shared_expenses" }, refresh)
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  const run = (fn: () => Promise<KvitResult>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res.error) setError(res.error);
      setConfirm(false);
    });

  const iOwe = owed.filter((o) => o.from === myName);
  const owedToMe = owed.filter((o) => o.to === myName);
  const others = owed.filter((o) => o.from !== myName && o.to !== myName);

  const owedLines = (
    <div className="min-w-0 flex-1 space-y-1">
      {iOwe.map((o) => (
        <p key={o.to} className="text-base">
          {dative(o.to)} dolguješ{" "}
          <span className="font-bold tabular-nums text-rose-600 dark:text-rose-400">{formatEur(o.amount)}</span>
        </p>
      ))}
      {owedToMe.map((o) => (
        <p key={o.from} className="text-base font-semibold text-emerald-600 dark:text-emerald-400">
          {o.from} ti dolguje <span className="font-bold tabular-nums">{formatEur(o.amount)}</span>
        </p>
      ))}
      {others.map((o) => (
        <p key={o.from + o.to} className="text-base">
          {o.from} dolguje {dative(o.to)}{" "}
          <span className="font-bold tabular-nums">{formatEur(o.amount)}</span>
        </p>
      ))}
    </div>
  );

  const settle = confirm ? (
    <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-sm">
      <span className="mr-auto">
        {iOwe.length > 0
          ? `Si plačal ${iOwe.map((o) => `${dative(o.to)} ${formatEur(o.amount)}`).join(", ")}? ${iOwe
              .map((o) => o.to)
              .join(" in ")} mora plačilo še potrditi.`
          : "Si dobil denar? Vsi odprti vnosi se označijo kot poravnani."}
      </span>
      <Button variant="secondary" onClick={() => setConfirm(false)}>
        Prekliči
      </Button>
      <Button disabled={busy} onClick={() => run(settleCarsAction)}>
        {iOwe.length > 0 ? "Da, plačal sem" : "Poravnaj"}
      </Button>
    </div>
  ) : (
    <Button variant="secondary" className="mt-3 w-full" onClick={() => setConfirm(true)}>
      <IconCheck /> Poravnaj
    </Button>
  );

  const addButton = names && (
    <>
      <Button variant="secondary" className="w-full" onClick={() => setExpense("nov")}>
        <IconPlus /> Dodaj strošek
      </Button>
      <ExpenseDialog
        open={expense !== null}
        onClose={() => setExpense(null)}
        expense={expense === "nov" ? undefined : (expense ?? undefined)}
        myName={myName}
        names={names}
      />
    </>
  );

  if (owed.length === 0 && pending.length === 0) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
          <IconCheck className="h-4 w-4" /> Vse poravnano
        </p>
        {addButton}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pending.map((p) =>
        p.to_name === myName ? (
          <div key={p.id} className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
            <p className="text-sm text-emerald-900 dark:text-emerald-200">
              <span className="font-semibold">{p.from_name}</span> pravi, da ti je plačal{" "}
              <span className="font-bold tabular-nums">{formatEur(p.amount)}</span>.
            </p>
            <Reasons reasons={p.reasons} myName={myName} collapsible={collapsible} />
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => run(() => rejectCarSettlementAction(p.id))}>
                Zavrni
              </Button>
              <Button disabled={busy} onClick={() => run(() => confirmCarSettlementAction(p.id))}>
                <IconCheck /> Potrdi
              </Button>
            </div>
          </div>
        ) : p.from_name === myName ? (
          <div key={p.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
            <p className="text-sm text-amber-900 dark:text-amber-200">
              Plačal si {dative(p.to_name)} <span className="font-bold tabular-nums">{formatEur(p.amount)}</span> —{" "}
              čaka na potrditev ({p.to_name}).
            </p>
            <Reasons reasons={p.reasons} myName={myName} collapsible={collapsible} />
            <div className="mt-2 flex justify-end">
              <Button variant="secondary" disabled={busy} onClick={() => run(() => rejectCarSettlementAction(p.id))}>
                Prekliči
              </Button>
            </div>
          </div>
        ) : (
          <p key={p.id} className="text-sm text-gray-600 dark:text-gray-400">
            {p.from_name} je plačal {dative(p.to_name)} {formatEur(p.amount)} — čaka na potrditev.
          </p>
        )
      )}

      {owed.length > 0 && (
        <div>
          {collapsible ? (
            // Zneski z drobno puščico desno; razlogi in Poravnaj pod črto so zloženi.
            <details className="group">
              <summary className="flex cursor-pointer list-none items-start gap-2 [&::-webkit-details-marker]:hidden">
                {owedLines}
                <IconChevronDown
                  aria-label="Podrobnosti"
                  className="mt-1 h-5 w-5 flex-shrink-0 text-rose-500 transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="mt-2 border-t border-black/5 pt-2 dark:border-white/10">
                <ReasonList reasons={reasons} myName={myName} className="" onEdit={onEdit} />
                {settle}
              </div>
            </details>
          ) : (
            <>
              {owedLines}
              <Reasons reasons={reasons} myName={myName} collapsible={false} onEdit={onEdit} />
              {settle}
            </>
          )}
        </div>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {addButton}
    </div>
  );
}

function Reasons({
  reasons,
  myName,
  collapsible,
  onEdit,
}: {
  reasons: CarReason[];
  myName: string;
  collapsible: boolean;
  onEdit?: (e: KvitSharedExpense) => void;
}) {
  if (reasons.length === 0) return null;
  if (collapsible) {
    return (
      <Details count={reasons.length}>
        <ReasonList reasons={reasons} myName={myName} className="" />
      </Details>
    );
  }
  return (
    <ReasonList
      reasons={reasons}
      myName={myName}
      onEdit={onEdit}
      className="mt-2 border-t border-black/5 pt-2 dark:border-white/10"
    />
  );
}

// Vse pod črto (razlogi, gumb Poravnaj) zloženo; odpre se s klikom.
function Details({ count, children }: { count: number; children: React.ReactNode }) {
  return (
    <details className="group mt-2 border-t border-black/5 pt-2 dark:border-white/10">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 [&::-webkit-details-marker]:hidden">
        <IconChevronDown className="h-4 w-4 -rotate-90 transition-transform group-open:rotate-0" />
        Podrobnosti{count > 0 && ` (${count})`}
      </summary>
      <div className="mt-1.5">{children}</div>
    </details>
  );
}

// Klik na skupni strošek (z onEdit) ga odpre za urejanje; vnosi avtov se urejajo na /avti.
function ReasonList({
  reasons,
  myName,
  className,
  onEdit,
}: {
  reasons: CarReason[];
  myName: string;
  className: string;
  onEdit?: (e: KvitSharedExpense) => void;
}) {
  const me = (n: string) => (n === myName ? "ti" : n);
  return (
    <ul className={`space-y-0.5 text-sm text-gray-600 dark:text-gray-400 ${className}`}>
      {reasons.map((x) => {
        const body = (
          <>
            <span className="min-w-0">
              {x.text}
              {x.car && ` · ${x.car}`}
              <span className="text-gray-400 dark:text-gray-500"> · plačal {me(x.paidBy)}</span>
            </span>
            <span className="flex-shrink-0 tabular-nums">
              {formatEur(x.price)}{" "}
              <span className="text-gray-400 dark:text-gray-500">
                ({x.owedBy ? `${me(x.owedBy)} ${formatEur(x.share)}` : `pol ${formatEur(x.share)}`})
              </span>
            </span>
          </>
        );
        const exp = x.expense;
        return (
          <li key={x.id}>
            {exp && onEdit ? (
              <button
                type="button"
                onClick={() => onEdit(exp)}
                className="-mx-1 flex w-[calc(100%+0.5rem)] justify-between gap-2 rounded px-1 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {body}
              </button>
            ) : (
              <div className="flex justify-between gap-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
