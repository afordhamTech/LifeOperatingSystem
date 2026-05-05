import { describe, expect, it } from "vitest";
import { getWeekStartDateKey, toDateKey } from "@/lib/date-helpers";

describe("date helpers", () => {
  it("formats local date keys without timezone drift", () => {
    expect(toDateKey(new Date("2026-05-05T12:34:56"))).toBe("2026-05-05");
  });

  it("returns the Monday of the current week", () => {
    expect(getWeekStartDateKey(new Date("2026-05-05T12:00:00"))).toBe("2026-05-04");
  });
});
