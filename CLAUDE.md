# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Kaj je Kvit

Mesečni obračun stroškov skupnega življenja (nadomešča stari Excel). Vsak brat
mami dolguje fiksni znesek na mesec (privzeto 350 €). Nakupi za hišo (Lidl,
Hofer, deli za avto …) in plačila mami se od tega odštejejo, posojila od mame
se prištejejo. Stanje ob koncu meseca (dolg ali dobropis) se **samo prenese**
v naslednji mesec. Vsak član vidi svoj in bratov obračun, ureja pa samo svojega.

Ogrodje je kopija aplikacije **Cekar** (prijava, SSO iz huba TomsStudios, tema,
PWA/service worker, UI primitivi, gospodinjstvo s kodo za povabilo). Uporablja
isti Supabase projekt kot Pisi/Posel/Vzlet/Cekar, tabele imajo predpono `kvit_`.

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 ·
`@supabase/ssr`. Deploy: Vercel. Barva rose `#f43f5e` → violet `#8b5cf6`,
znak Lucide handshake.

## Ukazi

```bash
npm install
npm run dev      # http://localhost:3007
npm test         # scripts/check-balance.mjs — izračun na podatkih iz Excela
npm run lint
npm run build
```

## Okoljske spremenljivke (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Baza (Supabase)

Projekt **ProjektiBaze** (`abjnxhfxjolwwxlckkje`). `0001_init.sql` in `0002_debts.sql` sta izvedena
(prek Supabase MCP, 2026-11-05). `src/lib/types/database.types.ts` je **ročno
napisan** — ob novi migraciji ga posodobi.

- `kvit_households` (`invite_code`), `kvit_members` (PK `user_id`,
  `monthly_amount` = privzeti mesečni znesek).
- `kvit_months` — en mesec enega člana (`month` = 1. dan, unique
  `(user_id, month)`), `fixed_amount` (za vsak mesec svoj — npr. 60 €, ko je
  bil cel mesec odsoten), `settled`, `note`.
- `kvit_entries` — `kind`: `nakup` / `placilo` (odšteje) ali `posojilo`
  (prišteje), `label`, `amount > 0`, `proof` (`racun` / `potrdilo`), `day`.

- `kvit_debts` (`0002`) — dolg do mame (npr. za avto), **ločen od mesečnih
  stroškov**: `label`, `amount` (prvotni znesek), `started_on`. En član ima
  lahko več dolgov. `kvit_debt_payments` — odplačila (`amount`, `day`, `note`).
  Preostanek = `amount − Σ odplačil` (`getDebts` v `src/lib/data/kvit.ts`).

RLS: `kvit_my_household()` (security definer). Vsi člani berejo vse v
gospodinjstvu, **pišejo samo v svoje mesece** (`user_id = auth.uid()`, vnosi
prek `month_id`). Vstop samo prek RPC `kvit_create_household` /
`kvit_join_household`. Realtime: `kvit_entries`, `kvit_months`, `kvit_debts`, `kvit_debt_payments`.
Dolgovi imajo enaka pravila (bereš vse, pišeš svoje).

## Izračun

`src/lib/kvit/balance.ts` (čiste funkcije brez importov, ker jih uvaža tudi
`scripts/check-balance.mjs` prek Node type stripping):

```
za doplačilo = prenos + fiksni + Σ posojila − Σ nakupi − Σ plačila
```

`computeLedger` gre od prvega zapisanega meseca do tekočega (ljubljanski čas,
`monthKey`). Manjkajoči meseci so **virtualni** (privzeti znesek člana), zato
prenos nikoli ne preskoči meseca. Ob vsakem pisanju akcija `ensureMonth`
(`src/actions/kvit.ts`) mesec zapiše in zapolni vrzel. Pred spremembo
privzetega zneska `setMonthlyAmountAction` zapiše pretekle virtualne mesece s
starim zneskom, da se zgodovina ne spremeni.

## Arhitektura

Server `src/app/(app)/*/page.tsx` → branje `src/lib/data/kvit.ts`
(`getLedgers`: člani, meseci, vnosi v enem `Promise.all`, RLS brez filtra) →
`"use client"` komponente v `src/components/kvit/`. Mutacije: `"use server"`
v `src/actions/kvit.ts` (`ctx()`, vsaka konča z `revalidatePath("/", "layout")`).

- `/` `MonthView` (`?oseba=<user_id>&mesec=YYYY-MM`, privzeto jaz in tekoči
  mesec). Na vrhu zamenjava osebe, ‹ › med meseci (‹ na prvem lastnem mesecu
  doda prejšnji mesec za vnos zgodovine), kartica „Za doplačilo“ / „Dobropis“ /
  „Kvit“ z razčlenitvijo (fiksni znesek je mogoče urejati s svinčnikom), opomba
  meseca, vnosi. Plavajoči gumb „Dodaj“ odpre `EntryDialog` (znesek, vrsta,
  opis s predlogi iz `labelSuggestions`, račun/potrdilo, dan). Klik na vnos ga
  uredi ali izbriše. „Poravnaj mesec“ (potrditev na mestu) zapiše plačilo
  ostanka (če je dolg) in nastavi `settled`.
- `/dolg` `DebtView` (gumb „Dolg“ v zgornji vrstici, `?oseba=`): kartica na
  dolg (preostanek, vrstica napredka, seznam odplačil), „+ Odplačilo“, svinčnik
  za urejanje/brisanje dolga, „Vpiši dolg“. Z mesečnim obračunom ni povezan.
- `/zgodovina` — vsi meseci vseh članov s stanjem in kljukico poravnave.
- `/nastavitve` `Settings` — privzeti mesečni znesek, gospodinjstvo, koda,
  člani, tema, odjava.

### PWA / middleware past

`src/proxy.ts` matcher **mora** izključevati statične `.js` (`sw.js`,
`install-promo.js`). `public/sw.js` je network-first; ob spremembi povečaj
`VERZIJA`.
