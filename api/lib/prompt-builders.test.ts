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
      "Weekly Strategy Brief",
    ]);
  });

  it("builds a weekly strategy brief that references the decision-loop context", () => {
    const prompt = buildLifeeePrompt("weekly-strategy-brief", {
      date: "2026-05-13",
      operatingMode: "Focus",
      weeklyBottleneckSummary: "Overdue tasks piling up",
      nextWeekOneMoveSummary: "Finish the oldest overdue task on Monday",
      lastWeekOneMoveVerdictSummary: "partial — Cap each day. Note: missed Friday",
      oneMoveFeedbackHistorySummary: "8w window · 4 moves · 2 verdicts · rate 50%",
      decisionSummary: "Recent decisions: ignore social",
      reviewedDecisionsSummary: "Reviewed this week: 1",
      outcomeFeedbackSummary: "Recent positive outcomes",
      decisionPatternSummary: "Reviewed total 4",
    });

    expect(prompt).toContain("Weekly Strategy Brief");
    expect(prompt).toContain("Weekly bottleneck:");
    expect(prompt).toContain("This week's one move:");
    expect(prompt).toContain("Last week one move verdict:");
    expect(prompt).toContain("One move feedback history:");
    expect(prompt).toContain("Bottleneck restated");
    expect(prompt).toContain("One move to protect");
    expect(prompt).toContain("Next 24-hour action");
    expect(prompt).toContain("Use ONLY the Lifeee context above");
  });

  it("falls back to missing-context message when fields are absent", () => {
    const prompt = buildLifeeePrompt("weekly-strategy-brief", {});
    expect(prompt).toContain("Weekly bottleneck: Not supplied in this export.");
    expect(prompt).toContain("One move to protect");
  });

  it("still builds existing prompt kinds without throwing", () => {
    expect(() => buildLifeeePrompt("daily-plan", {})).not.toThrow();
    expect(() => buildLifeeePrompt("full-context", {})).not.toThrow();
    expect(() => buildLifeeePrompt("weekly-review", {})).not.toThrow();
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
