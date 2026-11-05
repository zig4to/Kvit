-- Lastniki avta: stroški (cena vnosov) se med lastnike delijo na enake dele.
-- Passat in Berlingo imata lastnika Žigo in Nejca (pol-pol), Megane je mamin
-- (plača sama). Imena so enaka kot v kvit_car_records.paid_by.

alter table public.kvit_cars add column if not exists owners text[] not null default '{}';

update public.kvit_cars set owners = array['Žiga', 'Nejc']
  where name in ('Passat', 'Berlingo') and owners = '{}';
update public.kvit_cars set owners = array['Mama']
  where name = 'Megane' and owners = '{}';
