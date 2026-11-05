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

Projekt **ProjektiBaze** (`abjnxhfxjolwwxlckkje`). `0001_init.sql`, `0002_debts.sql` in `0003_cars.sql` so izvedene
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

- `kvit_cars` (`0003`, `name`, `plate`, `position`) + `kvit_car_records`,
  `kvit_car_deadlines` (unique `(car_id, name)`), `kvit_car_specs`. Avti so
  **skupni**: vsi člani berejo in urejajo vse (politike `for all` prek `car_id`).

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

- `/` — domača stran, vsak član vidi svoje kartice: na vrhu „Aktualno“ (neporavnani skupni stroški avtov iz mojega pogleda: „Nejcu dolguješ X €“ / „V dobrem imaš X €“, ime = prva beseda `display_name` = `paid_by` → `/avti`), 1. „Lajf“ (stanje tekočega meseca → `/lajf`), 2. „Skupni dolg“ (preostanek, napredek, zadnje odplačilo → `/dolg`).
- `/lajf` `MonthView` (gumb „Lajf“ v zgornji vrstici, `?oseba=<user_id>&mesec=YYYY-MM`, privzeto jaz in tekoči
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
- `/avti` `CarsView` (gumb „Avti“, `?avto=<id>`): servisna evidenca skupnih
  avtov po vzoru Excela „Avto Stroški in Servisi“ (Passat, Berlingo, Megane —
  uvoženi 2026-11-05). Na avto: Pregledi in roki (`kvit_car_deadlines`, oznaka
  poteklo / še N dni (≤ 30) / velja), Redni servisi in Vzdrževanje in popravila
  (`kvit_car_records.kind` `servis` / `popravilo`; servis ima naslednji servis
  v km, popravilo „Plačal“ + Poravnano), Podatki o vozilu (`kvit_car_specs`).
  Nov avto (`saveCarAction`) dobi 5 privzetih rokov in „Velikost gum“.
  **Lastniki** (`0004`, `kvit_cars.owners text[]`): Passat in Berlingo Žiga +
  Nejc (stroški na pol), Megane Mama (plača sama). `src/lib/kvit/cars.ts`
  (`splitNet`, `settlements`, testi v `scripts/check-balance.mjs`): neporavnani
  vnosi s ceno in plačnikom → kartica `SplitSummary` na vrhu „Žiga dolguje
  Nejcu X €“; „Poravnaj“ (`settleCarsAction`) označi vse odprte kot poravnane.
  Plačal in Poravnano imata servis in popravilo.
  **Poravnava s potrditvijo** (`0008`, `kvit_car_settlements`): `getCarBalance`
  (`src/lib/data/kvit.ts`) → `CarBalance` (`src/components/kvit/CarBalance.tsx`, na
  domači strani „Aktualno“ in na vrhu `/avti`). Dolžnik klikne „Poravnaj“ →
  `settleCarsAction` zapiše vrstico `pending` (`from_name`, `to_name`, `amount`,
  `record_ids`); upnik vidi „Žiga pravi, da ti je plačal …“ → Potrdi
  (`confirmCarSettlementAction`, samo `to_name`; vnosi → `settled`) ali Zavrni,
  dolžnik lahko prekliče (`rejectCarSettlementAction`). Če „Poravnaj“ klikne
  upnik, se poravna takoj. Vnosi v čakajoči poravnavi niso več v „dolguje“.
  Zavihki avtov imajo levo logotip znamke (`CarLogo`, prepoznava po imenu
  modela: Passat → VW, Berlingo → Citroën, Megane → Renault; SVG v kodi).
  Razdelki so zložljivi (`Section`), stanje v piškotku `kvit-avti-zlozeno`
  (`src/lib/kvit/collapsed.ts`, bere ga strežnik — brez utripa).
  **Slika avta** (`0005`, `kvit_cars.photo_path`, zasebni bucket `kvit-avti`,
  pot `<household_id>/<car_id>/<uuid>.jpg`): kamera v glavi avta →
  `uploadCarPhoto` (`src/lib/kvit/car-photo.ts`, pomanjša na 1400 px, nalaga iz
  brskalnika) → `setCarPhotoAction` (staro datoteko izbriše). Slika nadomesti
  logotip v glavi (128×80, object-contain); `getCars` naredi začasne povezave (1 h). Povečava slike `photo_zoom` (`0006`, 1–2,5, drsnik v „Uredi avto“, `CarPhoto`: scale z izhodiščem 50 % 35 %, zato se avto ob povečavi pomakne nižje). Navpični zamik `photo_offset` (`0007`, −40…40 % višine okvirja, negativno = višje, drsnik „Položaj slike“).
  Obrazci uporabljajo `FormParts.tsx` (`useSubmit`, `FormButtons`) kot `DebtView`.
- **Slika računa** (`0011`, `kvit_entries.receipt_path`, zasebni bucket
  `kvit-racuni`, pot `<household_id>/<user_id>/<uuid>.jpg` — bere celo
  gospodinjstvo, nalaga/briše samo lastnik): v `EntryDialog` „Slikaj račun“ →
  `uploadReceipt` (`src/lib/kvit/car-photo.ts`, 2000 px) takoj ob izbiri, vnos
  shrani samo pot (`saveEntryAction` preveri predpono, staro sliko izbriše; ob
  preklicu obrazca se naložene slike pobrišejo). `/lajf` naredi začasne povezave
  za vnose meseca → sličica na desni vrstice, klik odpre račun.
- **Mama** (`0009`, `kvit_members.role` `sin` / `mama`, izbira „Kdo si?“ v
  Onboarding ob pridružitvi): nima mesečnega obračuna (`getLedgers` jo izpusti),
  `/` ji pokaže `MamaDashboard` — Aktualno (poravnave za potrditev), Ta mesec
  (stanje obeh sinov), Skupni dolg obeh sinov. Lajf in Dolg vidi samo za branje.
  Ko je v gospodinjstvu mama, „Poravnaj mesec“ (`settleMonthAction`) samo zapiše
  `kvit_months.settle_requested_at` + `settle_amount`; mama potrdi z RPC
  `kvit_confirm_month` (zapiše plačilo „Poravnava“, `settled = true`) ali zavrne
  (`kvit_reject_month`); oba RPC preverita vlogo. Sin lahko prošnjo prekliče
  (`unsettleMonthAction`). Brez mame se mesec poravna takoj kot prej. Vloge po
  pridružitvi ni mogoče spremeniti (sprožilec `0010`).
- `/zgodovina` — vsi meseci vseh članov s stanjem in kljukico poravnave.
- `/nastavitve` `Settings` — privzeti mesečni znesek, gospodinjstvo, koda,
  člani, tema, odjava.

### PWA / middleware past

`src/proxy.ts` matcher **mora** izključevati statične `.js` (`sw.js`,
`install-promo.js`). `public/sw.js` je network-first; ob spremembi povečaj
`VERZIJA`.
