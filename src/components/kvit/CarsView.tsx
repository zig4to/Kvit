"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import {
  IconCalendar,
  IconCamera,
  IconCar,
  IconCheck,
  IconChevronDown,
  IconHammer,
  IconInfo,
  IconPencil,
  IconPlus,
  IconWrench,
} from "@/components/ui/icons";
import CarLogo from "@/components/kvit/CarLogo";
import { setSectionCollapsed } from "@/lib/kvit/collapsed";
import { FormButtons, useSubmit } from "@/components/kvit/FormParts";
import {
  deleteCarAction,
  deleteCarDeadlineAction,
  deleteCarRecordAction,
  deleteCarSpecAction,
  saveCarAction,
  saveCarDeadlineAction,
  saveCarRecordAction,
  saveCarSpecAction,
  setCarPhotoAction,
} from "@/actions/kvit";
import { uploadCarPhoto } from "@/lib/kvit/car-photo";
import { todayIso } from "@/lib/kvit/balance";
import { amountInput, formatEur, parseAmount } from "@/lib/kvit/text";
import type { CarBalance as Balance, CarDetail } from "@/lib/data/kvit";
import CarBalance from "@/components/kvit/CarBalance";
import type {
  CarRecordKind,
  KvitCarDeadline,
  KvitCarRecord,
  KvitCarSpec,
} from "@/lib/types/database.types";
import clsx from "@/lib/utils/clsx";

type Dialog =
  | { type: "car"; car: CarDetail | null }
  | { type: "record"; kind: CarRecordKind; record: KvitCarRecord | null }
  | { type: "deadline"; deadline: KvitCarDeadline | null }
  | { type: "spec"; spec: KvitCarSpec | null };

const CARD = "rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900";
const ROW_BTN =
  "flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60";

