import { describe, expect, it } from "vitest";
import { calculateAcademicPressure } from "@/lib/academic-pressure";

describe("calculateAcademicPressure", () => {
  it("sums incomplete task pressure", () => {
    const result = calculateAcademicPressure(
      [
        {
          due_date: "2026-05-15",
          estimated_hours: 2,
          difficulty: 8,
          grade_impact: 9,
          status: "pending",
        },
        {
          due_date: "2026-05-16",
          estimated_hours: 1,
          difficulty: 4,
          grade_impact: 5,
          status: "completed",
        },
      ],
      new Date("2026-05-15T12:00:00"),
    );

    expect(result.rawScore).toBe(144);
    expect(result.category).toBe("Critical");
  });
});
