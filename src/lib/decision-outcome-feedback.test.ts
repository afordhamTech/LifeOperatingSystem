import { describe, expect, it } from "vitest";
import type { DecisionLog } from "@/lib/lifeee-persistence";
import {
  buildOutcomeFeedbackSummary,
  buildOutcomeMatches,
  classifyOutcomeSentiment,
  matchTaskToReviewedDecision,
  normalizeDecisionText,
} from "@/lib/decision-outcome-feedback";

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

describe("normalizeDecisionText", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeDecisionText("  Pay   TUITION!  ")).toBe("pay tuition");
  });

  it("removes common punctuation noise", () => {
    expect(normalizeDecisionText("Call mom, then dad.")).toBe("call mom then dad");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeDecisionText("")).toBe("");
    expect(normalizeDecisionText("   ")).toBe("");
  });
});

describe("classifyOutcomeSentiment", () => {
  it("returns positive for representative positive phrases", () => {
    expect(classifyOutcomeSentiment("Worked great, kept the study block")).toBe("positive");
    expect(classifyOutcomeSentiment("Win — finished the lab")).toBe("positive");
    expect(classifyOutcomeSentiment("Helped with sleep")).toBe("positive");
  });

  it("returns negative for representative negative phrases", () => {
    expect(classifyOutcomeSentiment("Wasted the afternoon")).toBe("negative");
    expect(classifyOutcomeSentiment("Failed to focus")).toBe("negative");
    expect(classifyOutcomeSentiment("Bad call, drained energy")).toBe("negative");
  });

  it("returns neutral for empty or ambiguous phrases", () => {
    expect(classifyOutcomeSentiment("")).toBe("neutral");
    expect(classifyOutcomeSentiment("   ")).toBe("neutral");
    expect(classifyOutcomeSentiment(null)).toBe("neutral");
    expect(classifyOutcomeSentiment("Went okay")).toBe("neutral");
  });
});

describe("matchTaskToReviewedDecision", () => {
  it("returns null for empty input", () => {
    expect(matchTaskToReviewedDecision("Anything", [])).toBeNull();
    expect(matchTaskToReviewedDecision("", [makeDecision({ decision: "x", result_later: "ok" })])).toBeNull();
  });

  it("matches case-insensitively and tolerates whitespace", () => {
    const decisions = [
      makeDecision({
        decision: "  Skip Social Tonight  ",
        result_later: "Slept well",
      }),
    ];
    const match = matchTaskToReviewedDecision("skip social tonight", decisions);
    expect(match).not.toBeNull();
    expect(match?.decision).toContain("Skip Social");
  });

  it("does not match unreviewed decisions", () => {
    const decisions = [
      makeDecision({ decision: "Skip social tonight", result_later: null }),
      makeDecision({ decision: "Skip social tonight", result_later: "   " }),
    ];
    expect(matchTaskToReviewedDecision("Skip social tonight", decisions)).toBeNull();
  });

  it("returns the most recent reviewed match", () => {
    const older = makeDecision({
      decision: "Skip social tonight",
      result_later: "Bad — felt lonely",
      updated_at: "2026-04-15T22:00:00.000Z",
    });
    const newer = makeDecision({
      decision: "Skip social tonight",
      result_later: "Worked, slept well",
      updated_at: "2026-05-09T22:00:00.000Z",
    });
    const match = matchTaskToReviewedDecision("Skip social tonight", [older, newer]);
    expect(match?.id).toBe(newer.id);
  });
});

describe("buildOutcomeMatches", () => {
  it("returns an empty map when there are no reviewed decisions", () => {
    const tasks = [{ id: "t1", title: "Pay tuition" }];
    expect(buildOutcomeMatches(tasks, [])).toEqual({});
  });

  it("maps tasks to matched reviewed decisions with sentiment", () => {
    const decisions = [
      makeDecision({
        decision: "Skip social tonight",
        result_later: "Worked, slept well",
        updated_at: "2026-05-09T22:00:00.000Z",
      }),
      makeDecision({
        decision: "Late workout",
        result_later: "Failed to focus next morning",
        updated_at: "2026-05-08T22:00:00.000Z",
      }),
    ];
    const tasks = [
      { id: "t1", title: "Skip social tonight" },
      { id: "t2", title: "Late workout" },
      { id: "t3", title: "Unrelated" },
    ];
    const map = buildOutcomeMatches(tasks, decisions);
    expect(map.t1?.sentiment).toBe("positive");
    expect(map.t2?.sentiment).toBe("negative");
    expect(map.t3).toBeUndefined();
  });
});

describe("buildOutcomeFeedbackSummary", () => {
  it("returns a helpful empty-state string when nothing is reviewed", () => {
    expect(buildOutcomeFeedbackSummary([])).toBe("No reviewed decision outcomes yet.");
    expect(
      buildOutcomeFeedbackSummary([makeDecision({ decision: "x", result_later: null })]),
    ).toBe("No reviewed decision outcomes yet.");
  });

  it("groups positive, negative, and neutral outcomes when present", () => {
    const summary = buildOutcomeFeedbackSummary([
      makeDecision({
        decision: "Skip social tonight",
        result_later: "Worked, kept focus",
        updated_at: "2026-05-09T22:00:00.000Z",
      }),
      makeDecision({
        decision: "Late workout",
        result_later: "Wasted the morning",
        updated_at: "2026-05-08T22:00:00.000Z",
      }),
      makeDecision({
        decision: "Try new study spot",
        result_later: "Went okay",
        updated_at: "2026-05-07T22:00:00.000Z",
      }),
    ]);
    expect(summary).toContain("Recent positive outcomes");
    expect(summary).toContain("Skip social tonight");
    expect(summary).toContain("Recent negative outcomes");
    expect(summary).toContain("Late workout");
    expect(summary).toContain("Neutral / unclear outcomes");
    expect(summary).toContain("Try new study spot");
  });
});
