"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { IconPencil, IconPlus } from "@/components/ui/icons";
import {
  deleteDebtAction,
  deleteDebtPaymentAction,
  saveDebtAction,
  saveDebtPaymentAction,
  type KvitResult,
} from "@/actions/kvit";
import { todayIso } from "@/lib/kvit/balance";
import { amountInput, formatEur, parseAmount } from "@/lib/kvit/text";
import type { DebtWithPayments } from "@/lib/data/kvit";
import type { KvitDebtPayment } from "@/lib/types/database.types";
import type { PersonTab } from "@/components/kvit/MonthView";
import clsx from "@/lib/utils/clsx";

type Dialog =
  | { type: "debt"; debt: DebtWithPayments | null }
  | { type: "payment"; debt: DebtWithPayments; payment: KvitDebtPayment | null };

const fmtDay = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${Number(day)}. ${Number(m)}. ${y}`;
};

// Dolg do mame (npr. posojilo za avto) — ločen od mesečnih stroškov. Vsak
// ima svoj znesek in ga odplačuje s sprotnimi plačili.
export default function DebtView({
  people,
  personId,
  debts,
  editable,
}: {
  people: PersonTab[];
  personId: string;
  debts: DebtWithPayments[]; // dolgovi izbrane osebe
  editable: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };
    const channel = supabase
      .channel("kvit-debts")
      .on("postgres_changes", { event: "*", schema: "public", table: "kvit_debts" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "kvit_debt_payments" }, refresh)
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  const total = debts.reduce((a, d) => a + d.remaining, 0);

  return (
    <div className="space-y-4">
      {people.length > 1 && (
        <div
          className="grid gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800"
          style={{ gridTemplateColumns: `repeat(${people.length}, minmax(0, 1fr))` }}
        >
          {people.map((p) => (
            <Link
              key={p.userId}
              href={`/dolg?oseba=${p.userId}`}
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

      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Dolg</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Ločeno od mesečnih stroškov za hišo.
          </p>
        </div>
        {debts.length > 1 && (
          <p className="text-right text-sm text-gray-500 dark:text-gray-400">
            Skupaj še
            <br />
            <span className="text-base font-semibold text-rose-600 dark:text-rose-400">
              {formatEur(total)}
            </span>
          </p>
        )}
      </div>

      {debts.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          {editable
            ? "Še ni vpisanega dolga. Vpiši znesek, ki ga dolguješ (npr. za avto)."
            : "Ni vpisanega dolga."}
        </p>
      )}

      {debts.map((d) => {
        const pct = Math.min(100, Math.max(0, (d.paid / d.amount) * 100));
        const done = d.remaining <= 0.004;
        return (
          <section
            key={d.id}
            className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{d.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatEur(d.amount)}
                    {d.started_on && ` · od ${fmtDay(d.started_on)}`}
                  </p>
                </div>
                {editable && (
                  <button
                    type="button"
                    aria-label="Uredi dolg"
                    onClick={() => setDialog({ type: "debt", debt: d })}
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
                  >
                    <IconPencil />
                  </button>
                )}
              </div>

              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                {done ? "Odplačano" : "Še za odplačati"}
              </p>
              <p
                className={clsx(
                  "text-4xl font-bold tabular-nums",
                  done ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                )}
              >
                {formatEur(Math.max(0, d.remaining))}
              </p>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-500 to-violet-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Odplačano {formatEur(d.paid)}</span>
                <span>{Math.round(pct)} %</span>
              </p>

              {editable && !done && (
                <Button
                  className="mt-4 w-full"
                  onClick={() => setDialog({ type: "payment", debt: d, payment: null })}
                >
                  <IconPlus /> Odplačilo
                </Button>
              )}
            </div>

            {d.payments.length > 0 && (
              <ul className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
                {d.payments.map((p) => {
                  const content = (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{fmtDay(p.day)}</p>
                        {p.note && (
                          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{p.note}</p>
                        )}
                      </div>
                      <span className="whitespace-nowrap text-sm font-semibold tabular-nums">
                        −{formatEur(p.amount)}
                      </span>
                    </>
                  );
                  return (
                    <li key={p.id}>
                      {editable ? (
                        <button
                          type="button"
                          onClick={() => setDialog({ type: "payment", debt: d, payment: p })}
                          className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60"
                        >
                          {content}
                        </button>
                      ) : (
                        <div className="flex items-center gap-3 px-5 py-2.5">{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {editable && (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setDialog({ type: "debt", debt: null })}
        >
          <IconPlus /> {debts.length ? "Dodaj še en dolg" : "Vpiši dolg"}
        </Button>
      )}

      <Modal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={
          dialog?.type === "debt"
            ? dialog.debt
              ? "Uredi dolg"
              : "Nov dolg"
            : dialog?.payment
              ? "Uredi odplačilo"
              : `Odplačilo · ${dialog?.debt.label ?? ""}`
        }
      >
        {dialog?.type === "debt" && (
          <DebtForm key={dialog.debt?.id ?? "new"} debt={dialog.debt} onClose={() => setDialog(null)} />
        )}
        {dialog?.type === "payment" && (
          <PaymentForm
            key={dialog.payment?.id ?? "new"}
            debt={dialog.debt}
            payment={dialog.payment}
            onClose={() => setDialog(null)}
          />
        )}
      </Modal>
    </div>
  );
}

// Skupni del obrazcev: shrani / izbriši (s potrditvijo) / prekliči.
function useSubmit(onClose: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<KvitResult>) => {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res.error) setError(res.error);
      else onClose();
    });
  };
  return { error, setError, pending, run };
}

function FormButtons({
  onClose,
  onDelete,
  pending,
  deleteLabel,
}: {
  onClose: () => void;
  onDelete?: () => void;
  pending: boolean;
  deleteLabel: string;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2">
      {onDelete ? (
        confirm ? (
          <Button type="button" variant="danger" disabled={pending} onClick={onDelete}>
            {deleteLabel}
          </Button>
        ) : (
          <Button type="button" variant="ghost" onClick={() => setConfirm(true)}>
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
  );
}

function DebtForm({ debt, onClose }: { debt: DebtWithPayments | null; onClose: () => void }) {
  const [label, setLabel] = useState(debt?.label ?? "Avto");
  const [amount, setAmount] = useState(debt ? amountInput(debt.amount) : "");
  const [startedOn, setStartedOn] = useState(debt?.started_on ?? "");
  const { error, setError, pending, run } = useSubmit(onClose);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = parseAmount(amount);
        if (n === null || Number.isNaN(n) || n <= 0) {
          setError("Vpiši znesek dolga, npr. 5000.");
          return;
        }
        run(() => saveDebtAction({ id: debt?.id, label, amount: n, startedOn: startedOn || null }));
      }}
      className="space-y-4"
    >
      <Field label="Za kaj" htmlFor="debt-label">
        <Input id="debt-label" value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <Field label="Celoten dolg (€)" htmlFor="debt-amount">
        <Input
          id="debt-amount"
          autoFocus
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="text-lg font-semibold"
        />
      </Field>
      <Field label="Od kdaj (neobvezno)" htmlFor="debt-start">
        <Input
          id="debt-start"
          type="date"
          value={startedOn}
          onChange={(e) => setStartedOn(e.target.value)}
        />
      </Field>
      {debt && debt.payments.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Odplačila ({formatEur(debt.paid)}) ostanejo; preostanek se preračuna.
        </p>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <FormButtons
        onClose={onClose}
        pending={pending}
        deleteLabel="Res izbriši dolg in odplačila"
        onDelete={debt ? () => run(() => deleteDebtAction(debt.id)) : undefined}
      />
    </form>
  );
}

function PaymentForm({
  debt,
  payment,
  onClose,
}: {
  debt: DebtWithPayments;
  payment: KvitDebtPayment | null;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(payment ? amountInput(payment.amount) : "");
  const [day, setDay] = useState(payment?.day ?? todayIso());
  const [note, setNote] = useState(payment?.note ?? "");
  const { error, setError, pending, run } = useSubmit(onClose);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = parseAmount(amount);
        if (n === null || Number.isNaN(n) || n <= 0) {
          setError("Vpiši znesek, npr. 200.");
          return;
        }
        run(() =>
          saveDebtPaymentAction({ id: payment?.id, debtId: debt.id, amount: n, day, note })
        );
      }}
      className="space-y-4"
    >
      <Field label="Znesek (€)" htmlFor="pay-amount">
        <Input
          id="pay-amount"
          autoFocus
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="text-lg font-semibold"
        />
      </Field>
      {!payment && (
        <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">
          Še za odplačati: {formatEur(Math.max(0, debt.remaining))}
        </p>
      )}
      <Field label="Dan" htmlFor="pay-day">
        <Input id="pay-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      </Field>
      <Field label="Opomba (neobvezno)" htmlFor="pay-note">
        <Input
          id="pay-note"
          placeholder="npr. gotovina, nakazilo"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <FormButtons
        onClose={onClose}
        pending={pending}
        deleteLabel="Res izbriši"
        onDelete={payment ? () => run(() => deleteDebtPaymentAction(payment.id)) : undefined}
      />
    </form>
  );
}
