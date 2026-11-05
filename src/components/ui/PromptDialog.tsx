"use client";

import { useEffect, useState, useTransition } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";

type PromptDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  label: string;
  submitLabel?: string;
  initialValue?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  onSubmit: (value: string) => Promise<{ error?: string } | void> | void;
};

export default function PromptDialog({
  open,
  onClose,
  title,
  label,
  submitLabel = "Shrani",
  initialValue = "",
  placeholder,
  allowEmpty = false,
  onSubmit,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    // Ponastavi polje ob vsakem odprtju dialoga.
    /* eslint-disable react-hooks/set-state-in-effect */
    setValue(initialValue);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, initialValue]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed && !allowEmpty) {
      setError("Polje ne sme biti prazno.");
      return;
    }
    startTransition(async () => {
      const res = await onSubmit(trimmed);
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      onClose();
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <Field label={label} htmlFor="prompt-value">
          <Input
            id="prompt-value"
            autoFocus
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Prekliči
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Shranjujem …" : submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
