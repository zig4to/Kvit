-- Odplačila dolga s potrditvijo mame: sin vpiše odplačilo → `pending`; mama
-- ga na nadzorni plošči potrdi (`confirmed`, šele takrat se odšteje od dolga)
-- ali zavrne (`rejected`, ne šteje). Brez mame v gospodinjstvu je odplačilo
-- takoj potrjeno. Obstoječa odplačila so potrjena.
alter table public.kvit_debt_payments
  add column if not exists status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'rejected')),
  add column if not exists resolved_at timestamptz;

-- Stanje določa baza, ne odjemalec: sin (lastnik, RLS mu dovoli pisanje) ne
-- more sam nastaviti `confirmed`. Nov vnos ali sprememba zneska/datuma →
-- `pending` (ponovna potrditev); ostale spremembe (opomba) obdržijo stanje.
-- Mama (prek RPC spodaj, auth.uid() je mama) stanje lahko spremeni.
create or replace function public.kvit_debt_payments_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid;
begin
  select household_id into v_household from kvit_debts where id = new.debt_id;
  if not exists (select 1 from kvit_members where household_id = v_household and role = 'mama') then
    new.status := 'confirmed';
    return new;
  end if;
  if exists (
    select 1 from kvit_members
    where user_id = auth.uid() and role = 'mama' and household_id = v_household
  ) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.resolved_at := null;
  elsif new.amount is distinct from old.amount
     or new.day is distinct from old.day
     or new.debt_id is distinct from old.debt_id then
    new.status := 'pending';
    new.resolved_at := null;
  else
    new.status := old.status;
    new.resolved_at := old.resolved_at;
  end if;
  return new;
end;
$$;

create trigger kvit_debt_payments_status
  before insert or update on public.kvit_debt_payments
  for each row execute function public.kvit_debt_payments_status();

-- Mama potrdi / zavrne odplačilo, ki čaka.
create or replace function public.kvit_mama_debt_payment(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment kvit_debt_payments;
  v_household uuid;
begin
  if p_status not in ('confirmed', 'rejected') then
    raise exception 'Neveljavno stanje.';
  end if;
  select * into v_payment from kvit_debt_payments where id = p_id;
  if v_payment.id is null then
    raise exception 'Odplačilo ne obstaja.';
  end if;
  select household_id into v_household from kvit_debts where id = v_payment.debt_id;
  if not exists (
    select 1 from kvit_members
    where user_id = auth.uid() and role = 'mama' and household_id = v_household
  ) then
    raise exception 'Odplačilo lahko potrdi samo mama.';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'Odplačilo ne čaka na potrditev.';
  end if;
  update kvit_debt_payments set status = p_status, resolved_at = now() where id = p_id;
end;
$$;

create or replace function public.kvit_confirm_debt_payment(p_id uuid)
returns void language sql security definer set search_path = public
as $$ select kvit_mama_debt_payment(p_id, 'confirmed') $$;

create or replace function public.kvit_reject_debt_payment(p_id uuid)
returns void language sql security definer set search_path = public
as $$ select kvit_mama_debt_payment(p_id, 'rejected') $$;

revoke execute on function public.kvit_debt_payments_status() from public, anon, authenticated;
revoke execute on function public.kvit_mama_debt_payment(uuid, text) from public, anon, authenticated;
revoke execute on function public.kvit_confirm_debt_payment(uuid) from public, anon;
revoke execute on function public.kvit_reject_debt_payment(uuid) from public, anon;
grant execute on function public.kvit_confirm_debt_payment(uuid) to authenticated;
grant execute on function public.kvit_reject_debt_payment(uuid) to authenticated;
