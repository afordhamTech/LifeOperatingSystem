import { describe, expect, it } from "vitest";
import { calculateSleepDurationHours } from "@/lib/sleep-duration";

describe("calculateSleepDurationHours", () => {
  it("handles overnight sleep", () => {
    expect(calculateSleepDurationHours("23:00", "07:00")).toBe(8);
    expect(calculateSleepDurationHours("22:30", "06:45")).toBe(8.25);
  });

  it("handles same-day sleep windows", () => {
    expect(calculateSleepDurationHours("01:00", "08:00")).toBe(7);
  });
});
