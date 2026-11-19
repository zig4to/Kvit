-- Preimenuje avto „Berlingo“ v „Berlingo car“ (logotip Citroën se prepozna po besedi „berlingo“).
update public.kvit_cars set name = 'Berlingo car' where name = 'Berlingo';
