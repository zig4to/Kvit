# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Kaj je Kvit

Družinska aplikacija za obračun stroškov skupnega življenja z mamo (nadomešča
stara Excela „ŽIGA / NEJC“ in „Avto Stroški in Servisi“). Uporabniki: brata
**Žiga** in **Nejc** (vloga `sin`) ter **Mama** (vloga `mama`).

1. **Lajf** — mesečni obračun. Vsak brat mami dolguje fiksni znesek na mesec
   (privzeto 350 €). Nakupi za hišo (Lidl, Hofer, deli za avto …) in plačila
   mami se odštejejo, posojila od mame prištejejo. Stanje ob koncu meseca
   (dolg ali dobropis) se **samo prenese** v naslednji mesec.
2. **Dolg** — „Skupni dolg“ do mame (posojilo za avto), ločen od mesečnih
   stroškov, z beleženjem odplačil (datum + znesek + opomba).
3. **Avti** — servisna evidenca Passat, Berlingo, Megane; delitev stroškov
   med lastnike in poravnava s potrditvijo.
4. **Domača stran** — kartice za prijavljenega člana; za mamo nadzorna plošča
   s potrjevanjem plačil.

Vsak član vidi vse v gospodinjstvu, ureja pa samo svoje (mesece, dolgove).

Ogrodje je kopija aplikacije **Cekar** (prijava, SSO iz huba TomsStudios, tema,
PWA/service worker, UI primitivi, gospodinjstvo s kodo za povabilo). Uporablja
isti Supabase projekt kot Pisi/Posel/Vzlet/Cekar, tabele imajo predpono `kvit_`.

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 ·
`@supabase/ssr`. Barva rose `#f43f5e` → violet `#8b5cf6`, znak Lucide
handshake. Jezik vmesnika: slovenščina.

## Ukazi

```bash
npm install
npm run dev      # http://localhost:3007
npm test         # scripts/check-balance.mjs — izračun (podatki iz Excela) + delitev stroškov avtov
npm run lint     # 6 opozoril v public/install-promo.js je od prej, napak 0
npm run build
```

## Okolje, deploy, zbirka aplikacij

- `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (isti na Vercelu — brez njih produkcija vrne 500 „Your project's URL and Key
  are required“).
- GitHub `https://github.com/zig4to/Kvit.git` (veja `main`), Vercel
  **https://kvit-pearl.vercel.app/** (regija dub1, `vercel.json`), deploy ob
  pushu na `main`.
- Registrirano v zbirki: TomsStudios `apps-registry.js` (id `kvit`, podnaslov
  „Obračun mesečnih stroškov“), Iskra `script.js` `APPS`, zaganjalnik
  `apps.json` (port 3007). Ob spremembi kartice v TomsStudios povečaj
  `VERZIJA` v njegovem `sw.js`.

## Baza (Supabase)

Projekt **ProjektiBaze** (`abjnxhfxjolwwxlckkje`). Vse migracije v
`supabase/migrations/` so **izvedene** (prek Supabase MCP `apply_migration`,
2026-11-05/06). `src/lib/types/database.types.ts` je **ročno napisan** — ob
novi migraciji ga posodobi; `num()` v `src/lib/data/kvit.ts` pretvori numeric
stolpce (`amount`, `fixed_amount`, `monthly_amount`, `price`, `settle_amount`)
v številke.

| Migracija | Vsebina |
|---|---|
| `0001_init` | `kvit_households` (`invite_code`), `kvit_members` (PK `user_id`, `display_name`, `monthly_amount` 350), `kvit_months` (unique `(user_id, month)`, `month` = 1. dan, `fixed_amount`, `settled`, `note`), `kvit_entries` (`kind` `nakup`/`placilo`/`posojilo`, `label`, `amount > 0`, `proof` `racun`/`potrdilo`, `day`), RLS, RPC `kvit_create_household` / `kvit_join_household`, realtime |
| `0002_debts` | `kvit_debts` (`label`, `amount` = prvotni znesek, `started_on`), `kvit_debt_payments` (`amount`, `day`, `note`) |
| `0003_cars` | `kvit_cars` (`name`, `plate`, `position`), `kvit_car_records` (`kind` `servis`/`popravilo`, `day`, `km`, `description`, `next_service_km`, `price`, `paid_by` = ime, `settled`, `note`), `kvit_car_deadlines` (unique `(car_id, name)`, `valid_from`, `valid_until`), `kvit_car_specs`; uvoz podatkov iz Excela |
| `0004_car_owners` | `kvit_cars.owners text[]` — Passat, Berlingo `{Žiga,Nejc}`, Megane `{Mama}` |
| `0005_car_photos` | `kvit_cars.photo_path`, zasebni bucket `kvit-avti` (10 MB, slike) |
| `0006_car_photo_zoom` | `photo_zoom real` 1–2,5 |
| `0007_car_photo_offset` | `photo_offset real` −40…40 (% višine okvirja, negativno = višje) |
| `0008_car_settlements` | `kvit_car_settlements` (`from_name`, `to_name`, `amount`, `record_ids uuid[]`, `status` `pending`/`confirmed`/`rejected`) |
| `0009_mama` | `kvit_members.role` `sin`/`mama`; `kvit_months.settle_requested_at`, `settle_amount`; `kvit_join_household(p_code, p_display_name, p_role default 'sin')`; RPC `kvit_confirm_month`, `kvit_reject_month` (prek `kvit_mama_month`, preverita vlogo mama) |
| `0010_lock_member_role` | sprožilec: vloge po pridružitvi ni mogoče spremeniti (sicer bi si sin dal vlogo mama in sam potrdil poravnavo) |
| `0011_receipts` | `kvit_entries.receipt_path`, zasebni bucket `kvit-racuni` |

