import { describe, expect, it } from "vitest";
import { formatCents } from "./format";

describe("formatCents", () => {
  it.each([
    [123_456, "USD", "$1,234.56"],
    [50, "EUR", "€0.50"],
    [0, "USD", "$0.00"],
  ])("formatCents(%i, %s) returns %s", (amount, currency, expected) => {
    expect(formatCents(amount, currency)).toBe(expected);
  });

  it.each([-1, 1.5])("rejects invalid amount %d", (amount) => {
    expect(() => formatCents(amount)).toThrow(RangeError);
  });
});
