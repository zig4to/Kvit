-- „Redni servis“ ni rok z datumom (servisi so v razdelku Redni servisi, z
-- naslednjim servisom v km), zato ga odstranimo iz „Pregledi in roki“.
-- Izbrišejo se samo prazne vrstice (brez datumov).
delete from public.kvit_car_deadlines
where name = 'Redni servis' and valid_from is null and valid_until is null;
