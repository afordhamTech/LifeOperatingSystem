import { describe, expect, it } from "vitest";
import { formatDecimalHours, getOpenTimeMinutes, minutesToDecimalHours } from "@/lib/calendar-capacity";

describe("calendar capacity helpers", () => {
  it("converts minutes to decimal hours accurately", () => {
    expect(minutesToDecimalHours(915)).toBe(15.25);
    expect(formatDecimalHours(915)).toBe("15.25 hours");
  });

  it("uses one open-time source", () => {
    const snapshot = { capacity: { totalAvailableMinutes: 915 } };
    expect(getOpenTimeMinutes(snapshot)).toBe(getOpenTimeMinutes(915));
  });
});
