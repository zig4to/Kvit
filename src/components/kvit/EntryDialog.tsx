"use client";

import { useState, useTransition } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { deleteEntryAction, saveEntryAction } from "@/actions/kvit";
import { amountInput, parseAmount } from "@/lib/kvit/text";
import { monthKey, todayIso } from "@/lib/kvit/balance";
import type { EntryKind, EntryProof, KvitEntry } from "@/lib/types/database.types";
import clsx from "@/lib/utils/clsx";

export const KINDS: { id: EntryKind; label: string; hint: string }[] = [
  { id: "nakup", label: "Nakup", hint: "Kupil sem za hišo — odšteje se" },
  { id: "placilo", label: "Plačilo mami", hint: "Dal sem denar — odšteje se" },
  { id: "posojilo", label: "Posojilo", hint: "Mama mi je posodila — prišteje se" },
];

const PROOFS: { id: EntryProof | null; label: string }[] = [
  { id: null, label: "Brez" },
  { id: "racun", label: "Račun" },
  { id: "potrdilo", label: "Potrdilo" },
];

function Segmented<T extends string | null>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="grid gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          onClick={() => onChange(o.id)}
          className={clsx(
            "rounded-md px-1 py-1.5 text-sm font-medium",
            value === o.id
              ? "bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100"
              : "text-gray-500 dark:text-gray-400"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Nov vnos ali urejanje obstoječega. Privzeto „Nakup“ — npr. grem v trgovino
// in dam 80 €, ki se odštejejo od mesečnega zneska.
export default function EntryDialog({
  open,
  onClose,
  monthKey: key,
  entry,
  suggestions,
}: {
  open: boolean;
  onClose: () => void;
  monthKey: string;
  entry: KvitEntry | null; // null = nov vnos
  suggestions: string[];
}) {
  return (
    <Modal open={open} onClose={onClose} title={entry ? "Uredi vnos" : "Nov vnos"}>
      {/* key: ob vsakem odprtju svež obrazec */}
      {open && (
        <EntryForm
          key={entry?.id ?? "new"}
          onClose={onClose}
          monthKey={key}
          entry={entry}
          suggestions={suggestions}
        />
      )}
    </Modal>
  );
}

function EntryForm({
  onClose,
  monthKey: key,
  entry,
  suggestions,
}: {
  onClose: () => void;
  monthKey: string;
  entry: KvitEntry | null;
  suggestions: string[];
}) {
  const [amount, setAmount] = useState(entry ? amountInput(entry.amount) : "");
  const [label, setLabel] = useState(entry?.label ?? "");
  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? "nakup");
  const [proof, setProof] = useState<EntryProof | null>(entry?.proof ?? null);
  const [day, setDay] = useState(entry ? (entry.day ?? "") : key === monthKey() ? todayIso() : "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const q = label.trim().toLowerCase();
  const chips = suggestions
    .filter((s) => s.toLowerCase() !== q && (!q || s.toLowerCase().includes(q)))
    .slice(0, 6);

  const submit = () => {
    const value = parseAmount(amount);
    if (value === null || Number.isNaN(value) || value <= 0) {
      setError("Vpiši znesek, npr. 80 ali 23,45.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await saveEntryAction({
        id: entry?.id,
        monthKey: key,
        kind,
        label,
        amount: value,
        proof,
        day: day || null,
      });
      if (res.error) setError(res.error);
      else onClose();
    });
  };

  const remove = () => {
    if (!entry) return;
    startTransition(async () => {
      const res = await deleteEntryAction(entry.id);
      if (res.error) setError(res.error);
      else onClose();
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-4"
    >
      <Field label="Znesek (€)" htmlFor="entry-amount">
        <Input
          id="entry-amount"
          autoFocus
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="text-lg font-semibold"
        />
      </Field>

      <div>
        <Segmented value={kind} options={KINDS} onChange={setKind} />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {KINDS.find((k) => k.id === kind)?.hint}
        </p>
      </div>

      <Field label="Opis" htmlFor="entry-label">
        <Input
          id="entry-label"
          placeholder="npr. Lidl, guma za Passata …"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        {chips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setLabel(s)}
                className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Dokazilo" htmlFor="entry-proof">
          <Segmented value={proof} options={PROOFS} onChange={setProof} />
        </Field>
        <Field label="Dan" htmlFor="entry-day">
          <Input
            id="entry-day"
            type="date"
            value={day}
            min={`${key}-01`}
            max={`${key}-31`}
            onChange={(e) => setDay(e.target.value)}
          />
        </Field>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        {entry ? (
          confirmDelete ? (
            <Button type="button" variant="danger" disabled={pending} onClick={remove}>
              Res izbriši
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
              Izbriši
            </Button>
          )
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Prekliči
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Shranjujem …" : "Shrani"}
          </Button>
        </div>
      </div>
    </form>
  );
}
