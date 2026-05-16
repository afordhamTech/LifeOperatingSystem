import { describe, expect, it } from "vitest";
import { formatCurrencyInput, parseCurrencyInput } from "@/lib/money-format";

describe("money formatting", () => {
  it("formats and parses whole-dollar currency", () => {
    expect(formatCurrencyInput(1500)).toBe("$1,500");
    expect(parseCurrencyInput("$1,500")).toBe(1500);
  });
});
