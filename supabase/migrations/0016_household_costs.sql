-- Mesečni stroški gospodinjstva po kategorijah (zavihki Telekom, Elektrika,
-- Ogrevanje, Hrana na /lajf): en znesek na kategorijo in mesec.
create table public.kvit_household_costs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default kvit_my_household()
    references public.kvit_households (id) on delete cascade,
  category text not null check (category in ('telekom', 'elektrika', 'ogrevanje', 'hrana')),
  month date not null, -- 1. dan meseca
  amount numeric(10,2) not null check (amount >= 0),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (household_id, category, month)
);

alter table public.kvit_household_costs enable row level security;

create policy "kvit_household_costs all" on public.kvit_household_costs
  for all to authenticated using (household_id = kvit_my_household())
  with check (household_id = kvit_my_household());

alter publication supabase_realtime add table public.kvit_household_costs;
