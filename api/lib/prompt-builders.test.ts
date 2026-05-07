import { describe, expect, it } from "vitest";
import { PROMPT_OPTIONS, buildLifeeePrompt } from "@/lib/prompt-builders";

describe("prompt builders", () => {
  it("exposes every Phase B prompt button", () => {
    expect(PROMPT_OPTIONS.map((option) => option.label)).toEqual([
      "Daily Plan",
      "Task Triage",
      "Calendar Planning",
      "Sleep Recovery",
      "Academic Rescue",
      "MCAT Tutor",
      "Workout Adjustment",
      "Nutrition Fix",
      "Weekly Review",
      "Bible Study",
      "Relationship Message",
      "Career Proof",
      "Full Lifeee Context Export",
    ]);
  });

  it("builds a daily plan prompt from supplied Lifeee context only", () => {
    const prompt = buildLifeeePrompt("daily-plan", {
      date: "2026-05-07",
      operatingMode: "Recovery",
      taskSummary: "Must do: finish lab report",
      timelineSummary: "09:00 class, 14:00 deep work",
      mcatSummary: "Review amino acids",
    });

    expect(prompt).toContain("Daily Plan");
    expect(prompt).toContain("finish lab report");
    expect(prompt).toContain("09:00 class");
    expect(prompt).toContain("Use only the Lifeee context supplied below");
  });
});
