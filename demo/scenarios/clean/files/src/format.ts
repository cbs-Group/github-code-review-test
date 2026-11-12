import { assertCents } from "./pricing";

export function formatCents(amountCents: number, currency = "EUR", locale = "en-US"): string {
  assertCents(amountCents, "amountCents");
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amountCents / 100);
}
