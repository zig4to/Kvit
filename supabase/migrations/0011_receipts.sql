-- Slika računa ob vnosu (npr. nakup v Lidlu). Zasebni bucket kvit-racuni, pot
-- <household_id>/<user_id>/<uuid>.jpg. Bere celo gospodinjstvo (brat, mama),
-- nalaga in briše samo lastnik mape.
alter table public.kvit_entries add column if not exists receipt_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kvit-racuni', 'kvit-racuni', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

create policy "kvit-racuni select" on storage.objects
  for select to authenticated
  using (bucket_id = 'kvit-racuni'
         and (storage.foldername(name))[1] = kvit_my_household()::text);
create policy "kvit-racuni insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'kvit-racuni'
              and (storage.foldername(name))[1] = kvit_my_household()::text
              and (storage.foldername(name))[2] = auth.uid()::text);
create policy "kvit-racuni delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'kvit-racuni'
         and (storage.foldername(name))[1] = kvit_my_household()::text
         and (storage.foldername(name))[2] = auth.uid()::text);
