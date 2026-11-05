"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { deleteEntryAction, saveEntryAction } from "@/actions/kvit";
import { amountInput, parseAmount } from "@/lib/kvit/text";
import { monthKey, todayIso } from "@/lib/kvit/balance";
import { removeReceipt, uploadReceipt } from "@/lib/kvit/car-photo";
import { IconCamera, IconTrash } from "@/components/ui/icons";
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
  householdId,
  userId,
  receiptUrl,
}: {
  open: boolean;
  onClose: () => void;
  monthKey: string;
  entry: KvitEntry | null; // null = nov vnos
  suggestions: string[];
  householdId: string;
  userId: string;
  receiptUrl: string | null; // začasna povezava do obstoječe slike računa
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
          householdId={householdId}
          userId={userId}
          receiptUrl={receiptUrl}
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
  householdId,
  userId,
  receiptUrl,
}: {
  onClose: () => void;
  monthKey: string;
  entry: KvitEntry | null;
  suggestions: string[];
  householdId: string;
  userId: string;
  receiptUrl: string | null;
}) {
  const [amount, setAmount] = useState(entry ? amountInput(entry.amount) : "");
  const [label, setLabel] = useState(entry?.label ?? "");
  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? "nakup");
  const [proof, setProof] = useState<EntryProof | null>(entry?.proof ?? null);
  const [day, setDay] = useState(entry ? (entry.day ?? "") : key === monthKey() ? todayIso() : "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Slika računa: naloži se takoj ob izbiri, vnos dobi samo pot.
  const [receiptPath, setReceiptPath] = useState<string | null>(entry?.receipt_path ?? null);
  const [preview, setPreview] = useState<string | null>(entry?.receipt_path ? receiptUrl : null);
  const [uploading, setUploading] = useState(false);
  const fresh = useRef<string[]>([]); // naložene v tem obrazcu
  const saved = useRef(false);
  // Zaprt brez shranjevanja → pobriši naložene slike, da ne ostanejo sirote.
  useEffect(() => {
    const list = fresh.current;
    return () => {
      if (!saved.current) list.forEach((p) => void removeReceipt(p));
    };
  }, []);

  const pickReceipt = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const p = await uploadReceipt(file, householdId, userId);
      fresh.current.push(p);
      setReceiptPath(p);
      setPreview(URL.createObjectURL(file));
      if (!proof) setProof("racun");
    } catch {
      setError("Slike računa ni bilo mogoče naložiti.");
    } finally {
      setUploading(false);
    }
  };
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
        receiptPath,
      });
      if (res.error) setError(res.error);
      else {
        saved.current = true;
        // Naložene, a zamenjane slike niso več potrebne.
        fresh.current.filter((p) => p !== receiptPath).forEach((p) => void removeReceipt(p));
        onClose();
      }
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

      <div>
        <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Slika računa</p>
        {preview ? (
          <div className="flex items-center gap-3">
            <a href={preview} target="_blank" rel="noreferrer" className="block flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- lokalni predogled / začasna povezava */}
              <img src={preview} alt="Račun" className="h-24 w-20 rounded-md border border-gray-200 object-cover dark:border-gray-700" />
            </a>
            <div className="flex flex-col items-start gap-1.5">
              <label className="cursor-pointer text-sm text-rose-600 hover:underline dark:text-rose-400">
                {uploading ? "Nalagam …" : "Zamenjaj"}
                <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => pickReceipt(e.target.files?.[0])} />
              </label>
              <button
                type="button"
                onClick={() => {
                  setReceiptPath(null);
                  setPreview(null);
                }}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 dark:text-gray-400"
              >
                <IconTrash className="h-3.5 w-3.5" /> Odstrani
              </button>
            </div>
          </div>
        ) : (
          <label
            className={clsx(
              "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800",
              uploading && "pointer-events-none opacity-60"
            )}
          >
            <IconCamera className="h-5 w-5" />
            {uploading ? "Nalagam …" : "Slikaj račun"}
            <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => pickReceipt(e.target.files?.[0])} />
          </label>
        )}
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
          <Button type="submit" disabled={pending || uploading}>
            {pending ? "Shranjujem …" : "Shrani"}
          </Button>
        </div>
      </div>
    </form>
  );
}
