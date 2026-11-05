-- Slika avta (npr. bel Renault Megane): prikaže se v glavi avta namesto
-- logotipa znamke. Zasebni bucket kvit-avti, pot
-- <household_id>/<car_id>/<uuid>.jpg — dostop samo do mape lastnega gospodinjstva.

alter table public.kvit_cars add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kvit-avti', 'kvit-avti', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

create policy "kvit-avti select" on storage.objects
  for select to authenticated
  using (bucket_id = 'kvit-avti'
         and (storage.foldername(name))[1] = kvit_my_household()::text);
create policy "kvit-avti insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'kvit-avti'
              and (storage.foldername(name))[1] = kvit_my_household()::text);
create policy "kvit-avti delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'kvit-avti'
         and (storage.foldername(name))[1] = kvit_my_household()::text);
