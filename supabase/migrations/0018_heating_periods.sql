-- Ogrevanje (kurilno olje): obdobje od natankanja do dneva, ko ga zmanjka
-- (ended_on null = še traja). Zavihek Ogrevanje na /lajf; seštevek meseca na
-- zavihku Lajf razdeli znesek zaključenega obdobja sorazmerno po dnevih.
create table public.kvit_heating_periods (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default kvit_my_household()
    references public.kvit_households (id) on delete cascade,
  started_on date not null,
  ended_on date,
  amount numeric(10,2) not null check (amount > 0),
  liters numeric(10,1) check (liters is null or liters > 0),
  note text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ended_on is null or ended_on >= started_on)
);

alter table public.kvit_heating_periods enable row level security;

create policy "kvit_heating_periods all" on public.kvit_heating_periods
  for all to authenticated using (household_id = kvit_my_household())
  with check (household_id = kvit_my_household());

alter publication supabase_realtime add table public.kvit_heating_periods;
