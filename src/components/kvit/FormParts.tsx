"use client";

import { useState, useTransition } from "react";
import Button from "@/components/ui/Button";
import type { KvitResult } from "@/actions/kvit";

// Skupni del obrazcev: shrani / izbriši (s potrditvijo) / prekliči.
export function useSubmit(onClose: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<KvitResult>) => {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res.error) setError(res.error);
      else onClose();
    });
  };
  return { error, setError, pending, run };
}

export function FormButtons({
  onClose,
  onDelete,
  pending,
  deleteLabel,
}: {
  onClose: () => void;
  onDelete?: () => void;
  pending: boolean;
  deleteLabel: string;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2">
      {onDelete ? (
        confirm ? (
          <Button type="button" variant="danger" disabled={pending} onClick={onDelete}>
            {deleteLabel}
          </Button>
        ) : (
          <Button type="button" variant="ghost" onClick={() => setConfirm(true)}>
            Izbriši
          </Button>
        )
      ) : (
        <span />
      )}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Prekliči
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Shranjujem …" : "Shrani"}
        </Button>
      </div>
    </div>
  );
}

