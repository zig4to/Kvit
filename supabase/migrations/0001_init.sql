-- Kvit — mesečni obračun stroškov skupnega življenja.
--
-- Vsak član gospodinjstva (brat) ima svoje mesece: fiksni znesek (privzeto
-- 350 €), od katerega se odštejejo nakupi in plačila, posojila pa prištejejo.
-- Stanje (dolg ali dobropis) se samo prenese v naslednji mesec — izračun je v
-- aplikaciji (src/lib/kvit/balance.ts), baza hrani samo vnose.
--
-- Vsi člani vidijo vse mesece gospodinjstva, pišejo pa samo v svoje.

-- ===== Tabele =====

create table public.kvit_households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique
    default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
  created_at timestamptz not null default now()
);

create table public.kvit_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.kvit_households (id) on delete cascade,
  display_name text not null default '',
  monthly_amount numeric(10,2) not null default 350 check (monthly_amount >= 0),
  joined_at timestamptz not null default now()
);
create index kvit_members_household_idx on public.kvit_members (household_id);

-- En mesec enega člana. `month` je vedno 1. dan meseca.
create table public.kvit_months (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.kvit_households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  fixed_amount numeric(10,2) not null default 350 check (fixed_amount >= 0),
  settled boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, month)
);
create index kvit_months_household_idx on public.kvit_months (household_id, month);

-- nakup    = kupil sem nekaj za hišo → odšteje se
-- placilo  = dal sem mami denar      → odšteje se
-- posojilo = mama mi je posodila     → prišteje se
create table public.kvit_entries (
  id uuid primary key default gen_random_uuid(),
  month_id uuid not null references public.kvit_months (id) on delete cascade,
  kind text not null default 'nakup' check (kind in ('nakup', 'placilo', 'posojilo')),
  label text not null default '',
  amount numeric(10,2) not null check (amount > 0),
  proof text check (proof in ('racun', 'potrdilo')),
  day date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index kvit_entries_month_idx on public.kvit_entries (month_id);

-- ===== Pomožne funkcije =====

create or replace function public.kvit_my_household()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.kvit_members where user_id = auth.uid()
$$;

create or replace function public.kvit_create_household(p_name text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Nisi prijavljen.';
  end if;
  if exists (select 1 from kvit_members where user_id = auth.uid()) then
    raise exception 'Si že član gospodinjstva.';
  end if;

  insert into kvit_households (name)
  values (coalesce(nullif(trim(p_name), ''), 'Doma'))
  returning id into v_id;

  insert into kvit_members (user_id, household_id, display_name)
  values (auth.uid(), v_id, coalesce(trim(p_display_name), ''));

  return v_id;
end;
$$;

create or replace function public.kvit_join_household(p_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_current uuid;
begin
  if auth.uid() is null then
    raise exception 'Nisi prijavljen.';
  end if;

  select id into v_id from kvit_households where invite_code = upper(trim(p_code));
  if v_id is null then
    raise exception 'Neveljavna koda.';
  end if;

  select household_id into v_current from kvit_members where user_id = auth.uid();
  if v_current = v_id then
    return v_id;
  end if;
  if v_current is not null then
    raise exception 'Najprej zapusti trenutno gospodinjstvo.';
  end if;

  insert into kvit_members (user_id, household_id, display_name)
  values (auth.uid(), v_id, coalesce(trim(p_display_name), ''));

  return v_id;
end;
$$;

revoke execute on function public.kvit_my_household() from public, anon;
revoke execute on function public.kvit_create_household(text, text) from public, anon;
revoke execute on function public.kvit_join_household(text, text) from public, anon;
grant execute on function public.kvit_my_household() to authenticated;
grant execute on function public.kvit_create_household(text, text) to authenticated;
grant execute on function public.kvit_join_household(text, text) to authenticated;

-- ===== RLS =====

alter table public.kvit_households enable row level security;
alter table public.kvit_members enable row level security;
alter table public.kvit_months enable row level security;
alter table public.kvit_entries enable row level security;

create policy "kvit_households select" on public.kvit_households
  for select to authenticated using (id = kvit_my_household());
create policy "kvit_households update" on public.kvit_households
  for update to authenticated using (id = kvit_my_household())
  with check (id = kvit_my_household());

create policy "kvit_members select" on public.kvit_members
  for select to authenticated using (household_id = kvit_my_household());
create policy "kvit_members update own" on public.kvit_members
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and household_id = kvit_my_household());
create policy "kvit_members delete own" on public.kvit_members
  for delete to authenticated using (user_id = auth.uid());

-- Meseci: bereš vse v gospodinjstvu, pišeš samo svoje.
create policy "kvit_months select" on public.kvit_months
  for select to authenticated using (household_id = kvit_my_household());
create policy "kvit_months insert own" on public.kvit_months
  for insert to authenticated
  with check (user_id = auth.uid() and household_id = kvit_my_household());
create policy "kvit_months update own" on public.kvit_months
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and household_id = kvit_my_household());
create policy "kvit_months delete own" on public.kvit_months
  for delete to authenticated using (user_id = auth.uid());

create policy "kvit_entries select" on public.kvit_entries
  for select to authenticated
  using (exists (select 1 from kvit_months m
                 where m.id = month_id and m.household_id = kvit_my_household()));
create policy "kvit_entries write own" on public.kvit_entries
  for all to authenticated
  using (exists (select 1 from kvit_months m
                 where m.id = month_id and m.user_id = auth.uid()))
  with check (exists (select 1 from kvit_months m
                      where m.id = month_id and m.user_id = auth.uid()));

-- ===== Realtime =====
alter publication supabase_realtime add table public.kvit_entries;
alter publication supabase_realtime add table public.kvit_months;
