import { describe, expect, it } from "vitest";
import { applyDiscount, calculateSubtotal, calculateTax, calculateTotal, type LineItem } from "./pricing";

const cart: LineItem[] = [
  { sku: "BOOK", unitPriceCents: 250, quantity: 2 },
  { sku: "MUG", unitPriceCents: 1_000, quantity: 1 },
];

describe("calculateSubtotal", () => {
  it("sums unit price times quantity", () => {
    expect(calculateSubtotal(cart)).toBe(1_500);
  });

  it("returns 0 for an empty cart", () => {
    expect(calculateSubtotal([])).toBe(0);
  });

  it.each([
    { sku: "FRACTION", unitPriceCents: 1.5, quantity: 1 },
    { sku: "NEGATIVE", unitPriceCents: -100, quantity: 1 },
    { sku: "ZERO_QTY", unitPriceCents: 100, quantity: 0 },
  ])("rejects invalid line item $sku", (item) => {
    expect(() => calculateSubtotal([item])).toThrow(RangeError);
  });
});

describe("applyDiscount", () => {
  it.each([
    [10_000, 0, 10_000],
    [10_000, 25, 7_500],
    [999, 10, 899],
    [10_000, 100, 0],
  ])("applyDiscount(%i, %i) returns %i", (amount, percent, expected) => {
    expect(applyDiscount(amount, percent)).toBe(expected);
  });

  it.each([-1, 101, Number.NaN])("rejects percent %d", (percent) => {
    expect(() => applyDiscount(10_000, percent)).toThrow(RangeError);
  });
});

describe("calculateTax", () => {
  it.each([
    [10_000, 1_900, 1_900],
    [2_000, 1_900, 380],
    [0, 1_900, 0],
  ])("calculateTax(%i, %i) returns %i", (amount, rate, expected) => {
    expect(calculateTax(amount, rate)).toBe(expected);
  });

  it("rejects a negative rate", () => {
    expect(() => calculateTax(1_000, -1)).toThrow(RangeError);
  });
});

describe("calculateTotal", () => {
  it("adds tax to the subtotal when there is no discount", () => {
    expect(calculateTotal(cart, { taxRateBasisPoints: 1_900 })).toEqual({
      subtotalCents: 1_500,
      discountCents: 0,
      taxCents: 285,
      totalCents: 1_785,
    });
  });

  it("applies the discount only once", () => {
    expect(
      calculateTotal([{ sku: "BOOK", unitPriceCents: 1_000, quantity: 1 }], {
        discountPercent: 10,
        taxRateBasisPoints: 0,
      }),
    ).toEqual({
      subtotalCents: 1_000,
      discountCents: 100,
      taxCents: 0,
      totalCents: 900,
    });
  });
});