const fmtDay = (d: string | null) => {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${Number(day)}. ${Number(m)}. ${y}`;
};
const fmtKm = (n: number | null) => (n === null ? "" : `${n.toLocaleString("sl-SI")} km`);
const daysUntil = (iso: string) =>
  Math.round((Date.parse(iso) - Date.parse(todayIso())) / 86400000);

// Stanje roka: poteklo / kmalu / velja / ni vpisano.
function deadlineStatus(d: KvitCarDeadline) {
  if (!d.valid_until) return { label: "ni vpisano", tone: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" };
  const n = daysUntil(d.valid_until);
  if (n < 0) return { label: "poteklo", tone: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" };
  if (n <= 30)
    return { label: n === 0 ? "poteče danes" : `še ${n} dni`, tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" };
  return { label: "velja", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" };
}

function Section({
  title,
  icon,
  sub,
  count,
  collapsed,
  onToggle,
  onAdd,
  addLabel,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  sub?: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  addLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={CARD}>
      <div
        className={clsx(
          "flex items-center gap-2 px-4 py-2.5",
          !collapsed && "border-b border-gray-100 dark:border-gray-800"
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <h2 className="truncate font-semibold">{title}</h2>
              {collapsed && count > 0 && (
                <span className="rounded-full bg-gray-100 px-1.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  {count}
                </span>
              )}
            </span>
            {sub && <span className="block text-xs text-gray-500 dark:text-gray-400">{sub}</span>}
          </span>
          <IconChevronDown
            className={clsx("h-4 w-4 flex-shrink-0 text-gray-400 transition-transform", collapsed && "-rotate-90")}
          />
        </button>
        {onAdd && !collapsed && (
          <Button variant="secondary" className="flex-shrink-0 px-2.5 py-1.5" onClick={onAdd}>
            <IconPlus /> {addLabel}
          </Button>
        )}
      </div>
      {!collapsed && children}
    </section>
  );
}

// „Žiga in Nejc“, „Žiga, Nejc in Mama“
const joinNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} in ${names[names.length - 1]}`;

// Plačal / poravnano pri vnosu (pri avtu z enim lastnikom poravnano ni pomembno).
function RecordBadges({ r, shared }: { r: KvitCarRecord; shared: boolean }) {
  return (
    <>
      {r.paid_by && <span className="rounded bg-gray-100 px-1.5 py-px dark:bg-gray-800">plačal {r.paid_by}</span>}
      {shared && r.price !== null && r.paid_by && (
        r.settled ? (
          <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-px text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <IconCheck className="h-3 w-3" /> poravnano
          </span>
        ) : (
          <span className="rounded bg-amber-100 px-1.5 py-px text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            za delitev
          </span>
        )
      )}
    </>
  );
}

// Kdo komu dolguje za skupne avte (stroški na pol med lastnike) — s poravnavo
// in potrditvijo (CarBalance, enako kot kartica Aktualno na domači strani).
function SplitSummary({ cars, balance }: { cars: CarDetail[]; balance: Balance }) {
  const shared = cars.filter((c) => c.owners.length > 1);
  if (shared.length === 0) return null;
  return (
    <section className={clsx(CARD, "p-4")}>
      <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
        Skupni stroški · {joinNames(shared.map((c) => c.name))} · na pol
      </p>
      <CarBalance balance={balance} />
    </section>
  );
}

// Slika avta v okvirju: cela slika (contain). Povečava ima izhodišče nad
// sredino (35 %), zato se avto ob povečavi pomakne nekoliko nižje; offset
// (% višine okvirja, negativno = višje) jo še premakne gor/dol.
function CarPhoto({ url, alt, zoom, offset, className }: { url: string; alt: string; zoom: number; offset: number; className: string }) {
  const transform = [offset ? `translateY(${offset}%)` : "", zoom !== 1 ? `scale(${zoom})` : ""].join(" ").trim();
  return (
    <span className={clsx("block flex-shrink-0 overflow-hidden rounded-lg bg-white", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- začasna povezava iz zasebnega bucketa */}
      <img
        src={url}
        alt={alt}
        className="h-full w-full origin-bottom object-contain object-bottom"
        style={transform ? { transform, transformOrigin: "50% 35%" } : undefined}
      />
    </span>
  );
}

// Kamera v glavi avta: izberi ali posnemi sliko → naloži → nadomesti logotip.
function PhotoButton({ car }: { car: CarDetail }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <label
      title={error ?? (car.photo_url ? "Zamenjaj sliko" : "Dodaj sliko avta")}
      className={clsx(
        "cursor-pointer rounded p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800",
        error ? "text-red-500" : "text-gray-400 hover:text-gray-700",
        pending && "animate-pulse"
      )}
    >
      <IconCamera />
      <span className="sr-only">{car.photo_url ? "Zamenjaj sliko" : "Dodaj sliko avta"}</span>
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={pending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setError(null);
          startTransition(async () => {
            try {
              const path = await uploadCarPhoto(file, car.household_id, car.id);
              const res = await setCarPhotoAction(car.id, path);
              if (res.error) setError(res.error);
            } catch {
              setError("Nalaganje slike ni uspelo.");
            }
          });
        }}
      />
    </label>
  );
}

const Empty = ({ text }: { text: string }) => (
  <p className="px-4 py-4 text-center text-sm text-gray-500 dark:text-gray-400">{text}</p>
);

