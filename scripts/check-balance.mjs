// Preizkus izračuna na podatkih iz starega Excela.  node scripts/check-balance.mjs
import assert from "node:assert/strict";
import { addMonths, computeLedger } from "../src/lib/kvit/balance.ts";

const n = (...a) => a.map((amount) => ({ kind: "nakup", amount }));

// Žiga: januar–marec 2026
const ziga = computeLedger(
  [
    { key: "2026-01", fixed: 192, settled: true, entries: n(58, 88.5, 133, 65, 10, 16, 121, 58.48, 0) },
    { key: "2026-02", fixed: 350, settled: true, entries: n(22, 18.52, 11.8) },
    { key: "2026-03", fixed: 60, settled: true, entries: [] },
  ],
  350,
  "2026-03"
);
assert.deepEqual(ziga.map((r) => r.balance), [-357.98, -60.3, -0.3]);
assert.equal(ziga[1].carryIn, -357.98);

// Nejc: april zaključi s 1.428 €, maj: + 350 + posojilo 800 − 150 − 117 − 114
const nejc = computeLedger(
  [
    { key: "2026-04", fixed: 0, settled: true, entries: [{ kind: "posojilo", amount: 1428 }] },
    {
      key: "2026-05",
      fixed: 350,
      settled: true,
      entries: [{ kind: "posojilo", amount: 800 }, ...n(150, 117, 114)],
    },
  ],
  350,
  "2026-05"
);
assert.equal(nejc[1].balance, 2197);

// Manjkajoči meseci dobijo privzeti znesek, prenos teče naprej.
const gap = computeLedger([{ key: "2026-01", fixed: 350, settled: false, entries: [] }], 350, "2026-03");
assert.deepEqual(gap.map((r) => [r.key, r.virtual, r.balance]), [
  ["2026-01", false, 350],
  ["2026-02", true, 700],
  ["2026-03", true, 1050],
]);

// Brez mesecev: začne pri tekočem.
assert.deepEqual(computeLedger([], 350, "2026-11").map((r) => r.balance), [350]);

assert.equal(addMonths("2026-12", 1), "2027-01");
assert.equal(addMonths("2026-01", -1), "2025-12");

console.log("check-balance: vse OK");
