"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import PromptDialog from "@/components/ui/PromptDialog";
import EntryDialog, { KINDS } from "@/components/kvit/EntryDialog";
import { IconCheck, IconChevronLeft, IconChevronRight, IconPencil, IconPlus } from "@/components/ui/icons";
import {
  addMonthAction,
  setFixedAmountAction,
  setMonthNoteAction,
  settleMonthAction,
  unsettleMonthAction,
} from "@/actions/kvit";
import { addMonths, monthGenitive, monthLabel, type LedgerRow } from "@/lib/kvit/balance";
import { amountInput, formatEur, parseAmount } from "@/lib/kvit/text";
import type { KvitEntry } from "@/lib/types/database.types";
import clsx from "@/lib/utils/clsx";

export type PersonTab = { userId: string; name: string; isMe: boolean };

type Prompt = {
  title: string;
  label: string;
  initialValue: string;
  allowEmpty?: boolean;
  onSubmit: (v: string) => Promise<{ error?: string }>;
};

// Mesec ene osebe kot v starem Excelu: fiksni znesek, prenos, vnosi in na
// vrhu „Za doplačilo“. Svoj mesec urejaš, bratovega samo gledaš.
export default function MonthView({
  people,
  personId,
  row,
  prevKey,
  nextKey,
  entries,
  note,
  editable,
  suggestions,
}: {
  people: PersonTab[];
  personId: string;
  row: LedgerRow;
  prevKey: string | null; // obstoječi prejšnji mesec v obračunu
  nextKey: string | null;
  entries: KvitEntry[];
  note: string | null;
  editable: boolean;
  suggestions: string[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ entry: KvitEntry | null } | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [confirmSettle, setConfirmSettle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Vnosi drugega člana se pokažejo sami.
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };
    const channel = supabase
      .channel("kvit-ledger")
      .on("postgres_changes", { event: "*", schema: "public", table: "kvit_entries" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "kvit_months" }, refresh)
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  const href = (key: string, person = personId) => `/?oseba=${person}&mesec=${key}`;

  const run = (action: () => Promise<{ error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res.error) setError(res.error);
    });
  };

  const { balance } = row;
  const status =
    balance > 0.004
      ? { label: "Za doplačilo", tone: "text-rose-600 dark:text-rose-400" }
      : balance < -0.004
        ? { label: "Dobropis za naslednji mesec", tone: "text-emerald-600 dark:text-emerald-400" }
        : { label: "Kvit", tone: "text-emerald-600 dark:text-emerald-400" };

  const prevGen = monthGenitive(addMonths(row.key, -1));

  return (
    <div className="space-y-4 pb-24">
      {people.length > 1 && (
        <div
          className="grid gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800"
          style={{ gridTemplateColumns: `repeat(${people.length}, minmax(0, 1fr))` }}
        >
          {people.map((p) => (
            <Link
              key={p.userId}
              href={href(row.key, p.userId)}
              className={clsx(
                "truncate rounded-md py-1.5 text-center text-sm font-medium",
                p.userId === personId
                  ? "bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100"
                  : "text-gray-500 dark:text-gray-400"
              )}
            >
              {p.name}
              {p.isMe && <span className="font-normal text-gray-400"> (jaz)</span>}
            </Link>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {prevKey ? (
          <Link href={href(prevKey)} aria-label="Prejšnji mesec" className="rounded-md p-2 hover:bg-gray-100 dark:hover:bg-gray-800">
            <IconChevronLeft className="h-5 w-5" />
          </Link>
        ) : editable ? (
          <button
            type="button"
            title="Dodaj prejšnji mesec (za vnos zgodovine)"
            aria-label="Dodaj prejšnji mesec"
            disabled={pending}
            onClick={() => run(() => addMonthAction(addMonths(row.key, -1)))}
            className="rounded-md p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <IconChevronLeft className="h-5 w-5" />
          </button>
        ) : (
          <span className="w-9" />
        )}
        <h1 className="text-lg font-semibold">{monthLabel(row.key)}</h1>
        {nextKey ? (
          <Link href={href(nextKey)} aria-label="Naslednji mesec" className="rounded-md p-2 hover:bg-gray-100 dark:hover:bg-gray-800">
            <IconChevronRight className="h-5 w-5" />
          </Link>
        ) : (
          <span className="w-9" />
        )}
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5 text-center dark:border-gray-800 dark:bg-gray-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">{status.label}</p>
        <p className={clsx("mt-1 text-4xl font-bold tabular-nums", status.tone)}>
          {formatEur(Math.abs(balance))}
        </p>
        {row.settled && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <IconCheck className="h-3.5 w-3.5" /> Mesec poravnan
          </p>
        )}

        <dl className="mt-4 space-y-1.5 border-t border-gray-100 pt-3 text-left text-sm dark:border-gray-800">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-gray-500 dark:text-gray-400">Fiksni stroški</dt>
            <dd className="flex items-center gap-1 tabular-nums">
              {formatEur(row.fixed)}
              {editable && (
                <button
                  type="button"
                  aria-label="Spremeni fiksni znesek"
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
                  onClick={() =>
                    setPrompt({
                      title: `Fiksni stroški · ${monthLabel(row.key)}`,
                      label: "Znesek (€)",
                      initialValue: amountInput(row.fixed),
                      onSubmit: async (v) => {
                        const n = parseAmount(v);
                        if (n === null || Number.isNaN(n)) return { error: "Vpiši znesek." };
                        return setFixedAmountAction(row.key, n);
                      },
                    })
                  }
                >
                  <IconPencil className="h-3.5 w-3.5" />
                </button>
              )}
            </dd>
          </div>
          {Math.abs(row.carryIn) > 0.004 && (
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500 dark:text-gray-400">
                {row.carryIn > 0 ? `Prenos dolga iz ${prevGen}` : `Dobropis iz ${prevGen}`}
              </dt>
              <dd className="tabular-nums">
                {row.carryIn > 0 ? "+" : "−"}
                {formatEur(Math.abs(row.carryIn))}
              </dd>
            </div>
          )}
          {row.added > 0 && (
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500 dark:text-gray-400">Posojila</dt>
              <dd className="tabular-nums">+{formatEur(row.added)}</dd>
            </div>
          )}
          {row.deducted > 0 && (
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500 dark:text-gray-400">Nakupi in plačila</dt>
              <dd className="tabular-nums">−{formatEur(row.deducted)}</dd>
            </div>
          )}
        </dl>
      </section>

      {(note || editable) && (
        <button
          type="button"
          disabled={!editable}
          onClick={() =>
            setPrompt({
              title: "Opomba meseca",
              label: "Opomba",
              initialValue: note ?? "",
              allowEmpty: true,
              onSubmit: (v) => setMonthNoteAction(row.key, v),
            })
          }
          className={clsx(
            "w-full rounded-lg px-3 py-2 text-left text-sm",
            note
              ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
              : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          )}
        >
          {note || "+ Opomba (npr. cel mesec odsoten)"}
        </button>
      )}

      <section className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {entries.length === 0 ? (
          <p className="p-5 text-center text-sm text-gray-500 dark:text-gray-400">
            {editable ? "Še ni vnosov. Dodaj nakup ali plačilo z gumbom spodaj." : "Še ni vnosov."}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {entries.map((e) => {
              const plus = e.kind === "posojilo";
              const content = (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {e.label || KINDS.find((k) => k.id === e.kind)?.label}
                    </p>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {e.kind !== "nakup" && (
                        <span
                          className={clsx(
                            "rounded px-1.5 py-px font-medium",
                            plus
                              ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                              : "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                          )}
                        >
                          {KINDS.find((k) => k.id === e.kind)?.label}
                        </span>
                      )}
                      {e.proof && (
                        <span className="rounded bg-gray-100 px-1.5 py-px dark:bg-gray-800">
                          {e.proof === "racun" ? "Račun" : "Potrdilo"}
                        </span>
                      )}
                      {e.day && <span>{Number(e.day.slice(8, 10))}. {monthLabel(row.key, false).toLowerCase().slice(0, 3)}</span>}
                    </p>
                  </div>
                  <span
                    className={clsx(
                      "whitespace-nowrap text-sm font-semibold tabular-nums",
                      plus ? "text-rose-600 dark:text-rose-400" : "text-gray-900 dark:text-gray-100"
                    )}
                  >
                    {plus ? "+" : "−"}
                    {formatEur(e.amount)}
                  </span>
                </>
              );
              return (
                <li key={e.id}>
                  {editable ? (
                    <button
                      type="button"
                      onClick={() => setDialog({ entry: e })}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60"
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-2.5">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {editable &&
        (row.settled ? (
          <div className="text-center">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => unsettleMonthAction(row.key))}
              className="text-xs text-gray-500 hover:underline dark:text-gray-400"
            >
              Prekliči poravnavo
            </button>
          </div>
        ) : confirmSettle ? (
          <div className="space-y-2 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800">
            <p>
              {balance > 0.004
                ? `Zapišem plačilo ${formatEur(balance)} mami in označim mesec kot poravnan?`
                : "Označim mesec kot poravnan?"}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmSettle(false)}>
                Prekliči
              </Button>
              <Button
                disabled={pending}
                onClick={() => {
                  setConfirmSettle(false);
                  run(() => settleMonthAction(row.key, balance));
                }}
              >
                Poravnaj
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => setConfirmSettle(true)}>
            <IconCheck /> Poravnaj mesec
          </Button>
        ))}

      {editable && (
        <button
          type="button"
          onClick={() => setDialog({ entry: null })}
          className="fixed bottom-6 right-1/2 z-40 flex translate-x-1/2 items-center gap-2 rounded-full bg-gradient-to-br from-rose-500 to-violet-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 hover:brightness-110"
        >
          <IconPlus className="h-5 w-5" /> Dodaj
        </button>
      )}

      <EntryDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        monthKey={row.key}
        entry={dialog?.entry ?? null}
        suggestions={suggestions}
      />
      <PromptDialog
        open={prompt !== null}
        onClose={() => setPrompt(null)}
        title={prompt?.title ?? ""}
        label={prompt?.label ?? ""}
        initialValue={prompt?.initialValue ?? ""}
        allowEmpty={prompt?.allowEmpty}
        onSubmit={(v) => prompt?.onSubmit(v)}
      />
    </div>
  );
}
