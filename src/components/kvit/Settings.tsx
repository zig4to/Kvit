"use client";

import { useState, useTransition } from "react";
import {
  leaveHouseholdAction,
  renameHouseholdAction,
  setDisplayNameAction,
  setMonthlyAmountAction,
} from "@/actions/kvit";
import { logoutAction } from "@/actions/auth";
import Button from "@/components/ui/Button";
import PromptDialog from "@/components/ui/PromptDialog";
import ThemeToggle from "@/components/theme/ThemeToggle";
import { IconCheck, IconCopy, IconLogout, IconPencil } from "@/components/ui/icons";
import { amountInput, formatEur, parseAmount } from "@/lib/kvit/text";
import type { KvitMember, KvitMembership } from "@/lib/types/database.types";

type Prompt = {
  title: string;
  label: string;
  initialValue?: string;
  onSubmit: (value: string) => Promise<{ error?: string }>;
};

const CARD =
  "space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900";
const ICON_BTN =
  "rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 dark:hover:bg-gray-800 dark:hover:text-gray-200";

export default function Settings({
  email,
  membership,
  members,
}: {
  email: string | null;
  membership: KvitMembership;
  members: KvitMember[];
}) {
  const { household, member } = membership;
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(household.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* odložišče ni na voljo — koda je vidna */
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Nastavitve</h1>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <section className={CARD}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm text-gray-500 dark:text-gray-400">Privzeti mesečni znesek</p>
            <p className="text-2xl font-semibold tabular-nums">{formatEur(member.monthly_amount)}</p>
          </div>
          <Button
            variant="secondary"
            onClick={() =>
              setPrompt({
                title: "Mesečni znesek",
                label: "Znesek (€) — velja od tega meseca naprej",
                initialValue: amountInput(member.monthly_amount),
                onSubmit: async (v) => {
                  const n = parseAmount(v);
                  if (n === null || Number.isNaN(n)) return { error: "Vpiši znesek." };
                  return setMonthlyAmountAction(n);
                },
              })
            }
          >
            <IconPencil /> Spremeni
          </Button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Posamezen mesec lahko spremeniš tudi sam (svinčnik pri „Fiksni stroški“).
        </p>
      </section>

      <section className={CARD}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm text-gray-500 dark:text-gray-400">Gospodinjstvo</p>
            <p className="truncate font-semibold">{household.name}</p>
          </div>
          <button
            type="button"
            aria-label="Preimenuj gospodinjstvo"
            className={ICON_BTN}
            onClick={() =>
              setPrompt({
                title: "Preimenuj gospodinjstvo",
                label: "Ime",
                initialValue: household.name,
                onSubmit: renameHouseholdAction,
              })
            }
          >
            <IconPencil />
          </button>
        </div>
        <div>
          <p className="mb-1 text-sm text-gray-600 dark:text-gray-300">
            Koda za povabilo (brat jo vnese ob prvem zagonu):
          </p>
          <div className="flex items-center gap-2">
            <code className="rounded-md bg-gray-100 px-3 py-1.5 font-mono text-lg tracking-widest dark:bg-gray-800">
              {household.invite_code}
            </code>
            <button
              type="button"
              onClick={copyCode}
              title={copied ? "Kopirano!" : "Kopiraj"}
              aria-label="Kopiraj kodo"
              className={
                copied
                  ? "rounded p-1.5 text-[#22c55e] outline outline-2 outline-offset-1 outline-[#22c55e] transition"
                  : `${ICON_BTN} transition`
              }
            >
              {copied ? <IconCheck /> : <IconCopy />}
            </button>
          </div>
        </div>
        <div>
          <p className="mb-1 text-sm text-gray-600 dark:text-gray-300">Člani</p>
          <ul className="space-y-1">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-2 text-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-xs font-semibold uppercase text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                  {(m.display_name || "?").charAt(0)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {m.display_name || "Brez imena"}
                  {m.user_id === member.user_id && (
                    <span className="text-gray-500 dark:text-gray-400"> (ti)</span>
                  )}
                </span>
                <span className="text-xs tabular-nums text-gray-500">{formatEur(m.monthly_amount)}/mesec</span>
                {m.user_id === member.user_id && (
                  <button
                    type="button"
                    aria-label="Spremeni svoje ime"
                    className={ICON_BTN}
                    onClick={() =>
                      setPrompt({
                        title: "Tvoje ime",
                        label: "Ime za prikaz",
                        initialValue: m.display_name,
                        onSubmit: setDisplayNameAction,
                      })
                    }
                  >
                    <IconPencil />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={CARD}>
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">Tema</p>
          <ThemeToggle />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
          <p className="min-w-0 truncate text-sm text-gray-500 dark:text-gray-400">{email}</p>
          <form action={logoutAction}>
            <Button type="submit" variant="secondary">
              <IconLogout /> Odjava
            </Button>
          </form>
        </div>
        {confirmLeave ? (
          <div className="flex items-center gap-2 text-xs">
            <span>Zapustim gospodinjstvo? Tvoji meseci ostanejo v bazi, a jih ne boš več videl.</span>
            <Button
              variant="danger"
              className="flex-shrink-0"
              onClick={() =>
                startTransition(async () => {
                  const res = await leaveHouseholdAction();
                  if (res?.error) setError(res.error);
                })
              }
            >
              Zapusti
            </Button>
            <Button variant="secondary" className="flex-shrink-0" onClick={() => setConfirmLeave(false)}>
              Ne
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmLeave(true)}
            className="text-xs text-red-600 hover:underline dark:text-red-400"
          >
            Zapusti gospodinjstvo
          </button>
        )}
      </section>

      <PromptDialog
        open={prompt !== null}
        onClose={() => setPrompt(null)}
        title={prompt?.title ?? ""}
        label={prompt?.label ?? ""}
        initialValue={prompt?.initialValue ?? ""}
        onSubmit={(v) => prompt?.onSubmit(v)}
      />
    </div>
  );
}
