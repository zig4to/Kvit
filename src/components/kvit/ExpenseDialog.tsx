"use client";

import { useState } from "react";
import clsx from "@/lib/utils/clsx";
import Modal from "@/components/ui/Modal";
import { Field, Input } from "@/components/ui/Input";
import { FormButtons, useSubmit } from "@/components/kvit/FormParts";
import { Segmented } from "@/components/kvit/EntryDialog";
import { deleteSharedExpenseAction, saveSharedExpenseAction } from "@/actions/kvit";
import { todayIso } from "@/lib/kvit/balance";
import { dative } from "@/lib/kvit/cars";
import { amountInput, formatEur, parseAmount } from "@/lib/kvit/text";
import type { KvitSharedExpense } from "@/lib/types/database.types";

// enako = znesek se razdeli na plačnika in vse dolžnike (en dolžnik: pol),
// cel = celoten znesek si razdelijo dolžniki, znesek = vsak dolguje vpisani znesek.
type Split = "enako" | "cel" | "znesek";

const round2 = (n: number) => Math.round(n * 100) / 100;
// Slovenska dvojina: 2 osebi, 3 osebe, 5 oseb.
const people = (n: number) => (n % 100 === 2 ? "osebi" : n % 100 === 3 || n % 100 === 4 ? "osebe" : "oseb");

// Skupni strošek: kaj je kupljeno, kdo je plačal, kdo dolguje (eden ali več)
// in koliko. Prišteje se v Aktualno; vsak dolžnik dobi svojo vrstico.
export default function ExpenseDialog({
  open,
  onClose,
  expense,
  myName,
  names,
}: {
  open: boolean;
  onClose: () => void;
  expense?: KvitSharedExpense;
  myName: string;
  names: string[]; // imena članov gospodinjstva
}) {
  return (
    <Modal open={open} onClose={onClose} title={expense ? "Uredi strošek" : "Dodaj strošek"}>
      {/* key: ob vsakem odprtju sveže stanje obrazca */}
      {open && (
        <ExpenseForm key={expense?.id ?? "nov"} onClose={onClose} expense={expense} myName={myName} names={names} />
      )}
    </Modal>
  );
}

