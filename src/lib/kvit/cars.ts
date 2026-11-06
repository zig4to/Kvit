// Delitev stroškov avta med lastnike — čiste funkcije brez importov (uvaža jih
// tudi scripts/check-balance.mjs).
//
// Vsak neporavnan vnos s ceno: plačnik „vloži“ celo ceno, vsak lastnik nosi
// enak delež. Neto > 0 = lastnik dobi denar nazaj, < 0 = dolguje.
// Če je plačal nekdo, ki ni lastnik (npr. mama za Passat), ta znesek dolgujejo
// lastniki njemu — tudi to se vidi v neto stanju.

export type SplitRecord = { price: number | null; paid_by: string; settled: boolean };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function splitNet(records: SplitRecord[], owners: string[]): Map<string, number> {
  const net = new Map<string, number>(owners.map((o) => [o, 0]));
  if (owners.length < 2) return net; // en lastnik plača sam, ni kaj deliti
  for (const r of records) {
    if (r.settled || !r.price || !r.paid_by.trim()) continue;
    const payer = r.paid_by.trim();
    net.set(payer, (net.get(payer) ?? 0) + r.price);
    const share = r.price / owners.length;
    for (const o of owners) net.set(o, (net.get(o) ?? 0) - share);
  }
  for (const [k, v] of net) net.set(k, round2(v));
  return net;
}

// Dolg enega člana drugemu (from dolguje to).
export type Debt = { from: string; to: string; amount: number };

// Dolgovi iz vnosa avta: vsak lastnik razen plačnika dolguje plačniku cena/n.
export function recordDebts(r: SplitRecord, owners: string[]): Debt[] {
  const payer = r.paid_by.trim();
  if (owners.length < 2 || r.settled || !r.price || !payer) return [];
  const share = r.price / owners.length;
  return owners.filter((o) => o !== payer).map((o) => ({ from: o, to: payer, amount: share }));
}

// Neto po parih: kdo komu dolguje, brez preusmerjanja prek tretjega
// (Mama dolguje Žigi, Žiga Nejcu → ostaneta dva dolga, ne „Mama dolguje Nejcu“).
export function pairDebts(debts: Debt[]): Debt[] {
  const pair = new Map<string, Debt>();
  for (const d of debts) {
    if (d.from === d.to || !(d.amount > 0)) continue;
    const [a, b] = [d.from, d.to].sort();
    const key = `${a}\u0000${b}`;
    const p = pair.get(key) ?? { from: a, to: b, amount: 0 }; // amount > 0: a dolguje b
    p.amount += d.from === a ? d.amount : -d.amount;
    pair.set(key, p);
  }
  const out: Debt[] = [];
  for (const p of pair.values()) {
    const amount = round2(Math.abs(p.amount));
    if (amount < 0.005) continue;
    out.push(p.amount > 0 ? { from: p.from, to: p.to, amount } : { from: p.to, to: p.from, amount });
  }
  return out;
}

// Seštevek neto stanj več avtov (in skupnih stroškov).
export function addNets(nets: Map<string, number>[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const n of nets) for (const [k, v] of n) out.set(k, round2((out.get(k) ?? 0) + v));
  return out;
}

// Kdo komu dolguje: dolžniki plačajo upnikom (požrešno, najmanj nakazil).
export function settlements(net: Map<string, number>): { from: string; to: string; amount: number }[] {
  const debtors = [...net].filter(([, v]) => v < -0.004).map(([k, v]) => ({ k, v: -v }));
  const creditors = [...net].filter(([, v]) => v > 0.004).map(([k, v]) => ({ k, v }));
  const out: { from: string; to: string; amount: number }[] = [];
  for (const d of debtors) {
    for (const c of creditors) {
      if (d.v < 0.005) break;
      if (c.v < 0.005) continue;
      const amount = round2(Math.min(d.v, c.v));
      out.push({ from: d.k, to: c.k, amount });
      d.v -= amount;
      c.v -= amount;
    }
  }
  return out;
}

// Slovenski dajalnik imena za „dolguje Žigi“: Žiga → Žigi, Nejc → Nejcu, Mama → Mami.
export function dative(name: string) {
  if (/a$/i.test(name)) return name.slice(0, -1) + "i";
  if (/[cčjšžz]$/i.test(name)) return name + "u";
  return name + "u";
}
