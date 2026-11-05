// "23,45", "23.45 €", "1.234,50" → število; prazno → null; nesmisel → NaN.
export function parseAmount(text: string) {
  let s = text.replace(/[€\s]/g, "");
  if (s === "") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return /^\d+(\.\d{0,2})?$/.test(s) ? Number(s) : NaN;
}

const EUR = new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR" });
export const formatEur = (n: number) => EUR.format(n);

// 23.5 → "23,50" (za vnosno polje)
export const amountInput = (n: number) => n.toFixed(2).replace(".", ",");
