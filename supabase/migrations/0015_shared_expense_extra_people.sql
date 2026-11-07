-- Skupni strošek, pri katerem so sodelovale še osebe izven Kvita (npr. 4 ljudje
-- kupijo darilo): znesek se pri „Enako“ razdeli na plačnika, dolžnike in
-- extra_people. Te osebe se v Kvitu ne vodijo — število je samo za prikaz
-- in urejanje.
alter table kvit_shared_expenses
  add column extra_people smallint not null default 0
  check (extra_people between 0 and 50);
