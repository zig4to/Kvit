-- Poravnava skupnih stroškov avtov s potrditvijo.
-- Dolžnik (npr. Žiga) klikne „Poravnaj“ → vrstica `pending` z vnosi, ki jih
-- plačilo pokrije. Upnik (Nejc) na domači strani potrdi → vnosi dobijo
-- settled = true, vrstica `confirmed`. Zavrnitev/preklic → `rejected`.
create table public.kvit_car_settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default kvit_my_household()
    references public.kvit_households (id) on delete cascade,
  from_name text not null, -- dolžnik (prva beseda display_name = paid_by)
  to_name text not null,   -- upnik, ki mora potrditi
  amount numeric(10,2) not null check (amount > 0),
  record_ids uuid[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz
);
create index kvit_car_settlements_household_idx on public.kvit_car_settlements (household_id, status);

alter table public.kvit_car_settlements enable row level security;

create policy "kvit_car_settlements all" on public.kvit_car_settlements
  for all to authenticated using (household_id = kvit_my_household())
  with check (household_id = kvit_my_household());

alter publication supabase_realtime add table public.kvit_car_settlements;
