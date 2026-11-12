export interface LineItem {
  sku: string;
  unitPriceCents: number;
  quantity: number;
}

export interface TotalOptions {
  discountPercent?: number;
  taxRateBasisPoints: number;
}

export interface Totals {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

export function assertCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer amount of cents`);
  }
}

export function calculateSubtotal(items: readonly LineItem[]): number {
  return items.reduce((sum, item) => {
    assertCents(item.unitPriceCents, `unitPriceCents of ${item.sku}`);
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new RangeError(`quantity of ${item.sku} must be a positive integer`);
    }
    return sum + item.unitPriceCents * item.quantity;
  }, 0);
}

export function applyDiscount(amountCents: number, percent: number): number {
  assertCents(amountCents, "amountCents");
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError("percent must be between 0 and 100");
  }
  return amountCents - Math.round((amountCents * percent) / 100);
}

export function calculateTax(amountCents: number, rateBasisPoints: number): number {
  assertCents(amountCents, "amountCents");
  if (!Number.isSafeInteger(rateBasisPoints) || rateBasisPoints < 0) {
    throw new RangeError("rateBasisPoints must be a non-negative integer");
  }
  const rate = rateBasisPoints / 10_000;
  return amountCents * rate;
}

export function calculateTotal(items: readonly LineItem[], options: TotalOptions): Totals {
  const discountPercent = options.discountPercent ?? 0;
  const subtotalCents = calculateSubtotal(items);
  const discountedCents = applyDiscount(subtotalCents, discountPercent);
  const taxCents = calculateTax(discountedCents, options.taxRateBasisPoints);
  return {
    subtotalCents,
    discountCents: subtotalCents - discountedCents,
    taxCents,
    totalCents: applyDiscount(discountedCents, discountPercent) + taxCents,
  };
}