**RLS:** `kvit_my_household()` (security definer). Vsi člani berejo vse v
gospodinjstvu. Meseci, vnosi in dolgovi: **piše samo lastnik**
(`user_id = auth.uid()`, vnosi prek `month_id`). Avti, zapisi, roki, podatki
in poravnave avtov: vsi člani berejo in pišejo (`for all` prek gospodinjstva).
Vstop v gospodinjstvo samo prek RPC. Mama tujih mesecev ne more pisati
neposredno — potrjuje prek security definer RPC.

**Storage** (pot vedno začne z `<household_id>/`):
- `kvit-avti`: `<household_id>/<car_id>/<uuid>.jpg` — celo gospodinjstvo bere,
  nalaga, briše.
- `kvit-racuni`: `<household_id>/<user_id>/<uuid>.jpg` — gospodinjstvo bere,
  nalaga/briše samo lastnik mape (`foldername[2] = auth.uid()`).

**Realtime:** `kvit_entries`, `kvit_months`, `kvit_debts`,
`kvit_debt_payments`, `kvit_cars`, `kvit_car_records`, `kvit_car_deadlines`,
`kvit_car_specs`, `kvit_car_settlements`. Komponente ob spremembi pokličejo
`router.refresh()` (z zamikom 300 ms).

## Izračun

`src/lib/kvit/balance.ts` (čiste funkcije **brez importov**, ker jih uvaža tudi
`scripts/check-balance.mjs` prek Node type stripping):

```
za doplačilo = prenos + fiksni + Σ posojila − Σ nakupi − Σ plačila
```

`computeLedger` gre od prvega zapisanega meseca do tekočega (ljubljanski čas,
`monthKey`). Manjkajoči meseci so **virtualni** (privzeti znesek člana), zato
prenos nikoli ne preskoči meseca. Ob vsakem pisanju akcija `ensureMonth`
(`src/actions/kvit.ts`) mesec zapiše in zapolni vrzel. Pred spremembo
privzetega zneska `setMonthlyAmountAction` zapiše pretekle virtualne mesece s
starim zneskom, da se zgodovina ne spremeni. Prazen mesec pred prvim zapisanim
(puščica ‹) bi prenesel 350 € naprej — zato zahteva potrditev.

`src/lib/kvit/cars.ts` (prav tako brez importov): `splitNet(records, owners)`
— neporavnan vnos s ceno: plačnik +cena, vsak lastnik −cena/n (en lastnik =
nič deljenja); `addNets`; `settlements(net)` (dolžniki → upniki, požrešno);
`dative` (Žiga → Žigi, Nejc → Nejcu, Mama → Mami).

**Imena:** `paid_by`, `owners`, `from_name`/`to_name` so imena, ne id-ji. Ime
člana = prva beseda `display_name` (`firstName()` v `src/lib/data/kvit.ts`,
„Žiga Tomše“ → „Žiga“). Nejc se mora pridružiti z imenom, ki se začne z
„Nejc“, mama z „Mama“, sicer se zapisi ne povežejo.

## Arhitektura

Server `src/app/(app)/*/page.tsx` → branje `src/lib/data/kvit.ts`
(`getMembership`, `getLedgers`, `getDebts`, `getCars`, `getCarBalance`,
`labelSuggestions`) → `"use client"` komponente v `src/components/kvit/`.
Mutacije: `"use server"` v `src/actions/kvit.ts` (`ctx()` vrne supabase,
userId, householdId; vsaka konča z `done()` = `revalidatePath("/", "layout")`).
Obrazci Avti/Dolg uporabljajo `FormParts.tsx` (`useSubmit`, `FormButtons`).
Ikone so Lucide-slog v `src/components/ui/icons.tsx` (brez emojijev).

