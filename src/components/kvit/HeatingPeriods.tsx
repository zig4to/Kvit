"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { IconPlus } from "@/components/ui/icons";
import { FormButtons, useSubmit } from "@/components/kvit/FormParts";
import { deleteHeatingPeriodAction, saveHeatingPeriodAction } from "@/actions/kvit";
import { todayIso } from "@/lib/kvit/balance";
import { daysBetween, perMonth } from "@/lib/kvit/heating";
import { amountInput, formatEur } from "@/lib/kvit/text";
import type { KvitHeatingPeriod } from "@/lib/types/database.types";

const DATE = new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "numeric", year: "numeric" });
const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return DATE.format(new Date(y, m - 1, d));
};

// „487 dni (16 mes.)“
function duration(days: number) {
  const months = Math.round(days / 30.44);
  return months >= 1 ? `${days} dni (${months} mes.)` : `${days} dni`;
}

// Zavihek Ogrevanje: polnitve olja od natankanja do dneva, ko ga zmanjka.
export default function HeatingPeriods({ periods }: { periods: KvitHeatingPeriod[] }) {
  const [dialog, setDialog] = useState<{ period: KvitHeatingPeriod | null } | null>(null);
  const today = todayIso();

  return (
    <div className="space-y-3">
      {periods.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          Še ni vpisane polnitve olja. Vpiši dan, ko ste natankali, in znesek; ko olja zmanjka,
          dopiši še ta dan.
        </p>
      ) : (
        <ul className="space-y-2">
          {periods.map((p) => {
            const days = daysBetween(p.started_on, p.ended_on ?? today);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setDialog({ period: p })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left dark:border-gray-800 dark:bg-gray-900"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">
                      {fmtDay(p.started_on)} – {p.ended_on ? fmtDay(p.ended_on) : "še traja"}
                    </span>
                    <span className="font-semibold tabular-nums">{formatEur(p.amount)}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap justify-between gap-x-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>
                      {p.ended_on ? duration(days) : `${duration(days)} do danes`}
                      {p.liters ? ` · ${String(p.liters).replace(".", ",")} l` : ""}
                      {p.note ? ` · ${p.note}` : ""}
                    </span>
                    <span className="tabular-nums">{formatEur(perMonth(p))} / mesec (÷ 12)</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {periods.length > 0 && (
        <p className="px-1 text-xs text-gray-500 dark:text-gray-400">
          V obračunu se znesek polnitve deli na 12 mesecev; šteje vsak mesec, ko se olje kuri.
        </p>
      )}

      <Button type="button" onClick={() => setDialog({ period: null })} className="w-full">
        <IconPlus /> Nova polnitev
      </Button>

      <Modal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog?.period ? "Uredi polnitev" : "Nova polnitev olja"}
      >
        {dialog && (
          <PeriodForm
            key={dialog.period?.id ?? "new"}
            period={dialog.period}
            onClose={() => setDialog(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function PeriodForm({ period, onClose }: { period: KvitHeatingPeriod | null; onClose: () => void }) {
  const [startedOn, setStartedOn] = useState(period?.started_on ?? todayIso());
  const [endedOn, setEndedOn] = useState(period?.ended_on ?? "");
  const [amount, setAmount] = useState(period ? amountInput(period.amount) : "");
  const [liters, setLiters] = useState(period?.liters ? String(period.liters).replace(".", ",") : "");
  const [note, setNote] = useState(period?.note ?? "");
  const { error, pending, run } = useSubmit(onClose);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() =>
          saveHeatingPeriodAction({ id: period?.id, startedOn, endedOn, amount, liters, note })
        );
      }}
      className="space-y-4"
    >
      <Field label="Znesek (€)" htmlFor="heat-amount">
        <Input
          id="heat-amount"
          autoFocus={!period}
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="text-lg font-semibold"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Natankano" htmlFor="heat-from">
          <Input id="heat-from" type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
        </Field>
        <Field label="Zmanjkalo" htmlFor="heat-to">
          <Input
            id="heat-to"
            type="date"
            value={endedOn}
            min={startedOn}
            onChange={(e) => setEndedOn(e.target.value)}
          />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">
        Dan, ko je olja zmanjkalo, pusti prazen, dokler ga še kurite.
        {endedOn && (
          <>
            {" "}
            <button type="button" className="underline" onClick={() => setEndedOn("")}>
              Še traja
            </button>
          </>
        )}
      </p>
      <Field label="Litri (neobvezno)" htmlFor="heat-liters">
        <Input
          id="heat-liters"
          inputMode="decimal"
          placeholder="npr. 2000"
          value={liters}
          onChange={(e) => setLiters(e.target.value)}
        />
      </Field>
      <Field label="Opomba (neobvezno)" htmlFor="heat-note">
        <Input id="heat-note" placeholder="npr. dobavitelj" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <FormButtons
        onClose={onClose}
        pending={pending}
        deleteLabel="Res izbriši"
        onDelete={period ? () => run(() => deleteHeatingPeriodAction(period.id)) : undefined}
      />
    </form>
  );
}
