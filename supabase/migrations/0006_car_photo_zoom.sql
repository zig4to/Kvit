-- Povečava slike avta v glavi (1 = cela slika, 1.3 = 30 % bližje).
alter table public.kvit_cars
  add column if not exists photo_zoom real not null default 1
  check (photo_zoom >= 1 and photo_zoom <= 2.5);

update public.kvit_cars set photo_zoom = 1.25 where name = 'Passat' and photo_zoom = 1;
