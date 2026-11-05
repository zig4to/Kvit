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
  joined_at: string;
};

export type KvitMonth = {
  id: string;
  household_id: string;
  user_id: string;
  month: string; // "YYYY-MM-01"
  fixed_amount: number;
  settled: boolean;
  note: string | null;
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
    };
    Views: Record<string, never>;
    Functions: {
      kvit_my_household: { Args: Record<string, never>; Returns: string };
      kvit_create_household: {
        Args: { p_name: string; p_display_name: string };
        Returns: string;
      };
      kvit_join_household: {
        Args: { p_code: string; p_display_name: string };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
