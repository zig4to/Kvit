"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createHouseholdAction, joinHouseholdAction, rejoinHouseholdAction } from "@/actions/kvit";
import { parseSavedHousehold, readSavedHouseholdRaw } from "@/components/kvit/RememberHousehold";

const noSubscribe = () => () => {};
import { logoutAction } from "@/actions/auth";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import clsx from "@/lib/utils/clsx";

// Prvi zagon: uporabnik še ni v gospodinjstvu. Ustvari novo (dobi kodo za
// povabilo) ali se pridruži obstoječemu s kodo.
export default function Onboarding({ email }: { email: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [displayName, setDisplayName] = useState(email?.split("@")[0] ?? "");
  const [householdName, setHouseholdName] = useState("Doma");
  const [code, setCode] = useState("");
  const [role, setRole] = useState<"sin" | "mama">("sin");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Gospodinjstvo z zadnjega uspešnega obiska (RememberHousehold). Bere se ob
  // prvem upodabljanju na odjemalcu; na strežniku je null.
  const savedRaw = useSyncExternalStore(
    noSubscribe,
    () => readSavedHouseholdRaw(),
    () => null
  );
  const saved = useMemo(() => parseSavedHousehold(savedRaw), [savedRaw]);
  const [rejoinError, setRejoinError] = useState<string | null>(null);
  const [rejoining, startRejoin] = useTransition();

  const rejoin = () => {
    if (!saved) return;
    setRejoinError(null);
    startRejoin(async () => {
      const res = await rejoinHouseholdAction(saved.code, saved.displayName, saved.role);
      if (res.relogin) {
        router.push("/login");
        return;
      }
      if (res.error) {
        setRejoinError(res.error);
        return;
      }
      router.refresh();
    });
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createHouseholdAction(householdName, displayName)
          : await joinHouseholdAction(code, displayName, role);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Dobrodošel v Kvitu</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Obračun stroškov za mamo. Prvi brat ustvari gospodinjstvo, drugi
          in mama se pridružita s kodo iz Nastavitev.
        </p>
      </div>

      {saved && (
        <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/60 dark:bg-rose-950/30">
          <Button type="button" onClick={rejoin} disabled={rejoining} className="w-full">
            {rejoining ? "Trenutek …" : `Nadaljuj v ${saved.name}`}
          </Button>
          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            Brez vpisovanja kode — kot {saved.displayName || "prej"}.
          </p>
          {rejoinError && (
            <p className="text-center text-sm text-red-600 dark:text-red-400">{rejoinError}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
        {(
          [
            ["create", "Ustvari"],
            ["join", "Pridruži se"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={clsx(
              "rounded-md py-1.5 text-sm font-medium",
              mode === m
                ? "bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100"
                : "text-gray-500 dark:text-gray-400"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
      >
        <Field label="Tvoje ime (vidijo ga člani)" htmlFor="display-name">
          <Input
            id="display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </Field>
        {mode === "create" ? (
          <Field label="Ime gospodinjstva" htmlFor="household-name">
            <Input
              id="household-name"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
            />
          </Field>
        ) : (
          <>
          <div>
            <p className="mb-1 text-sm text-gray-700 dark:text-gray-300">Kdo si?</p>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
              {(
                [
                  ["sin", "Sin (mesečni obračun)"],
                  ["mama", "Mama (nadzorna plošča)"],
                ] as const
              ).map(([r, label]) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={clsx(
                    "rounded-md px-2 py-1.5 text-sm font-medium",
                    role === r
                      ? "bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100"
                      : "text-gray-500 dark:text-gray-400"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Field label="Koda za povabilo" htmlFor="invite-code">
            <Input
              id="invite-code"
              value={code}
              autoCapitalize="characters"
              placeholder="npr. A1B2C3"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="font-mono tracking-widest"
            />
          </Field>
          </>
        )}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {pending
            ? "Trenutek …"
            : mode === "create"
              ? "Ustvari gospodinjstvo"
              : "Pridruži se"}
        </Button>
      </form>

      <form action={logoutAction} className="text-center">
        <button
          type="submit"
          className="text-xs text-gray-500 hover:underline dark:text-gray-400"
        >
          Odjava{email ? ` (${email})` : ""}
        </button>
      </form>
    </div>
  );
}
