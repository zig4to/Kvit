-- Mama: član gospodinjstva z vlogo 'mama' — nima mesečnega obračuna, ima
-- nadzorno ploščo (dolgova obeh sinov, stanje meseca) in potrjuje poravnave.
alter table public.kvit_members
  add column if not exists role text not null default 'sin' check (role in ('sin', 'mama'));

-- Sin klikne „Poravnaj mesec“ → settle_requested_at + settle_amount (koliko je
-- plačal). Mama potrdi (kvit_confirm_month: zapiše plačilo, settled = true)
-- ali zavrne (kvit_reject_month). Brez mame v gospodinjstvu se poravna takoj.
alter table public.kvit_months
  add column if not exists settle_requested_at timestamptz,
  add column if not exists settle_amount numeric(10,2) check (settle_amount >= 0);

-- Pridružitev z vlogo (privzeto sin).
drop function if exists public.kvit_join_household(text, text);
create function public.kvit_join_household(p_code text, p_display_name text, p_role text default 'sin')
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
  if p_role not in ('sin', 'mama') then
    raise exception 'Neveljavna vloga.';
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

  insert into kvit_members (user_id, household_id, display_name, role)
  values (auth.uid(), v_id, coalesce(trim(p_display_name), ''), p_role);

  return v_id;
end;
$$;

-- Preveri, da je klicatelj mama v gospodinjstvu meseca, in vrne mesec.
create or replace function public.kvit_mama_month(p_month_id uuid)
returns public.kvit_months
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month kvit_months;
begin
  select * into v_month from kvit_months where id = p_month_id;
  if v_month.id is null then
    raise exception 'Mesec ne obstaja.';
  end if;
  if not exists (
    select 1 from kvit_members
    where user_id = auth.uid() and role = 'mama' and household_id = v_month.household_id
  ) then
    raise exception 'Poravnavo lahko potrdi samo mama.';
  end if;
  if v_month.settle_requested_at is null then
    raise exception 'Mesec ne čaka na potrditev.';
  end if;
  return v_month;
end;
$$;

create or replace function public.kvit_confirm_month(p_month_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month kvit_months;
begin
  v_month := kvit_mama_month(p_month_id);
  if coalesce(v_month.settle_amount, 0) > 0 then
    insert into kvit_entries (month_id, kind, label, amount, day, created_by)
    values (p_month_id, 'placilo', 'Poravnava', v_month.settle_amount,
            (now() at time zone 'Europe/Ljubljana')::date, auth.uid());
  end if;
  update kvit_months
    set settled = true, settle_requested_at = null, settle_amount = null
    where id = p_month_id;
end;
$$;

create or replace function public.kvit_reject_month(p_month_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform kvit_mama_month(p_month_id);
  update kvit_months set settle_requested_at = null, settle_amount = null where id = p_month_id;
end;
$$;

revoke execute on function public.kvit_join_household(text, text, text) from public, anon;
revoke execute on function public.kvit_mama_month(uuid) from public, anon, authenticated;
revoke execute on function public.kvit_confirm_month(uuid) from public, anon;
revoke execute on function public.kvit_reject_month(uuid) from public, anon;
grant execute on function public.kvit_join_household(text, text, text) to authenticated;
grant execute on function public.kvit_confirm_month(uuid) to authenticated;
grant execute on function public.kvit_reject_month(uuid) to authenticated;
