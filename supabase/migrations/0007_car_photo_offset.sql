-- Navpični zamik slike avta v glavi (v % višine okvirja, negativno = višje).
alter table public.kvit_cars
  add column if not exists photo_offset real not null default 0
  check (photo_offset >= -40 and photo_offset <= 40);

update public.kvit_cars set photo_zoom = 1.15, photo_offset = -6 where name = 'Megane' and photo_offset = 0;