**Zgornja vrstica** (`src/app/(app)/layout.tsx`): logo Kvit → `/`; glavni
zavihki **Domov** (hiška), **Lajf** (košarica), **Dolg**, **Avti** — na
računalniku (≥ 640 px) na sredini vrstice; desno Zgodovina in Nastavitve.
Uporabnik brez gospodinjstva vidi `Onboarding`.

### `/` — domača stran (`src/app/(app)/page.tsx`)

Sin vidi svoje kartice (`Card`; cela kartica je povezava, razen
`whole={false}`, kjer je povezava samo glava, ker so v vsebini gumbi):
1. **Aktualno** → `CarBalance` (skupni stroški avtov iz mojega pogleda:
   rdeče „Nejcu dolguješ X €“ / zeleno „Žiga ti dolguje X €“, pod tem seznam
   razlogov „Zimske Gume · Berlingo · plačal Nejc 365 € (pol 182,50 €)“).
2. **Lajf** — stanje tekočega meseca (Za doplačilo / Dobropis / Kvit,
   razčlenitev) → `/lajf`.
3. **Skupni dolg** — preostanek, odplačano, vrstica napredka, zadnje
   odplačilo → `/dolg`.

Mama vidi `MamaDashboard`: **Aktualno** (prošnje „Nejc pravi, da ti je plačal
270 € za stroške novembra“ → Potrdi / Zavrni), **Ta mesec** (stanje obeh
sinov: Plačano / Čaka na tvojo potrditev / Še ni plačal · X €), **Skupni dolg**
obeh sinov s skupno vsoto.

### Poravnava skupnih stroškov avtov (`CarBalance`, `0008`)

`getCarBalance(supabase, myName)` vrne `owed` (brez vnosov v čakajočih
poravnavah), `reasons`, `pending`. Dolžnik klikne „Poravnaj“ →
`settleCarsAction` zapiše `pending` vrstico z `record_ids`; dolžnik vidi
rumeno „Plačal si Nejcu … — čaka na potrditev“ (Prekliči), upnik zeleno
„Žiga pravi, da ti je plačal …“ (Potrdi / Zavrni). `confirmCarSettlementAction`
(samo `to_name`) označi te vnose `settled`. Če „Poravnaj“ klikne upnik, se
poravna takoj. Prikazano na domači strani in na vrhu `/avti`.

### `/lajf` — mesečni obračun (`MonthView`)

`?oseba=<user_id>&mesec=YYYY-MM`, privzeto jaz in tekoči mesec (mama privzeto
prvega sina, samo branje). Zamenjava osebe, ‹ › med meseci, kartica „Za
doplačilo“ / „Dobropis“ / „Kvit“ z razčlenitvijo (fiksni znesek s svinčnikom),
opomba meseca, vnosi. Plavajoči gumb „Dodaj“ → `EntryDialog` (znesek, vrsta,
opis s predlogi, dokazilo, dan, **slika računa**). Klik na vnos ga uredi ali
izbriše.

**Slika računa** (`0011`): „Slikaj račun“ → `uploadReceipt`
(`src/lib/kvit/car-photo.ts`, pomanjša na 2000 px) naloži takoj ob izbiri iz
brskalnika, vnos shrani samo pot (`saveEntryAction` preveri predpono
`<household>/<user>/`, ob zamenjavi/brisanju izbriše staro datoteko; zaprt
obrazec brez shranjevanja pobriše naložene). Dokazilo se samo nastavi na
„Račun“. Stran naredi začasne povezave (1 h) za vnose meseca → sličica desno
v vrstici, klik odpre račun v `Modal`.

**Poravnaj mesec:** brez mame v gospodinjstvu zapiše plačilo ostanka
(„Poravnava“) in `settled = true`. **Z mamo** samo zapiše
`settle_requested_at` + `settle_amount` → rumeno „Plačilo mami … čaka na
mamino potrditev“ (Prekliči = `unsettleMonthAction`); mama potrdi
(`confirmMonthAction` → RPC `kvit_confirm_month`: zapiše plačilo, `settled`)
ali zavrne (`kvit_reject_month`).

### `/dolg` — Skupni dolg (`DebtView`)

Sin vidi samo svoj dolg (brez zavihkov oseb, `?oseba=` tujega sina se
prezre). Mama vidi oba sinova (`?oseba=`, privzeto prvi sin, samo branje),
sama je izključena iz seznama. Kartica na
dolg (preostanek = `amount − Σ odplačil`, napredek, odplačila), „+ Odplačilo“
(znesek, datum, opomba), svinčnik za urejanje/brisanje, „Vpiši dolg“
(privzeto ime „Skupni dolg“). Z mesečnim obračunom ni povezan.

### `/avti` — avti (`CarsView`)

