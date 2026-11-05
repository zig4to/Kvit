"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { addMonths, monthKey } from "@/lib/kvit/balance";
import type { EntryKind, EntryProof } from "@/lib/types/database.types";

export type KvitResult = { error?: string };

type Supa = Awaited<ReturnType<typeof createClient>>;

async function ctx(): Promise<
  | {
      supabase: Supa;
      userId: string;
      householdId: string;
      monthlyAmount: number;
      error?: undefined;
    }
  | { error: string }
> {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return { error: "Nisi prijavljen." };
  const { data } = await supabase
    .from("kvit_members")
    .select("household_id, monthly_amount")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return { error: "Nisi član gospodinjstva." };
  return {
    supabase,
    userId: user.id,
    householdId: data.household_id,
    monthlyAmount: Number(data.monthly_amount),
  };
}

type Ctx = Exclude<Awaited<ReturnType<typeof ctx>>, { error: string }>;

function done(): KvitResult {
  revalidatePath("/", "layout");
  return {};
}

const fail = (message: string | undefined, fallback: string): KvitResult => ({
  error: message || fallback,
});

const isKey = (k: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(k);

// Zagotovi, da mesec `key` obstaja v bazi, in zapolni vrzel od zadnjega
// zapisanega meseca do njega (s privzetim zneskom), da je prenos neprekinjen.
// Vrne id meseca.
async function ensureMonth(c: Ctx, key: string): Promise<string | null> {
  const { data: existing } = await c.supabase
    .from("kvit_months")
    .select("id, month")
    .eq("user_id", c.userId)
    .order("month");
  const keys = new Set((existing ?? []).map((m) => m.month.slice(0, 7)));
  const hit = (existing ?? []).find((m) => m.month.startsWith(key));
  if (hit) return hit.id;

  // Vrzel: med zadnjim mesecem pred `key` in `key`, ali med `key` in prvim po njem.
  const sorted = [...keys].sort();
  const before = sorted.filter((k) => k < key).pop();
  const after = sorted.find((k) => k > key);
  const toAdd: string[] = [];
  if (before) for (let k = addMonths(before, 1); k < key; k = addMonths(k, 1)) toAdd.push(k);
  toAdd.push(key);
  if (after) for (let k = addMonths(key, 1); k < after; k = addMonths(k, 1)) toAdd.push(k);

  const { error } = await c.supabase.from("kvit_months").upsert(
    toAdd.map((k) => ({
      household_id: c.householdId,
      user_id: c.userId,
      month: `${k}-01`,
      fixed_amount: c.monthlyAmount,
    })),
    { onConflict: "user_id,month", ignoreDuplicates: true }
  );
  if (error) return null;
  const { data } = await c.supabase
    .from("kvit_months")
    .select("id")
    .eq("user_id", c.userId)
    .eq("month", `${key}-01`)
    .maybeSingle();
  return data?.id ?? null;
}

// ===== Gospodinjstvo =====

export async function createHouseholdAction(name: string, displayName: string): Promise<KvitResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("kvit_create_household", {
    p_name: name,
    p_display_name: displayName,
  });
  if (error) return fail(error.message, "Gospodinjstva ni bilo mogoče ustvariti.");
  return done();
}

