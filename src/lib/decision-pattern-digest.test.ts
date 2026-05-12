import { describe, expect, it } from "vitest";
import type { DecisionLog } from "@/lib/lifeee-persistence";
import {
  buildDecisionPatternDigest,
  buildDecisionPatternSummary,
} from "@/lib/decision-pattern-digest";

const TODAY = "2026-05-13";
const WEEK_START = "2026-05-11"; // Monday
const WEEK_END = "2026-05-17"; // Sunday

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

describe("buildDecisionPatternDigest", () => {
  it("returns zero counts and empty recurring list for empty input", () => {
    const digest = buildDecisionPatternDigest([], WEEK_START, WEEK_END, TODAY);
    expect(digest.totalsReviewed).toBe(0);
    expect(digest.positiveCount).toBe(0);
    expect(digest.negativeCount).toBe(0);
    expect(digest.neutralCount).toBe(0);
    expect(digest.currentWeekReviewedCount).toBe(0);
    expect(digest.priorWeekReviewedCount).toBe(0);
    expect(digest.weeklyDelta).toBe(0);
    expect(digest.openOverdueReviewCount).toBe(0);
    expect(digest.topRecurringDecisionTitles).toEqual([]);
  });

  it("counts decisions reviewed inside the current week", () => {
    const inWeek = makeDecision({
      decision: "Block phone",
      result_later: "Worked well",
      updated_at: "2026-05-12T22:00:00.000Z",
    });
    const digest = buildDecisionPatternDigest(
      [inWeek],
      WEEK_START,
      WEEK_END,
      TODAY,
    );
    expect(digest.currentWeekReviewedCount).toBe(1);
    expect(digest.totalsReviewed).toBe(1);
  });

  it("counts decisions reviewed in the prior 7-day window", () => {
    const prior = makeDecision({
      decision: "Skip gym",
      result_later: "Felt fine",
      updated_at: "2026-05-06T22:00:00.000Z", // within priorWeekStart=2026-05-04..2026-05-10
    });
    const digest = buildDecisionPatternDigest(
      [prior],
      WEEK_START,
      WEEK_END,
      TODAY,
    );
    expect(digest.priorWeekReviewedCount).toBe(1);
    expect(digest.currentWeekReviewedCount).toBe(0);
  });

  it("computes weeklyDelta as current minus prior", () => {
    const current = makeDecision({
      decision: "A",
      result_later: "ok",
      updated_at: "2026-05-12T10:00:00.000Z",
    });
    const prior = makeDecision({
      decision: "B",
      result_later: "ok",
      updated_at: "2026-05-05T10:00:00.000Z",
    });
    const digest = buildDecisionPatternDigest(
      [current, current, prior],
      WEEK_START,
      WEEK_END,
      TODAY,
    );
    expect(digest.currentWeekReviewedCount).toBe(2);
    expect(digest.priorWeekReviewedCount).toBe(1);
    expect(digest.weeklyDelta).toBe(1);
  });

  it("detects recurring titles case- and whitespace-insensitively", () => {
    const a = makeDecision({
      decision: "Skip Social Tonight",
      result_later: "Worked",
      updated_at: "2026-05-12T10:00:00.000Z",
    });
    const b = makeDecision({
      decision: "  skip social tonight  ",
      result_later: "Wasted, felt lonely",
      updated_at: "2026-05-13T10:00:00.000Z",
    });
    const c = makeDecision({
      decision: "Late workout",
      result_later: "Hurt sleep",
      updated_at: "2026-05-12T10:00:00.000Z",
    });
    const digest = buildDecisionPatternDigest(
      [a, b, c],
      WEEK_START,
      WEEK_END,
      TODAY,
    );
    expect(digest.topRecurringDecisionTitles).toHaveLength(1);
    expect(digest.topRecurringDecisionTitles[0]?.title).toBe("Skip Social Tonight");
    expect(digest.topRecurringDecisionTitles[0]?.count).toBe(2);
  });

  it("tie-breaks dominant sentiment negative > positive > neutral", () => {
    const positive = makeDecision({
      decision: "Late workout",
      result_later: "Worked, kept focus",
      updated_at: "2026-05-12T10:00:00.000Z",
    });
    const negative = makeDecision({
      decision: "Late workout",
      result_later: "Wasted next morning",
      updated_at: "2026-05-13T10:00:00.000Z",
    });
    const digest = buildDecisionPatternDigest(
      [positive, negative],
      WEEK_START,
      WEEK_END,
      TODAY,
    );
    expect(digest.topRecurringDecisionTitles[0]?.dominantSentiment).toBe("negative");
  });

  it("counts unreviewed decisions whose review_date is before today as overdue", () => {
    const overdue = makeDecision({
      decision: "Pay tuition",
      review_date: "2026-05-09",
      result_later: null,
    });
    const dueToday = makeDecision({
      decision: "Therapy",
      review_date: TODAY,
      result_later: null,
    });
    const future = makeDecision({
      decision: "Trip plan",
      review_date: "2026-06-01",
      result_later: null,
    });
    const reviewed = makeDecision({
      decision: "Done",
      review_date: "2026-05-01",
      result_later: "ok",
      updated_at: "2026-05-02T10:00:00.000Z",
    });
    const digest = buildDecisionPatternDigest(
      [overdue, dueToday, future, reviewed],
      WEEK_START,
      WEEK_END,
      TODAY,
    );
    expect(digest.openOverdueReviewCount).toBe(1);
  });

  it("does not treat review_date == today as overdue", () => {
    const dueToday = makeDecision({
      decision: "Therapy",
      review_date: TODAY,
      result_later: null,
    });
    const digest = buildDecisionPatternDigest(
      [dueToday],
      WEEK_START,
      WEEK_END,
      TODAY,
    );
    expect(digest.openOverdueReviewCount).toBe(0);
  });

  it("counts reviewed-outside-window in totals but not in week buckets", () => {
    const oldReview = makeDecision({
      decision: "Older win",
      result_later: "Worked",
      updated_at: "2026-03-01T10:00:00.000Z",
    });
    const digest = buildDecisionPatternDigest(
      [oldReview],
      WEEK_START,
      WEEK_END,
      TODAY,
    );
    expect(digest.totalsReviewed).toBe(1);
    expect(digest.currentWeekReviewedCount).toBe(0);
    expect(digest.priorWeekReviewedCount).toBe(0);
  });

  it("emits a short last-result excerpt for recurring titles", () => {
    const a = makeDecision({
      decision: "Block phone",
      result_later: "Worked, kept the deep work block",
      updated_at: "2026-05-12T10:00:00.000Z",
    });
    const b = makeDecision({
      decision: "Block phone",
      result_later: "Worked again, even better the second time",
      updated_at: "2026-05-13T10:00:00.000Z",
    });
    const digest = buildDecisionPatternDigest(
      [a, b],
      WEEK_START,
      WEEK_END,
      TODAY,
    );
    expect(digest.topRecurringDecisionTitles[0]?.lastResultExcerpt).toContain(
      "Worked again",
    );
  });
});