`?avto=<id>`. Zavihki avtov se menjajo **na odjemalcu** (`selectCar` +
`history.replaceState`), ne z navigacijo — sicer strežnik naredi nove
podpisane povezave do slik in slika ob menjavi poskoči; slike ostalih avtov
se naložijo vnaprej (skrit `<img>`), `CarPhoto` ima `key={car.id}`.

Na avto (razdelki zložljivi, `Section`, stanje v piškotku
`kvit-avti-zlozeno`, bere ga strežnik — brez utripa): **Pregledi in roki**
(poteklo / še N dni ≤ 30 / velja), **Redni servisi** (naslednji servis v km),
**Vzdrževanje in popravila** („+ Dodaj“), **Podatki o vozilu**. Servis in
popravilo imata Plačal (Žiga / Nejc / Mama) in Poravnano. Nov avto
(`saveCarAction`) dobi 5 privzetih rokov in „Velikost gum“.

Glava avta: slika (`0005`, kamera → `uploadCarPhoto` 1400 px →
`setCarPhotoAction`) ali logotip znamke (`CarLogo`, SVG, po imenu: Passat →
VW, Berlingo → Citroën, Megane → Renault). `CarPhoto` 128×80,
`object-contain object-bottom`, `transform: translateY(offset%) scale(zoom)`
z izhodiščem `50% 35%`; drsnika „Povečava slike“ in „Položaj slike“ v „Uredi
avto“. Trenutno: Passat zoom 1,35; Megane zoom 1,15, offset −10.

### Ostalo

- `/zgodovina` — strežniška stran z zavihki `?zavihek=lajf|dolg|avti`:
  **Lajf** (`?oseba=`, vsi meseci osebe z vsemi vnosi in stanjem ob koncu
  meseca), **Dolg** (vsa odplačila: sin samo svoja, mama obeh), **Avti**
  (vsi servisi/popravila vseh avtov po mesecih; meseci zložljivi z
  `<details>`, odprt najnovejši; prikazani zadnji 3, „Naloži več“ doda 3 prek
  `?mesecev=`). Oznake vrst vnosov so tam
  podvojene, ker je `KINDS` v `"use client"` modulu.
- `/nastavitve` `Settings` — privzeti mesečni znesek, gospodinjstvo, koda za
  povabilo, člani, tema, odjava.
- `Onboarding` — ustvari gospodinjstvo ali se pridruži s kodo; pri
  pridružitvi izbira „Kdo si?“ **Sin** / **Mama**.

## Stanje podatkov (2026-11-06)

- Gospodinjstvo „Bitne“: **Žiga** („Žiga Tomše“, sin), **Nejc** („Nejc
  Tomše“, sin) in **Mama** („Mama“, vloga `mama`). Nejc in mama sta bila
  vpisana prek SQL 2026-11-06.
- Meseci do vključno oktobra 2026 so poravnani izven aplikacije; **november
  2026 je prvi mesec** in začne s 350 € (brez prenosa). Prazne vrstice za
  september/oktober so bile izbrisane.
- Skupni dolg: Žiga 6.941 €, Nejc 8.172 € (oba „Skupni dolg“, brez odplačil).
- Avti uvoženi iz Excela. Servisna vrstica Megane v Excelu je enaka kot pri
  Passatu (isti datum in km) — uvožena kot je.
- Odprt skupni strošek: Zimske Gume, Berlingo, 365 €, plačal Nejc → Žiga
  dolguje Nejcu 182,50 €.

## Pasti

- **PWA / middleware:** `src/proxy.ts` matcher **mora** izključevati statične
  `.js` (`sw.js`, `install-promo.js`). `public/sw.js` je network-first; ob
  spremembi te datoteke povečaj `VERZIJA`.
- **Push na GitHub:** velik commit (~30 datotek, 3000 vrstic) je GitHub večkrat
  zavrnil z `! [remote rejected] … (fatal error in commit_refs_rules)` (tudi na
  novo vejo, brez izpada na githubstatus). Isti spremembe v manjših commitih so
  šle skozi — commitaj in pushaj sproti v manjših kosih.
- **Popravki prek `node -e` v bashu:** poševnice se izgubijo (`/\s+/` je
  postal `/s+/` → ime „Žiga Tom“). Za popravke z regexi ali vzvratnimi
  poševnicami uporabi Edit ali skripto, zapisano z Write. Datoteke so CRLF —
  skripte naj normalizirajo `\r\n`.
- **Podpisane povezave** (`createSignedUrls`) so ob vsakem upodabljanju nove,
  zato jih brskalnik ne predpomni; izogibaj se nepotrebnim navigacijam.
- Ne kliči `setState` v `useEffect` (lint `react-hooks/set-state-in-effect`) —
  za sinhronizacijo s propom uporabi vzorec „prejšnja vrednost v stanju“.
