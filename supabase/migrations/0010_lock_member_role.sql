-- Vloga (sin/mama) se določi ob pridružitvi in je ni mogoče spremeniti —
-- sicer bi si sin lahko dal vlogo mama in sam potrdil svojo poravnavo.
create or replace function public.kvit_members_lock_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    raise exception 'Vloge člana ni mogoče spremeniti.';
  end if;
  return new;
end;
$$;

create trigger kvit_members_lock_role
  before update on public.kvit_members
  for each row execute function public.kvit_members_lock_role();
