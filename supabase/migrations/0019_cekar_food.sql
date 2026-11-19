-- Hrana iz Cekarja: vsota zapravljenega (cekar_list_stores.spent) po mesecih
-- (ljubljanski čas) za Cekar gospodinjstva, v katerih je kateri koli član
-- mojega Kvit gospodinjstva. Security definer, ker RLS Cekarja vidi samo
-- lastno gospodinjstvo; vrne samo vsote, ne posameznih nakupov.
create or replace function public.kvit_cekar_food(p_from date)
returns table (month date, amount numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    date_trunc('month', ls.spent_at at time zone 'Europe/Ljubljana')::date as month,
    sum(ls.spent) as amount
  from cekar_list_stores ls
  join cekar_lists l on l.id = ls.list_id
  where ls.spent is not null
    and ls.spent_at is not null
    and (ls.spent_at at time zone 'Europe/Ljubljana')::date >= p_from
    and l.household_id in (
      select cm.household_id
      from cekar_members cm
      join kvit_members km on km.user_id = cm.user_id
      where km.household_id = kvit_my_household()
    )
  group by 1
  order by 1;
$$;

revoke all on function public.kvit_cekar_food(date) from public, anon;
grant execute on function public.kvit_cekar_food(date) to authenticated;
