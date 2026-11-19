-- Nova kategorija mesečnih stroškov gospodinjstva: Komunala (zavihek na /lajf).
alter table public.kvit_household_costs
  drop constraint kvit_household_costs_category_check;

alter table public.kvit_household_costs
  add constraint kvit_household_costs_category_check
  check (category in ('telekom', 'elektrika', 'ogrevanje', 'hrana', 'komunala'));
