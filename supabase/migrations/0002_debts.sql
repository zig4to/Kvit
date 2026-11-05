-- Dolg do mame (npr. posojilo za avto) — ločen od mesečnih stroškov za hišo.
-- Vsak član ima lahko enega ali več dolgov, ki jih odplačuje s sprotnimi
-- plačili. Preostanek = amount − Σ plačil (izračun v aplikaciji).

create table public.kvit_debts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.kvit_households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null default 'Dolg',
  amount numeric(10,2) not null check (amount > 0),
  started_on date,
  created_at timestamptz not null default now()
);
create index kvit_debts_household_idx on public.kvit_debts (household_id);

create table public.kvit_debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.kvit_debts (id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  day date not null default current_date,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index kvit_debt_payments_debt_idx on public.kvit_debt_payments (debt_id);

alter table public.kvit_debts enable row level security;
alter table public.kvit_debt_payments enable row level security;

-- Bereš vse v gospodinjstvu, pišeš samo svoje (kot pri mesecih).
create policy "kvit_debts select" on public.kvit_debts
  for select to authenticated using (household_id = kvit_my_household());
create policy "kvit_debts insert own" on public.kvit_debts
  for insert to authenticated
  with check (user_id = auth.uid() and household_id = kvit_my_household());
create policy "kvit_debts update own" on public.kvit_debts
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and household_id = kvit_my_household());
create policy "kvit_debts delete own" on public.kvit_debts
  for delete to authenticated using (user_id = auth.uid());

create policy "kvit_debt_payments select" on public.kvit_debt_payments
  for select to authenticated
  using (exists (select 1 from kvit_debts d
                 where d.id = debt_id and d.household_id = kvit_my_household()));
create policy "kvit_debt_payments write own" on public.kvit_debt_payments
  for all to authenticated
  using (exists (select 1 from kvit_debts d where d.id = debt_id and d.user_id = auth.uid()))
  with check (exists (select 1 from kvit_debts d where d.id = debt_id and d.user_id = auth.uid()));

alter publication supabase_realtime add table public.kvit_debts;
alter publication supabase_realtime add table public.kvit_debt_payments;