export async function joinHouseholdAction(code: string, displayName: string): Promise<KvitResult> {
  if (!code.trim()) return { error: "Vnesi kodo." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("kvit_join_household", {
    p_code: code,
    p_display_name: displayName,
  });
  if (error) return fail(error.message, "Pridružitev ni uspela.");
  return done();
}

export async function renameHouseholdAction(name: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  if (!name.trim()) return { error: "Ime ne sme biti prazno." };
  const { error } = await c.supabase
    .from("kvit_households")
    .update({ name: name.trim() })
    .eq("id", c.householdId);
  if (error) return fail(undefined, "Shranjevanje ni uspelo.");
  return done();
}

export async function setDisplayNameAction(name: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { error } = await c.supabase
    .from("kvit_members")
    .update({ display_name: name.trim() })
    .eq("user_id", c.userId);
  if (error) return fail(undefined, "Shranjevanje ni uspelo.");
  return done();
}

// Privzeti mesečni znesek: velja za nove mesece in tudi za tekoči mesec, če
// zanj fiksni znesek še ni bil ročno spremenjen (= enak staremu privzetemu).
export async function setMonthlyAmountAction(amount: number): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  if (!(amount >= 0)) return { error: "Vpiši znesek." };
  // Pretekle (še nezapisane) mesece zapiši s starim zneskom, da se ne spremenijo.
  await ensureMonth(c, monthKey());
  const { error } = await c.supabase
    .from("kvit_members")
    .update({ monthly_amount: amount })
    .eq("user_id", c.userId);
  if (error) return fail(undefined, "Shranjevanje ni uspelo.");
  await c.supabase
    .from("kvit_months")
    .update({ fixed_amount: amount })
    .eq("user_id", c.userId)
    .eq("month", `${monthKey()}-01`)
    .eq("fixed_amount", c.monthlyAmount);
  return done();
}

export async function leaveHouseholdAction(): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { error } = await c.supabase.from("kvit_members").delete().eq("user_id", c.userId);
  if (error) return fail(undefined, "Izstop ni uspel.");
  revalidatePath("/", "layout");
  redirect("/");
}

// ===== Meseci =====

export async function setFixedAmountAction(key: string, amount: number): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  if (!isKey(key) || !(amount >= 0)) return { error: "Vpiši znesek." };
  const id = await ensureMonth(c, key);
  if (!id) return { error: "Meseca ni bilo mogoče ustvariti." };
  const { error } = await c.supabase.from("kvit_months").update({ fixed_amount: amount }).eq("id", id);
  if (error) return fail(undefined, "Shranjevanje ni uspelo.");
  return done();
}

export async function setMonthNoteAction(key: string, note: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  if (!isKey(key)) return { error: "Neveljaven mesec." };
  const id = await ensureMonth(c, key);
  if (!id) return { error: "Meseca ni bilo mogoče ustvariti." };
  const { error } = await c.supabase
    .from("kvit_months")
    .update({ note: note.trim() || null })
    .eq("id", id);
  if (error) return fail(undefined, "Shranjevanje ni uspelo.");
  return done();
}

// Doda prazen mesec pred prvim (za vnos zgodovine).
export async function addMonthAction(key: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  if (!isKey(key)) return { error: "Neveljaven mesec." };
  const id = await ensureMonth(c, key);
  if (!id) return { error: "Meseca ni bilo mogoče ustvariti." };
  return done();
}

// Poravnaj: če je ostal dolg, ga zapiše kot plačilo mami; mesec označi kot
// poravnan. `balance` pošlje odjemalec (prikazano stanje) — strežnik ga ne
// računa ponovno, ker zahteva celotno verigo mesecev.
export async function settleMonthAction(key: string, balance: number): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  if (!isKey(key)) return { error: "Neveljaven mesec." };
  const id = await ensureMonth(c, key);
  if (!id) return { error: "Meseca ni bilo mogoče ustvariti." };
  if (balance > 0) {
    const { error } = await c.supabase.from("kvit_entries").insert({
      month_id: id,
      kind: "placilo",
      label: "Poravnava",
      amount: Math.round(balance * 100) / 100,
      created_by: c.userId,
    });
    if (error) return fail(undefined, "Plačila ni bilo mogoče zapisati.");
  }
  const { error } = await c.supabase.from("kvit_months").update({ settled: true }).eq("id", id);
  if (error) return fail(undefined, "Shranjevanje ni uspelo.");
  return done();
}