// Servisna evidenca skupnih avtov (po vzoru starega Excela): roki, redni
// servisi, sprotno vzdrževanje in podatki o vozilu. Urejajo vsi člani.
export default function CarsView({
  cars,
  carId,
  memberNames,
  initialCollapsed,
  balance,
}: {
  cars: CarDetail[];
  balance: Balance; // kdo komu dolguje (iz pogleda prijavljenega člana)
  carId: string | null;
  memberNames: string[]; // za izbiro „Plačal“
  initialCollapsed: string[]; // zloženi razdelki (piškotek kvit-avti-zlozeno)
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [collapsed, setCollapsed] = useState(() => new Set(initialCollapsed));
  const toggle = (id: string) => {
    const next = new Set(collapsed);
    const now = !next.has(id);
    if (now) next.add(id);
    else next.delete(id);
    setCollapsed(next);
    setSectionCollapsed(id, now);
  };
  const sec = (id: string) => ({ collapsed: collapsed.has(id), onToggle: () => toggle(id) });
  // Zavihek avta se zamenja na odjemalcu (brez novega nalaganja strani), zato
  // ostanejo začasne povezave do slik enake in slike iz predpomnilnika.
  const [selectedId, setSelectedId] = useState(carId);
  const [prevCarId, setPrevCarId] = useState(carId);
  if (carId !== prevCarId) {
    // npr. router.push po dodajanju novega avta
    setPrevCarId(carId);
    setSelectedId(carId);
  }
  const selectCar = (id: string) => {
    setSelectedId(id);
    window.history.replaceState(null, "", `/avti?avto=${id}`);
  };
  const car = cars.find((c) => c.id === selectedId) ?? cars[0] ?? null;

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };
    const channel = supabase.channel("kvit-cars");
    for (const table of ["kvit_cars", "kvit_car_records", "kvit_car_deadlines", "kvit_car_specs"])
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  const close = () => setDialog(null);

  const services = car?.records.filter((r) => r.kind === "servis") ?? [];
  const repairs = car?.records.filter((r) => r.kind === "popravilo") ?? [];
  const lastKm = car ? Math.max(0, ...car.records.map((r) => r.km ?? 0)) : 0;
  const repairsTotal = repairs.reduce((a, r) => a + (r.price ?? 0), 0);
  const nextService = services.find((s) => s.next_service_km !== null)?.next_service_km ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
          {cars.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => selectCar(c.id)}
              className={clsx(
                "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium",
                c.id === car?.id
                  ? "bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100"
                  : "text-gray-500 dark:text-gray-400"
              )}
            >
              <CarLogo name={c.name} className="h-5 w-5" />
              {c.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Dodaj avto"
          title="Dodaj avto"
          onClick={() => setDialog({ type: "car", car: null })}
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <IconPlus className="h-5 w-5" />
        </button>
      </div>

      <SplitSummary cars={cars} balance={balance} />

      {/* Slike ostalih avtov naložim vnaprej, da je zamenjava zavihka takojšnja. */}
      <div hidden aria-hidden="true">
        {cars
          .filter((c) => c.photo_url && c.id !== car?.id)
          .map((c) => (
            // eslint-disable-next-line @next/next/no-img-element -- samo prednalaganje
            <img key={c.id} src={c.photo_url!} alt="" />
          ))}
      </div>

      {!car ? (
        <div className={clsx(CARD, "p-6 text-center")}>
          <IconCar className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Še ni dodanega avta.</p>
          <Button className="mt-3" onClick={() => setDialog({ type: "car", car: null })}>
            <IconPlus /> Dodaj avto
          </Button>
        </div>
      ) : (
        <>
          <section className={clsx(CARD, "overflow-hidden")}>
            <div className="flex items-center gap-3 p-4">
            {car.photo_url ? (
              <CarPhoto key={car.id} url={car.photo_url} alt={car.name} zoom={car.photo_zoom} offset={car.photo_offset} className="h-20 w-32" />
            ) : (
              <CarLogo name={car.name} className="h-11 w-11" />
            )}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold">{car.name}</h1>
              <p className="flex flex-wrap gap-x-3 text-sm text-gray-500 dark:text-gray-400">
                {car.plate && <span className="font-mono">{car.plate}</span>}
                {lastKm > 0 && <span>{fmtKm(lastKm)}</span>}
                {nextService !== null && <span>naslednji servis {fmtKm(nextService)}</span>}
              </p>
              {car.owners.length > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {car.owners.length > 1
                    ? `Lastnika: ${joinNames(car.owners)} · stroški na pol`
                    : `Lastnik: ${car.owners[0]} · plača sam`}
                </p>
              )}
            </div>
            <PhotoButton car={car} />
            <button
              type="button"
              aria-label="Uredi avto"
              onClick={() => setDialog({ type: "car", car })}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
            >
              <IconPencil />
            </button>
            </div>
          </section>

          <Section
            title="Pregledi in roki"
            icon={<IconCalendar className="h-4 w-4" />}
            count={car.deadlines.length}
            {...sec("roki")}
            onAdd={() => setDialog({ type: "deadline", deadline: null })}
            addLabel="Rok"
          >
            {car.deadlines.length === 0 ? (
              <Empty text="Ni rokov." />
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {car.deadlines.map((d) => {
                  const st = deadlineStatus(d);
                  return (
                    <li key={d.id}>
                      <button type="button" className={ROW_BTN} onClick={() => setDialog({ type: "deadline", deadline: d })}>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{d.name}</p>
                          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                            {d.valid_from || d.valid_until
                              ? [fmtDay(d.valid_from), fmtDay(d.valid_until)].filter(Boolean).join(" – ")
                              : ""}
                            {d.note && (d.valid_from || d.valid_until ? ` · ${d.note}` : d.note)}
                          </p>
                        </div>
                        <span className={clsx("whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", st.tone)}>
                          {st.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section
            title="Redni servisi"
            icon={<IconWrench className="h-4 w-4" />}
            count={services.length}
            {...sec("servisi")}
            onAdd={() => setDialog({ type: "record", kind: "servis", record: null })}
            addLabel="Servis"
          >
            {services.length === 0 ? (
              <Empty text="Še ni vpisanega servisa." />
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {services.map((r) => (
                  <li key={r.id}>
                    <button type="button" className={ROW_BTN} onClick={() => setDialog({ type: "record", kind: "servis", record: r })}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{r.description}</p>
                        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-gray-500 dark:text-gray-400">
                          <span>
                            {[fmtDay(r.day), fmtKm(r.km), r.next_service_km !== null ? `naslednji ${fmtKm(r.next_service_km)}` : ""]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          <RecordBadges r={r} shared={car.owners.length > 1} />
                        </p>
                        {r.note && <p className="truncate text-xs text-gray-500 dark:text-gray-400">{r.note}</p>}
                      </div>
                      {r.price !== null && (
                        <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{formatEur(r.price)}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Vzdrževanje in popravila"
            icon={<IconHammer className="h-4 w-4" />}
            sub={repairs.length ? `Skupaj ${formatEur(repairsTotal)}` : undefined}
            count={repairs.length}
            {...sec("popravila")}
            onAdd={() => setDialog({ type: "record", kind: "popravilo", record: null })}
            addLabel="Dodaj"
          >
            {repairs.length === 0 ? (
              <Empty text="Še ni vpisanega popravila." />
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {repairs.map((r) => (
                  <li key={r.id}>
                    <button type="button" className={ROW_BTN} onClick={() => setDialog({ type: "record", kind: "popravilo", record: r })}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{r.description}</p>
                        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-gray-500 dark:text-gray-400">
                          <span>{[fmtDay(r.day), fmtKm(r.km)].filter(Boolean).join(" · ")}</span>
                          <RecordBadges r={r} shared={car.owners.length > 1} />
                        </p>
                        {r.note && <p className="truncate text-xs text-gray-500 dark:text-gray-400">{r.note}</p>}
                      </div>
                      {r.price !== null && (
                        <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{formatEur(r.price)}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Podatki o vozilu"
            icon={<IconInfo className="h-4 w-4" />}
            count={car.specs.length}
            {...sec("podatki")}
            onAdd={() => setDialog({ type: "spec", spec: null })}
            addLabel="Podatek"
          >
            {car.specs.length === 0 ? (
              <Empty text="Ni podatkov." />
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {car.specs.map((s) => (
                  <li key={s.id}>
                    <button type="button" className={ROW_BTN} onClick={() => setDialog({ type: "spec", spec: s })}>
                      <span className="min-w-0 flex-1 text-sm text-gray-500 dark:text-gray-400">{s.name}</span>
                      <span className="text-right text-sm font-medium">
                        {s.value || <span className="text-gray-400">—</span>}
                        {s.note && <span className="block text-xs font-normal text-gray-500">{s.note}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      <Modal
        open={dialog !== null}
        onClose={close}
        title={
          dialog?.type === "car"
            ? dialog.car ? "Uredi avto" : "Nov avto"
            : dialog?.type === "record"
              ? `${dialog.record ? "Uredi" : "Nov"} ${dialog.kind === "servis" ? "servis" : "vnos popravila"}${car ? ` · ${car.name}` : ""}`
              : dialog?.type === "deadline"
                ? dialog.deadline ? dialog.deadline.name : "Nov rok"
                : dialog?.type === "spec"
                  ? dialog.spec ? "Uredi podatek" : "Nov podatek"
                  : ""
        }
      >
        {dialog?.type === "car" && (
          <CarForm key={dialog.car?.id ?? "new"} car={dialog.car} people={people(memberNames)} onClose={close} />
        )}
        {dialog?.type === "record" && car && (
          <RecordForm
            key={dialog.record?.id ?? `new-${dialog.kind}`}
            carId={car.id}
            owners={car.owners}
            kind={dialog.kind}
            record={dialog.record}
            lastKm={lastKm}
            memberNames={memberNames}
            onClose={close}
          />
        )}
        {dialog?.type === "deadline" && car && (
          <DeadlineForm key={dialog.deadline?.id ?? "new"} carId={car.id} deadline={dialog.deadline} onClose={close} />
        )}
        {dialog?.type === "spec" && car && (
          <SpecForm key={dialog.spec?.id ?? "new"} carId={car.id} spec={dialog.spec} onClose={close} />
        )}
      </Modal>
    </div>
  );
}

// Člani + stalna imena (Nejc je tu tudi, preden se pridruži gospodinjstvu).
const people = (memberNames: string[]) => [...new Set([...memberNames, "Žiga", "Nejc", "Mama"])];

function Chips({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (name: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onToggle(n)}
          className={clsx(
            "rounded-full border px-2.5 py-1 text-xs",
            selected.includes(n)
              ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
              : "border-gray-200 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function CarForm({ car, people, onClose }: { car: CarDetail | null; people: string[]; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(car?.name ?? "");
  const [plate, setPlate] = useState(car?.plate ?? "");
  const [owners, setOwners] = useState<string[]>(car?.owners ?? ["Žiga", "Nejc"]);
  const [zoom, setZoom] = useState(car?.photo_zoom ?? 1);
  const [offset, setOffset] = useState(car?.photo_offset ?? 0);
  const { error, pending, run } = useSubmit(onClose);
  const options = [...new Set([...people, ...owners])];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const res = await saveCarAction({ id: car?.id, name, plate, owners, photoZoom: zoom, photoOffset: offset });
          if (!res.error && res.id) router.push(`/avti?avto=${res.id}`);
          return res;
        });
      }}
      className="space-y-4"
    >
      <Field label="Ime" htmlFor="car-name">
        <Input id="car-name" autoFocus placeholder="npr. Passat" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Registrska" htmlFor="car-plate">
        <Input id="car-plate" placeholder="npr. KR-FZ 782" value={plate} onChange={(e) => setPlate(e.target.value)} className="font-mono uppercase" />
      </Field>
      <div>
        <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Lastniki</p>
        <Chips
          options={options}
          selected={owners}
          onToggle={(n) => setOwners((o) => (o.includes(n) ? o.filter((x) => x !== n) : [...o, n]))}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {owners.length > 1
            ? "Stroški se med lastnike delijo na enake dele."
            : owners.length === 1
              ? `${owners[0]} plača stroške sam.`
              : "Izberi vsaj enega lastnika."}
        </p>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {car?.photo_url && (
        <div className="flex items-center gap-3">
          <CarPhoto url={car.photo_url} alt="" zoom={zoom} offset={offset} className="h-20 w-32" />
          <div className="min-w-0 flex-1 space-y-2">
            <label className="block text-sm">
              <span className="mb-1 flex justify-between text-gray-700 dark:text-gray-300">
                Povečava slike <span className="tabular-nums text-gray-500">{Math.round(zoom * 100)} %</span>
              </span>
              <input
                type="range"
                min={1}
                max={2}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-rose-600"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 flex justify-between text-gray-700 dark:text-gray-300">
                Položaj slike <span className="tabular-nums text-gray-500">{offset > 0 ? `${offset} % nižje` : offset < 0 ? `${-offset} % višje` : "sredina"}</span>
              </span>
              <input
                type="range"
                min={-30}
                max={30}
                step={1}
                value={-offset}
                onChange={(e) => setOffset(-Number(e.target.value))}
                className="w-full accent-rose-600"
              />
            </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setCarPhotoAction(car.id, null))}
            className="text-sm text-red-600 hover:underline dark:text-red-400"
          >
            Odstrani sliko
          </button>
          </div>
        </div>
      )}
      <FormButtons
        onClose={onClose}
        pending={pending}
        deleteLabel="Res izbriši avto in vso evidenco"
        onDelete={
          car
            ? () =>
                run(async () => {
                  const res = await deleteCarAction(car.id);
                  if (!res.error) router.push("/avti");
                  return res;
                })
            : undefined
        }
      />
    </form>
  );
}

const parseKm = (s: string) => {
  const t = s.replace(/[\s.]/g, "");
  return t === "" ? null : /^\d+$/.test(t) ? Number(t) : NaN;
};

function RecordForm({
  carId,
  owners,
  kind,
  record,
  lastKm,
  memberNames,
  onClose,
}: {
  carId: string;
  owners: string[];
  kind: CarRecordKind;
  record: KvitCarRecord | null;
  lastKm: number;
  memberNames: string[];
  onClose: () => void;
}) {
  const [day, setDay] = useState(record ? (record.day ?? "") : todayIso());
  const [km, setKm] = useState(record?.km?.toString() ?? "");
  const [description, setDescription] = useState(record?.description ?? "");
  const [nextKm, setNextKm] = useState(record?.next_service_km?.toString() ?? "");
  const [price, setPrice] = useState(record?.price != null ? amountInput(record.price) : "");
  // Avto z enim lastnikom (Megane → Mama): ta plača sam, privzeto je on.
  const shared = owners.length > 1;
  const [paidBy, setPaidBy] = useState(record ? record.paid_by : shared ? "" : (owners[0] ?? ""));
  const [settled, setSettled] = useState(record?.settled ?? false);
  const [note, setNote] = useState(record?.note ?? "");
  const { error, setError, pending, run } = useSubmit(onClose);
  const payers = [...new Set([...owners, ...people(memberNames)])];
  const priceN = parseAmount(price);
  const half = shared && priceN && !Number.isNaN(priceN) ? priceN / owners.length : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const kmN = parseKm(km);
        const nextN = parseKm(nextKm);
        if (Number.isNaN(kmN) || Number.isNaN(nextN)) return setError("Kilometri morajo biti število, npr. 207000.");
        if (Number.isNaN(priceN)) return setError("Cena mora biti znesek, npr. 58 ali 117,50.");
        run(() =>
          saveCarRecordAction({
            id: record?.id,
            carId,
            kind,
            day: day || null,
            km: kmN,
            description,
            nextServiceKm: nextN,
            price: priceN,
            paidBy,
            settled,
            note,
          })
        );
      }}
      className="space-y-4"
    >
      <Field label={kind === "servis" ? "Kaj je bilo narejeno" : "Kaj je bilo menjano ali popravljeno"} htmlFor="rec-desc">
        <Input
          id="rec-desc"
          autoFocus
          placeholder={kind === "servis" ? "npr. olje, oljni filter, filter za gorivo" : "npr. brisalci"}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Datum" htmlFor="rec-day">
          <Input id="rec-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <Field label="Kilometri" htmlFor="rec-km">
          <Input
            id="rec-km"
            inputMode="numeric"
            placeholder={lastKm ? String(lastKm) : "km"}
            value={km}
            onChange={(e) => setKm(e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cena (€)" htmlFor="rec-price">
          <Input id="rec-price" inputMode="decimal" placeholder="0,00" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        {kind === "servis" && (
          <Field label="Naslednji servis (km)" htmlFor="rec-next">
            <Input id="rec-next" inputMode="numeric" placeholder="km" value={nextKm} onChange={(e) => setNextKm(e.target.value)} />
          </Field>
        )}
      </div>
      <div className="space-y-2">
        <Field label="Plačal" htmlFor="rec-paid">
          <Input id="rec-paid" value={paidBy} onChange={(e) => setPaidBy(e.target.value)} />
        </Field>
        <Chips options={payers} selected={[paidBy]} onToggle={setPaidBy} />
        {shared && (
          <>
            {half !== null && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Na pol: {owners.map((o) => `${o} ${formatEur(half)}`).join(" · ")}
              </p>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={settled} onChange={(e) => setSettled(e.target.checked)} className="h-4 w-4 accent-rose-600" />
              Poravnano (ne šteje več v delitev)
            </label>
          </>
        )}
      </div>
      <Field label={kind === "servis" ? "Opombe / račun" : "Opombe"} htmlFor="rec-note">
        <Input id="rec-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <FormButtons
        onClose={onClose}
        pending={pending}
        deleteLabel="Res izbriši"
        onDelete={record ? () => run(() => deleteCarRecordAction(record.id)) : undefined}
      />
    </form>
  );
}

function DeadlineForm({ carId, deadline, onClose }: { carId: string; deadline: KvitCarDeadline | null; onClose: () => void }) {
  const [name, setName] = useState(deadline?.name ?? "");
  const [from, setFrom] = useState(deadline?.valid_from ?? "");
  const [until, setUntil] = useState(deadline?.valid_until ?? "");
  const [note, setNote] = useState(deadline?.note ?? "");
  const { error, pending, run } = useSubmit(onClose);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveCarDeadlineAction({ id: deadline?.id, carId, name, validFrom: from || null, validUntil: until || null, note }));
      }}
      className="space-y-4"
    >
      {!deadline && (
        <Field label="Ime" htmlFor="dl-name">
          <Input id="dl-name" autoFocus placeholder="npr. Menjava gum" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Velja od" htmlFor="dl-from">
          <Input id="dl-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Velja do / rok" htmlFor="dl-until">
          <Input id="dl-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        </Field>
      </div>
      <Field label="Opombe" htmlFor="dl-note">
        <Input id="dl-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <FormButtons
        onClose={onClose}
        pending={pending}
        deleteLabel="Res izbriši rok"
        onDelete={deadline ? () => run(() => deleteCarDeadlineAction(deadline.id)) : undefined}
      />
    </form>
  );
}

function SpecForm({ carId, spec, onClose }: { carId: string; spec: KvitCarSpec | null; onClose: () => void }) {
  const [name, setName] = useState(spec?.name ?? "");
  const [value, setValue] = useState(spec?.value ?? "");
  const [note, setNote] = useState(spec?.note ?? "");
  const { error, pending, run } = useSubmit(onClose);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveCarSpecAction({ id: spec?.id, carId, name, value, note }));
      }}
      className="space-y-4"
    >
      <Field label="Del avtomobila" htmlFor="spec-name">
        <Input id="spec-name" autoFocus={!spec} placeholder="npr. Velikost gum, olje" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Podatek" htmlFor="spec-value">
        <Input id="spec-value" autoFocus={!!spec} placeholder="npr. 205/55/R16" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <Field label="Opombe" htmlFor="spec-note">
        <Input id="spec-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <FormButtons
        onClose={onClose}
        pending={pending}
        deleteLabel="Res izbriši"
        onDelete={spec ? () => run(() => deleteCarSpecAction(spec.id)) : undefined}
      />
    </form>
  );
}
