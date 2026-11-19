"use client";

import { useEffect } from "react";

export const SAVED_HOUSEHOLD_KEY = "kvit-gospodinjstvo";

export type SavedHousehold = {
  name: string;
  code: string;
  displayName: string;
  role: "sin" | "mama";
};

export function readSavedHouseholdRaw(): string | null {
  try {
    return localStorage.getItem(SAVED_HOUSEHOLD_KEY);
  } catch {
    return null;
  }
}

export function parseSavedHousehold(raw: string | null): SavedHousehold | null {
  try {
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedHousehold>;
    if (!v.code || !v.name) return null;
    return {
      name: v.name,
      code: v.code,
      displayName: v.displayName ?? "",
      role: v.role === "mama" ? "mama" : "sin",
    };
  } catch {
    return null;
  }
}

// Ob vsakem uspešnem nalaganju si zapomni gospodinjstvo (ime, koda, moje ime,
// vloga), da Onboarding ponudi „Nadaljuj v …“ brez vpisovanja kode, če seja ali
// omrežje za trenutek odpove in stran pomotoma pokaže zaslon za pridružitev.
export default function RememberHousehold(props: SavedHousehold) {
  const { name, code, displayName, role } = props;
  useEffect(() => {
    try {
      localStorage.setItem(
        SAVED_HOUSEHOLD_KEY,
        JSON.stringify({ name, code, displayName, role })
      );
    } catch {
      // zasebno okno / blokirana shramba — brez tega gumba
    }
  }, [name, code, displayName, role]);
  return null;
}
