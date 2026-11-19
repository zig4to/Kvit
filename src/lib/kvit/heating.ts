// Ogrevanje (kurilno olje): čiste funkcije brez importov.
// Datumi so "YYYY-MM-DD"; obdobje traja od dneva natankanja do dneva, ko olja
// zmanjka (dan konca ni štet), najmanj 1 dan.

type Period = { started_on: string; ended_on: string | null; amount: number };

const DAY = 86_400_000;
const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export const daysBetween = (from: string, to: string) =>
  Math.max(1, Math.round((utc(to) - utc(from)) / DAY));

// Povprečni strošek na mesec (30,44 dni) zaključenega obdobja.
export const perMonth = (p: Period & { ended_on: string }) =>
  (p.amount / daysBetween(p.started_on, p.ended_on)) * 30.44;

// Del zneskov zaključenih obdobij, ki pade v mesec `key` (YYYY-MM), sorazmerno
// po dnevih. Obdobja, ki še trajajo, niso šteta (konec ni znan). null = v
// mesecu ni nobenega zaključenega obdobja.
export function heatingForMonth(periods: Period[], key: string): number | null {
  const [y, m] = key.split("-").map(Number);
  const start = Date.UTC(y, m - 1, 1);
  const end = Date.UTC(y, m, 1);
  let total = 0;
  let hit = false;
  for (const p of periods) {
    if (!p.ended_on) continue;
    const a = utc(p.started_on);
    const b = Math.max(utc(p.ended_on), a + DAY);
    const overlap = Math.min(b, end) - Math.max(a, start);
    if (overlap <= 0) continue;
    hit = true;
    total += (p.amount * overlap) / (b - a);
  }
  return hit ? Math.round(total * 100) / 100 : null;
}