describe("buildDecisionPatternSummary", () => {
  it("handles empty digest with a useful sentence", () => {
    const digest = buildDecisionPatternDigest([], WEEK_START, WEEK_END, TODAY);
    expect(buildDecisionPatternSummary(digest)).toBe(
      "No reviewed decision patterns yet.",
    );
  });

  it("includes recurring titles and overdue review count", () => {
    const reviewed1 = makeDecision({
      decision: "Block phone",
      result_later: "Worked",
      updated_at: "2026-05-12T10:00:00.000Z",
    });
    const reviewed2 = makeDecision({
      decision: "Block phone",
      result_later: "Worked again",
      updated_at: "2026-05-13T10:00:00.000Z",
    });
    const overdue = makeDecision({
      decision: "Pay tuition",
      review_date: "2026-05-09",
      result_later: null,
    });
    const digest = buildDecisionPatternDigest(
      [reviewed1, reviewed2, overdue],
      WEEK_START,
      WEEK_END,
      TODAY,
    );
    const summary = buildDecisionPatternSummary(digest);
    expect(summary).toContain("Reviewed total 2");
    expect(summary).toContain("Recurring decisions");
    expect(summary).toContain("Block phone ×2");
    expect(summary).toContain("Open overdue reviews: 1");
  });
});
