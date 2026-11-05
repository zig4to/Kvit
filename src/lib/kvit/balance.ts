// Izračun obračuna — čiste funkcije brez odvisnosti (uvaža jih tudi
// scripts/check-balance.mjs, zato tu ni importov iz aplikacije).
//
//   za doplačilo = prenos iz prejšnjega meseca + fiksni znesek
//                  + posojila − nakupi − plačila
//
// Pozitivno = še dolžan mami, negativno = dobropis, ki se prenese naprej.

export type Kind = "nakup" | "placilo" | "posojilo";

export type LedgerInputMonth = {
  key: string; // "2026-11"
  fixed: number;
  settled: boolean;
  entries: { kind: Kind; amount: number }[];
};

export type LedgerRow = {
  key: string;
  fixed: number;
  settled: boolean;
  virtual: boolean; // mesec še ni zapisan v bazi (privzeti znesek)
  carryIn: number; // stanje iz prejšnjega meseca
  added: number; // vsota posojil
  deducted: number; // vsota nakupov in plačil
  balance: number; // za doplačilo (negativno = dobropis)
};

// Posojilo poveča dolg, nakup in plačilo ga zmanjšata.
export const kindSign = (kind: Kind) => (kind === "posojilo" ? 1 : -1);

const round2 = (n: number) => Math.round(n * 100) / 100;

export function addMonths(key: string, n: number) {
  const [y, m] = key.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

const MONTH_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Ljubljana",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Tekoči mesec in dan po ljubljanskem času.
export const todayIso = (d = new Date()) => MONTH_KEY.format(d); // "2026-11-05"
export const monthKey = (d = new Date()) => todayIso(d).slice(0, 7);

// Obračun enega člana od prvega zapisanega meseca do `untilKey`. Manjkajoči
// meseci vmes (in do `untilKey`) dobijo privzeti znesek, da prenos nikoli ne
// preskoči meseca. Brez zapisanih mesecev se obračun začne pri `untilKey`.
export function computeLedger(
  months: LedgerInputMonth[],
  defaultFixed: number,
  untilKey: string
): LedgerRow[] {
  const byKey = new Map(months.map((m) => [m.key, m]));
  const sorted = [...byKey.keys()].sort();
  const first = sorted[0] && sorted[0] < untilKey ? sorted[0] : untilKey;
  const last = sorted.length && sorted[sorted.length - 1] > untilKey ? sorted[sorted.length - 1] : untilKey;

  const rows: LedgerRow[] = [];
  let carry = 0;
  for (let key = first; key <= last; key = addMonths(key, 1)) {
    const m = byKey.get(key);
    const fixed = m ? m.fixed : defaultFixed;
    let added = 0;
    let deducted = 0;
    for (const e of m?.entries ?? []) {
      if (kindSign(e.kind) > 0) added += e.amount;
      else deducted += e.amount;
    }
    const balance = round2(carry + fixed + added - deducted);
    rows.push({
      key,
      fixed,
      settled: m?.settled ?? false,
      virtual: !m,
      carryIn: carry,
      added: round2(added),
      deducted: round2(deducted),
      balance,
    });
    carry = balance;
  }
  return rows;
}

const MONTHS_SL = [
  "januar", "februar", "marec", "april", "maj", "junij",
  "julij", "avgust", "september", "oktober", "november", "december",
];

// "2026-11" → "November 2026"
export function monthLabel(key: string, withYear = true) {
  const [y, m] = key.split("-").map(Number);
  const name = MONTHS_SL[m - 1];
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  return withYear ? `${cap} ${y}` : cap;
}

// Rodilnik za "prenos iz januarja".
const MONTHS_GEN = [
  "januarja", "februarja", "marca", "aprila", "maja", "junija",
  "julija", "avgusta", "septembra", "oktobra", "novembra", "decembra",
];
export const monthGenitive = (key: string) => MONTHS_GEN[Number(key.split("-")[1]) - 1];
