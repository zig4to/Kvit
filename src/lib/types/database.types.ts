// Ročno napisani tipi za tabele Kvita v Supabase (predpona `kvit_`).
// Ustrezajo supabase/migrations/0001_init.sql. Ob vsaki novi migraciji, ki
// doda stolpec/tabelo, jih je treba ročno posodobiti.

type Table<Row, Required extends keyof Row> = {
  Relationships: [];
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
};

export type KvitHousehold = {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
};

export type KvitMember = {
  user_id: string;
  household_id: string;
  display_name: string;
  monthly_amount: number;
  role: MemberRole; // sin = ima mesečni obračun, mama = nadzorna plošča + potrjevanje
  joined_at: string;
};

export type MemberRole = "sin" | "mama";

export type KvitMonth = {
  id: string;
  household_id: string;
  user_id: string;
  month: string; // "YYYY-MM-01"
  fixed_amount: number;
  settled: boolean;
  note: string | null;
  settle_requested_at: string | null; // sin je kliknil „Poravnaj“, čaka na mamo
  settle_amount: number | null; // koliko pravi, da je plačal
  created_at: string;
};

export type EntryKind = "nakup" | "placilo" | "posojilo";
export type EntryProof = "racun" | "potrdilo";

export type KvitEntry = {
  id: string;
  month_id: string;
  kind: EntryKind;
  label: string;
  amount: number;
  proof: EntryProof | null;
  day: string | null; // "YYYY-MM-DD"
  receipt_path: string | null; // slika računa v bucketu kvit-racuni
  created_by: string | null;
  created_at: string;
};

// Dolg do mame (npr. za avto), ločen od mesečnih stroškov.
export type KvitDebt = {
  id: string;
  household_id: string;
  user_id: string;
  label: string;
  amount: number; // prvotni znesek dolga
  started_on: string | null;
  created_at: string;
};

export type KvitDebtPayment = {
  id: string;
  debt_id: string;
  amount: number;
  day: string; // "YYYY-MM-DD"
  note: string;
  created_by: string | null;
  created_at: string;
};

// Avti: servisna evidenca skupnih avtov gospodinjstva.
export type KvitCar = {
  id: string;
  household_id: string;
  name: string;
  plate: string;
  photo_path: string | null; // slika v bucketu kvit-avti (namesto logotipa)
  photo_zoom: number; // povečava slike v glavi (1 = cela slika)
  photo_offset: number; // navpični zamik slike v % (negativno = višje)
  owners: string[]; // lastniki — stroški se delijo na enake dele (en lastnik = plača sam)
  position: number;
  created_at: string;
};

export type CarRecordKind = "servis" | "popravilo";

export type KvitCarRecord = {
  id: string;
  car_id: string;
  kind: CarRecordKind;
  day: string | null;
  km: number | null;
  description: string;
  next_service_km: number | null;
  price: number | null;
  paid_by: string;
  settled: boolean;
  note: string;
  created_by: string | null;
  created_at: string;
};

export type KvitCarDeadline = {
  id: string;
  car_id: string;
  name: string;
  valid_from: string | null;
  valid_until: string | null;
  note: string;
  position: number;
};

export type KvitCarSpec = {
  id: string;
  car_id: string;
  name: string;
  value: string;
  note: string;
  position: number;
};

// Poravnava skupnih stroškov avtov: dolžnik prijavi plačilo, upnik potrdi.
export type KvitCarSettlement = {
  id: string;
  household_id: string;
  from_name: string; // dolžnik
  to_name: string; // upnik (potrdi)
  amount: number;
  record_ids: string[]; // vnosi, ki jih plačilo pokrije
  status: "pending" | "confirmed" | "rejected";
  created_by: string | null;
  created_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
};

// Skupni strošek izven avtov (0012): paid_by plačal amount, owed_by dolguje share.
export type KvitSharedExpense = {
  id: string;
  household_id: string;
  label: string;
  amount: number; // cel nakup
  paid_by: string; // ime plačnika
  owed_by: string; // ime dolžnika
  share: number; // koliko dolguje owed_by
  day: string;
  settled: boolean;
  created_by: string | null;
  created_at: string;
};

export type KvitMembership = {
  member: KvitMember;
  household: KvitHousehold;
};

export type Database = {
  public: {
    Tables: {
      kvit_households: Table<KvitHousehold, "name">;
      kvit_members: Table<KvitMember, "user_id" | "household_id">;
      kvit_months: Table<KvitMonth, "household_id" | "user_id" | "month">;
      kvit_entries: Table<KvitEntry, "month_id" | "amount">;
      kvit_debts: Table<KvitDebt, "household_id" | "user_id" | "amount">;
      kvit_debt_payments: Table<KvitDebtPayment, "debt_id" | "amount">;
      kvit_cars: Table<KvitCar, "household_id" | "name">;
      kvit_car_records: Table<KvitCarRecord, "car_id" | "kind">;
      kvit_car_deadlines: Table<KvitCarDeadline, "car_id" | "name">;
      kvit_car_specs: Table<KvitCarSpec, "car_id" | "name">;
      kvit_car_settlements: Table<KvitCarSettlement, "from_name" | "to_name" | "amount">;
      kvit_shared_expenses: Table<KvitSharedExpense, "label" | "amount" | "paid_by" | "owed_by" | "share">;
    };
    Views: Record<string, never>;
    Functions: {
      kvit_my_household: { Args: Record<string, never>; Returns: string };
      kvit_create_household: {
        Args: { p_name: string; p_display_name: string };
        Returns: string;
      };
      kvit_join_household: {
        Args: { p_code: string; p_display_name: string; p_role?: MemberRole };
        Returns: string;
      };
      kvit_confirm_month: { Args: { p_month_id: string }; Returns: undefined };
      kvit_reject_month: { Args: { p_month_id: string }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