export async function unsettleMonthAction(key: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { error } = await c.supabase
    .from("kvit_months")
    .update({ settled: false })
    .eq("user_id", c.userId)
    .eq("month", `${key}-01`);
  if (error) return fail(undefined, "Shranjevanje ni uspelo.");
  return done();
}

// ===== Vnosi =====

export type EntryInput = {
  id?: string;
  monthKey: string;
  kind: EntryKind;
  label: string;
  amount: number;
  proof: EntryProof | null;
  day: string | null; // "YYYY-MM-DD"
};

export async function saveEntryAction(input: EntryInput): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  if (!isKey(input.monthKey)) return { error: "Neveljaven mesec." };
  if (!(input.amount > 0)) return { error: "Znesek mora biti večji od 0." };
  if (!["nakup", "placilo", "posojilo"].includes(input.kind)) return { error: "Neveljavna vrsta." };
  const day = input.day && /^\d{4}-\d{2}-\d{2}$/.test(input.day) ? input.day : null;

  const id = await ensureMonth(c, input.monthKey);
  if (!id) return { error: "Meseca ni bilo mogoče ustvariti." };

  const row = {
    month_id: id,
    kind: input.kind,
    label: input.label.trim(),
    amount: Math.round(input.amount * 100) / 100,
    proof: input.proof,
    day,
  };
  const { error } = input.id
    ? await c.supabase.from("kvit_entries").update(row).eq("id", input.id)
    : await c.supabase.from("kvit_entries").insert({ ...row, created_by: c.userId });
  if (error) return fail(undefined, "Vnosa ni bilo mogoče shraniti.");
  return done();
}

export async function deleteEntryAction(id: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { error } = await c.supabase.from("kvit_entries").delete().eq("id", id);
  if (error) return fail(undefined, "Brisanje ni uspelo.");
  return done();
}

// ===== Dolg (ločen od mesečnih stroškov) =====

const isDay = (d: string | null | undefined) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

export async function saveDebtAction(input: {
  id?: string;
  label: string;
  amount: number;
  startedOn: string | null;
}): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  if (!(input.amount > 0)) return { error: "Znesek dolga mora biti večji od 0." };
  const row = {
    label: input.label.trim() || "Dolg",
    amount: Math.round(input.amount * 100) / 100,
    started_on: isDay(input.startedOn) ? input.startedOn : null,
  };
  const { error } = input.id
    ? await c.supabase.from("kvit_debts").update(row).eq("id", input.id)
    : await c.supabase
        .from("kvit_debts")
        .insert({ ...row, household_id: c.householdId, user_id: c.userId });
  if (error) return fail(undefined, "Dolga ni bilo mogoče shraniti.");
  return done();
}

export async function deleteDebtAction(id: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { error } = await c.supabase.from("kvit_debts").delete().eq("id", id);
  if (error) return fail(undefined, "Brisanje ni uspelo.");
  return done();
}

export async function saveDebtPaymentAction(input: {
  id?: string;
  debtId: string;
  amount: number;
  day: string;
  note: string;
}): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  if (!(input.amount > 0)) return { error: "Znesek mora biti večji od 0." };
  if (!isDay(input.day)) return { error: "Izberi datum." };
  const row = {
    amount: Math.round(input.amount * 100) / 100,
    day: input.day,
    note: input.note.trim(),
  };
  const { error } = input.id
    ? await c.supabase.from("kvit_debt_payments").update(row).eq("id", input.id)
    : await c.supabase
        .from("kvit_debt_payments")
        .insert({ ...row, debt_id: input.debtId, created_by: c.userId });
  if (error) return fail(undefined, "Plačila ni bilo mogoče shraniti.");
  return done();
}

export async function deleteDebtPaymentAction(id: string): Promise<KvitResult> {
  const c = await ctx();
  if (c.error !== undefined) return { error: c.error };
  const { error } = await c.supabase.from("kvit_debt_payments").delete().eq("id", id);
  if (error) return fail(undefined, "Brisanje ni uspelo.");
  return done();
}
