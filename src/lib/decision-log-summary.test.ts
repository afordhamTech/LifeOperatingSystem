import { describe, expect, it } from "vitest";
import type { DecisionLog } from "@/lib/lifeee-persistence";
import {
  buildDecisionSummary,
  classifyReviewDate,
} from "@/lib/decision-log-summary";

const TODAY = "2026-05-11";

function makeDecision(partial: Partial<DecisionLog> & { decision: string }): DecisionLog {
  return {
    id: partial.id ?? `d_${Math.random().toString(36).slice(2)}`,
    decision: partial.decision,
    decision_date: partial.decision_date ?? null,
    options_considered: partial.options_considered ?? [],
    reason_chosen: partial.reason_chosen ?? null,
    expected_outcome: partial.expected_outcome ?? null,
    risk: partial.risk ?? null,
    review_date: partial.review_date ?? null,
    result_later: partial.result_later ?? null,
    notes: partial.notes ?? null,
    created_at: partial.created_at,
    updated_at: partial.updated_at,
  };
}

describe("decision log summary", () => {
  it("returns a clear empty-state string when no decisions exist", () => {
    expect(buildDecisionSummary([], TODAY)).toBe("No decisions logged yet.");
  });

  it("summarizes recent decisions with reasons", () => {
    const summary = buildDecisionSummary(
      [
        makeDecision({
          decision: "Ignore weekly social",
          reason_chosen: "Chose to ignore today",
          decision_date: TODAY,
        }),
        makeDecision({
          decision: "Postpone gym to evening",
          reason_chosen: "Low energy",
          decision_date: TODAY,
        }),
      ],
      TODAY,
    );
    expect(summary).toContain("Ignore weekly social — Chose to ignore today");
    expect(summary).toContain("Postpone gym to evening — Low energy");
  });

  it("flags review dates that are today or overdue and ranks them first", () => {
    const summary = buildDecisionSummary(
      [
        makeDecision({ decision: "Future plan", review_date: "2026-05-20" }),
        makeDecision({ decision: "Stale plan", review_date: "2026-05-01" }),
        makeDecision({ decision: "Review today", review_date: TODAY }),
      ],
      TODAY,
    );
    const overdueIdx = summary.indexOf("Stale plan");
    const todayIdx = summary.indexOf("Review today");
    const upcomingIdx = summary.indexOf("Future plan");
    expect(overdueIdx).toBeGreaterThan(-1);
    expect(todayIdx).toBeGreaterThan(-1);
    expect(upcomingIdx).toBeGreaterThan(-1);
    expect(overdueIdx).toBeLessThan(todayIdx);
    expect(todayIdx).toBeLessThan(upcomingIdx);
    expect(summary).toContain("1 overdue review");
    expect(summary).toContain("1 review today");
    expect(summary).toContain("review overdue 2026-05-01");
    expect(summary).toContain("review today");
    expect(summary).toContain("review 2026-05-20");
  });

  it("classifies review dates correctly", () => {
    expect(classifyReviewDate(null, TODAY)).toBe("none");
    expect(classifyReviewDate("2026-05-10", TODAY)).toBe("overdue");
    expect(classifyReviewDate(TODAY, TODAY)).toBe("today");
    expect(classifyReviewDate("2026-05-12", TODAY)).toBe("upcoming");
  });

  it("caps recent decisions to the requested maximum", () => {
    const decisions = Array.from({ length: 10 }, (_, i) =>
      makeDecision({
        decision: `Decision ${i}`,
        decision_date: `2026-04-${String(20 + i).padStart(2, "0")}`,
      }),
    );
    const summary = buildDecisionSummary(decisions, TODAY, { maxRecent: 3 });
    const matches = summary.match(/- Decision \d+/g) ?? [];
    expect(matches.length).toBe(3);
  });
});
