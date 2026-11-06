-- Skupni stroški izven avtov (gumb „Dodaj strošek“ na domači strani).
-- paid_by je plačal cel `amount`, owed_by mu dolguje `share` (cel, pol ali
-- poljuben znesek). Več dolžnikov = ena vrstica na dolžnika. Prištejejo se v stanje Aktualno skupaj z avti in se
-- poravnajo prek kvit_car_settlements (record_ids vsebuje tudi id-je teh vrstic).
create table public.kvit_shared_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default kvit_my_household()
    references public.kvit_households (id) on delete cascade,
  label text not null,
  amount numeric(10,2) not null check (amount > 0),
  paid_by text not null, -- ime (prva beseda display_name)
  owed_by text not null, -- ime dolžnika
  share numeric(10,2) not null check (share > 0 and share <= amount),
  day date not null default current_date,
  settled boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (paid_by <> owed_by)
);
create index kvit_shared_expenses_household_idx on public.kvit_shared_expenses (household_id, settled);

alter table public.kvit_shared_expenses enable row level security;

create policy "kvit_shared_expenses all" on public.kvit_shared_expenses
  for all to authenticated using (household_id = kvit_my_household())
  with check (household_id = kvit_my_household());

alter publication supabase_realtime add table public.kvit_shared_expenses;
