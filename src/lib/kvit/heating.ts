// Ogrevanje (kurilno olje): čiste funkcije brez importov.
// Datumi so "YYYY-MM-DD"; obdobje traja od dneva natankanja do dneva, ko olja
// zmanjka (ended_on null = še traja).

type Period = { started_on: string; ended_on: string | null; amount: number };

const DAY = 86_400_000;
const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export const daysBetween = (from: string, to: string) =>
  Math.max(1, Math.round((utc(to) - utc(from)) / DAY));

// Enkratni znesek polnitve se v obračunu deli na 12 mesecev.
export const HEATING_MONTHS = 12;
export const perMonth = (p: { amount: number }) =>
  Math.round((p.amount / HEATING_MONTHS) * 100) / 100;

// Ogrevanje meseca `key` (YYYY-MM): 1/12 polnitve, ki se kuri v tem mesecu
// (natankano do konca meseca in olja ni zmanjkalo pred začetkom meseca). Če
// se v mesecu prekrivata dve polnitvi, šteje novejša. null = ni polnitve.
export function heatingForMonth(periods: Period[], key: string): number | null {
  const [y, m] = key.split("-").map(Number);
  const start = Date.UTC(y, m - 1, 1);
  const end = Date.UTC(y, m, 1);
  const active = periods
    .filter((p) => utc(p.started_on) < end && (!p.ended_on || utc(p.ended_on) >= start))
    .sort((a, b) => b.started_on.localeCompare(a.started_on));
  return active.length ? perMonth(active[0]) : null;
}