function ExpenseForm({
  onClose,
  expense,
  myName,
  names,
}: {
  onClose: () => void;
  expense?: KvitSharedExpense;
  myName: string;
  names: string[];
}) {
  const others = (n: string) => names.filter((x) => x !== n);
  // Privzeto: plačal sem jaz, dolguje brat (ne mama), če obstaja.
  const defaultDebtors = (payer: string) => {
    const o = others(payer);
    const d = o.find((x) => x !== "Mama") ?? o[0];
    return d ? [d] : [];
  };

  const [label, setLabel] = useState(expense?.label ?? "");
  const [amount, setAmount] = useState(expense ? amountInput(expense.amount) : "");
  const [paidBy, setPaidBy] = useState(expense?.paid_by ?? myName);
  const [owedBy, setOwedBy] = useState<string[]>(expense ? [expense.owed_by] : defaultDebtors(myName));
  // Še oseb izven Kvita (npr. prijatelja), ki si delita strošek pri „Enako“.
  const [extra, setExtra] = useState(expense?.extra_people ?? 0);
  const [split, setSplit] = useState<Split>(() => {
    if (!expense) return "enako";
    if (expense.share === expense.amount) return "cel";
    if (Math.abs(expense.share - expense.amount / (2 + expense.extra_people)) < 0.006) return "enako";
    return "znesek";
  });
  const [custom, setCustom] = useState(expense ? amountInput(expense.share) : "");
  const [day, setDay] = useState(expense?.day ?? todayIso());
  const { error, setError, pending, run } = useSubmit(onClose);

  const n = owedBy.length;
  const total = parseAmount(amount);
  const validTotal = total !== null && !Number.isNaN(total) && total > 0 ? total : null;
  // Koliko dolguje vsak dolžnik.
  const share =
    split === "znesek"
      ? parseAmount(custom)
      : validTotal === null || n === 0
        ? null
        : split === "cel"
          ? round2(validTotal / n)
          : round2(validTotal / (n + 1 + extra));
  const validShare = share !== null && !Number.isNaN(share) && share > 0 ? share : null;

  const splits: { id: Split; label: string }[] = [
    { id: "enako", label: n > 1 || extra > 0 ? "Enako" : "Pol" },
    { id: "cel", label: "Cel znesek" },
    { id: "znesek", label: n > 1 ? "Znesek vsak" : "Znesek" },
  ];

  const choosePayer = (p: string) => {
    setPaidBy(p);
    const rest = owedBy.filter((x) => x !== p);
    setOwedBy(rest.length > 0 ? rest : defaultDebtors(p));
  };
  // Novi strošek: več dolžnikov (vsaj eden ostane izbran); urejanje: samo eden.
  const toggleDebtor = (d: string) => {
    if (expense) return setOwedBy([d]);
    if (!owedBy.includes(d)) return setOwedBy(names.filter((x) => x === d || owedBy.includes(x)));
    if (owedBy.length > 1) setOwedBy(owedBy.filter((x) => x !== d));
  };

  const submit = () => {
    if (!label.trim()) return setError("Vpiši, kaj si kupil.");
    if (validTotal === null) return setError("Vpiši znesek.");
    if (n === 0) return setError("Izberi, kdo dolguje.");
    if (validShare === null) return setError("Vpiši, koliko dolguje.");
    if (validShare * n > validTotal + 0.01) {
      return setError(n > 1 ? "Deleži skupaj ne morejo biti večji od zneska." : "Delež ne more biti večji od zneska.");
    }
    run(() =>
      saveSharedExpenseAction({
        id: expense?.id,
        label,
        amount: validTotal,
        paidBy,
        owedBy,
        share: validShare,
        extraPeople: split === "enako" ? extra : 0,
        day,
      })
    );
  };

  const who = (x: string) => (x === myName ? "Ti" : x);
  const line = (d: string, s: number) =>
    d === myName
      ? `${dative(paidBy)} dolguješ ${formatEur(s)}`
      : paidBy === myName
        ? `${d} ti dolguje ${formatEur(s)}`
        : `${d} dolguje ${dative(paidBy)} ${formatEur(s)}`;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-4"
    >
      <Field label="Kaj si kupil" htmlFor="expense-label">
        <Input
          id="expense-label"
          autoFocus
          placeholder="npr. Pica, darilo, orodje"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </Field>

      <Field label="Znesek (€)" htmlFor="expense-amount">
        <Input
          id="expense-amount"
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="text-lg font-semibold"
        />
      </Field>

      <div>
        <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Kdo je plačal</p>
        <Segmented value={paidBy} options={names.map((x) => ({ id: x, label: who(x) }))} onChange={choosePayer} />
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          Kdo dolguje{!expense && <span className="font-normal text-gray-400 dark:text-gray-500"> · lahko več</span>}
        </p>
        <MultiToggle
          values={owedBy}
          options={others(paidBy).map((x) => ({ id: x, label: who(x) }))}
          onToggle={toggleDebtor}
        />
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Koliko dolguje</p>
        <Segmented value={split} options={splits} onChange={setSplit} />
        {split === "enako" && (
          <div className="mt-2 flex items-center justify-between gap-2 text-sm">
            <span className="text-gray-600 dark:text-gray-400">
              Še oseb izven Kvita
              {validTotal !== null && n > 0 && (
                <span className="text-gray-400 dark:text-gray-500">
                  {" "}
                  · {n + 1 + extra} {people(n + 1 + extra)} skupaj
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Ena oseba manj"
                disabled={extra === 0}
                onClick={() => setExtra(Math.max(0, extra - 1))}
                className="h-8 w-8 rounded-md bg-gray-100 font-semibold disabled:opacity-40 dark:bg-gray-800"
              >
                −
              </button>
              <span className="w-6 text-center font-semibold tabular-nums">{extra}</span>
              <button
                type="button"
                aria-label="Ena oseba več"
                disabled={extra >= 50}
                onClick={() => setExtra(Math.min(50, extra + 1))}
                className="h-8 w-8 rounded-md bg-gray-100 font-semibold disabled:opacity-40 dark:bg-gray-800"
              >
                +
              </button>
            </div>
          </div>
        )}
        {split === "znesek" && (
          <Input
            aria-label={n > 1 ? "Koliko dolguje vsak (€)" : "Koliko dolguje (€)"}
            inputMode="decimal"
            placeholder="0,00"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="mt-2"
          />
        )}
        {validShare !== null && (
          <div className="mt-2 space-y-0.5 text-sm font-semibold tabular-nums">
            {owedBy.map((d) => (
              <p
                key={d}
                className={
                  d === myName ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                }
              >
                {line(d, validShare)}
              </p>
            ))}
          </div>
        )}
      </div>

      <Field label="Dan" htmlFor="expense-day">
        <Input id="expense-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      </Field>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <FormButtons
        onClose={onClose}
        pending={pending}
        deleteLabel="Res izbriši"
        onDelete={expense ? () => run(() => deleteSharedExpenseAction(expense.id)) : undefined}
      />
    </form>
  );
}

// Kot Segmented, a z več izbranimi gumbi.
function MultiToggle({
  values,
  options,
  onToggle,
}: {
  values: string[];
  options: { id: string; label: string }[];
  onToggle: (id: string) => void;
}) {
  return (
    <div
      className="grid gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const on = values.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o.id)}
            className={clsx(
              "rounded-md px-1 py-1.5 text-sm font-medium",
              on
                ? "bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100"
                : "text-gray-500 dark:text-gray-400"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
