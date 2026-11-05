-- Avti: servisna evidenca skupnih avtov gospodinjstva (Passat, Berlingo,
-- Megane …). Po vzoru starega Excela ima vsak avto:
--   * roke (redni servis, tehnični pregled, registracija, zavarovanje, vinjeta),
--   * redne servise in sprotna popravila (kvit_car_records.kind),
--   * osnovne podatke o vozilu (npr. velikost gum).
-- Avti so skupni: vsi člani gospodinjstva berejo in urejajo vse.

create table public.kvit_cars (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.kvit_households (id) on delete cascade,
  name text not null,
  plate text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index kvit_cars_household_idx on public.kvit_cars (household_id);

-- servis    = redni servis (ima lahko naslednji servis v km)
-- popravilo = sprotno vzdrževanje / popravilo (kdo je plačal, poravnano)
create table public.kvit_car_records (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.kvit_cars (id) on delete cascade,
  kind text not null check (kind in ('servis', 'popravilo')),
  day date,
  km integer check (km >= 0),
  description text not null default '',
  next_service_km integer check (next_service_km >= 0),
  price numeric(10,2) check (price >= 0),
  paid_by text not null default '', -- ime (Žiga, Nejc, Mama …)
  settled boolean not null default false,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index kvit_car_records_car_idx on public.kvit_car_records (car_id);

-- Roki: en na vrsto na avto (Vinjeta 01.08.2026 – 01.08.2027 …).
create table public.kvit_car_deadlines (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.kvit_cars (id) on delete cascade,
  name text not null,
  valid_from date,
  valid_until date,
  note text not null default '',
  position integer not null default 0,
  unique (car_id, name)
);

-- Osnovni podatki o vozilu (del → podatek).
create table public.kvit_car_specs (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.kvit_cars (id) on delete cascade,
  name text not null,
  value text not null default '',
  note text not null default '',
  position integer not null default 0
);
create index kvit_car_specs_car_idx on public.kvit_car_specs (car_id);

alter table public.kvit_cars enable row level security;
alter table public.kvit_car_records enable row level security;
alter table public.kvit_car_deadlines enable row level security;
alter table public.kvit_car_specs enable row level security;

create policy "kvit_cars all" on public.kvit_cars
  for all to authenticated using (household_id = kvit_my_household())
  with check (household_id = kvit_my_household());

create policy "kvit_car_records all" on public.kvit_car_records
  for all to authenticated
  using (exists (select 1 from kvit_cars c where c.id = car_id and c.household_id = kvit_my_household()))
  with check (exists (select 1 from kvit_cars c where c.id = car_id and c.household_id = kvit_my_household()));

create policy "kvit_car_deadlines all" on public.kvit_car_deadlines
  for all to authenticated
  using (exists (select 1 from kvit_cars c where c.id = car_id and c.household_id = kvit_my_household()))
  with check (exists (select 1 from kvit_cars c where c.id = car_id and c.household_id = kvit_my_household()));

create policy "kvit_car_specs all" on public.kvit_car_specs
  for all to authenticated
  using (exists (select 1 from kvit_cars c where c.id = car_id and c.household_id = kvit_my_household()))
  with check (exists (select 1 from kvit_cars c where c.id = car_id and c.household_id = kvit_my_household()));

alter publication supabase_realtime add table public.kvit_cars;
alter publication supabase_realtime add table public.kvit_car_records;
alter publication supabase_realtime add table public.kvit_car_deadlines;
alter publication supabase_realtime add table public.kvit_car_specs;
