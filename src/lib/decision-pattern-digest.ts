// Pure helpers for Phase B5 Decision Pattern Digest.
// Aggregates reviewed decision_logs into a small read-only insight surface.
// No persistence. No React. Deterministic.

import type { DecisionLog } from "@/lib/lifeee-persistence";
import { hasResult, reviewedTimestamp } from "@/lib/decision-log-summary";
import {
  classifyOutcomeSentiment,
  normalizeDecisionText,
  type OutcomeSentiment,
} from "@/lib/decision-outcome-feedback";

export type RecurringDecisionTitle = {
  title: string;
  count: number;
  dominantSentiment: OutcomeSentiment;
  lastResultExcerpt: string;
};

export type DecisionPatternDigest = {
  totalsReviewed: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  currentWeekReviewedCount: number;
  priorWeekReviewedCount: number;
  weeklyDelta: number;
  openOverdueReviewCount: number;
  topRecurringDecisionTitles: RecurringDecisionTitle[];
};

function reviewedDateKey(decision: DecisionLog): string | null {
  const ts = reviewedTimestamp(decision) ?? decision.created_at ?? null;
  if (!ts) return null;
  return ts.slice(0, 10);
}

function shiftDate(dateKey: string, deltaDays: number): string {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + deltaDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dominantOf(counts: Record<OutcomeSentiment, number>): OutcomeSentiment {
  const { positive, negative, neutral } = counts;
  const max = Math.max(positive, negative, neutral);
  if (max === 0) return "neutral";
  // Tie-break: negative > positive > neutral
  if (negative === max) return "negative";
  if (positive === max) return "positive";
  return "neutral";
}

export function buildDecisionPatternDigest(
  decisions: DecisionLog[],
  weekStart: string,
  weekEnd: string,
  today: string = new Date().toISOString().slice(0, 10),
): DecisionPatternDigest {
  const priorWeekStart = shiftDate(weekStart, -7);
  const priorWeekEnd = shiftDate(weekStart, -1);

  const reviewed = decisions.filter(hasResult);
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  let currentWeekReviewedCount = 0;
  let priorWeekReviewedCount = 0;

  const byNormalized = new Map<
    string,
    {
      displayTitle: string;
      reviewedEntries: Array<{
        decision: DecisionLog;
        sentiment: OutcomeSentiment;
        ts: string;
      }>;
    }
  >();

  for (const decision of reviewed) {
    const sentiment = classifyOutcomeSentiment(decision.result_later ?? null);
    if (sentiment === "positive") positiveCount++;
    else if (sentiment === "negative") negativeCount++;
    else neutralCount++;

    const tsKey = reviewedDateKey(decision);
    if (tsKey) {
      if (tsKey >= weekStart && tsKey <= weekEnd) currentWeekReviewedCount++;
      else if (tsKey >= priorWeekStart && tsKey <= priorWeekEnd) priorWeekReviewedCount++;
    }

    const normalized = normalizeDecisionText(decision.decision);
    if (!normalized) continue;
    const existing = byNormalized.get(normalized);
    const fullTs = reviewedTimestamp(decision) ?? decision.created_at ?? "";
    const entry = { decision, sentiment, ts: fullTs };
    if (existing) {
      existing.reviewedEntries.push(entry);
    } else {
      byNormalized.set(normalized, {
        displayTitle: decision.decision.trim(),
        reviewedEntries: [entry],
      });
    }
  }

  const openOverdueReviewCount = decisions.filter((decision) => {
    if (hasResult(decision)) return false;
    const reviewDate = decision.review_date ?? null;
    if (!reviewDate) return false;
    return reviewDate < today;
  }).length;

  const recurring: RecurringDecisionTitle[] = [];
  for (const group of byNormalized.values()) {
    if (group.reviewedEntries.length < 2) continue;
    const counts: Record<OutcomeSentiment, number> = {
      positive: 0,
      negative: 0,
      neutral: 0,
    };
    for (const entry of group.reviewedEntries) counts[entry.sentiment]++;
    const sorted = [...group.reviewedEntries].sort((a, b) =>
      b.ts.localeCompare(a.ts),
    );
    const mostRecent = sorted[0];
    const result = (mostRecent?.decision.result_later ?? "").trim();
    const excerpt = result.length > 60 ? `${result.slice(0, 60)}…` : result;
    recurring.push({
      title: group.displayTitle,
      count: group.reviewedEntries.length,
      dominantSentiment: dominantOf(counts),
      lastResultExcerpt: excerpt,
    });
  }

  recurring.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.title.localeCompare(b.title);
  });

  return {
    totalsReviewed: reviewed.length,
    positiveCount,
    negativeCount,
    neutralCount,
    currentWeekReviewedCount,
    priorWeekReviewedCount,
    weeklyDelta: currentWeekReviewedCount - priorWeekReviewedCount,
    openOverdueReviewCount,
    topRecurringDecisionTitles: recurring,
  };
}

export function buildDecisionPatternSummary(
  digest: DecisionPatternDigest,
  options: { maxRecurring?: number } = {},
): string {
  const maxRecurring = options.maxRecurring ?? 3;
  if (
    digest.totalsReviewed === 0 &&
    digest.openOverdueReviewCount === 0 &&
    digest.topRecurringDecisionTitles.length === 0
  ) {
    return "No reviewed decision patterns yet.";
  }

  const lines: string[] = [];
  lines.push(
    `Reviewed total ${digest.totalsReviewed} · positive ${digest.positiveCount} · negative ${digest.negativeCount} · neutral ${digest.neutralCount}`,
  );
  const deltaSign = digest.weeklyDelta > 0 ? "+" : "";
  lines.push(
    `This week ${digest.currentWeekReviewedCount} vs prior ${digest.priorWeekReviewedCount} (${deltaSign}${digest.weeklyDelta})`,
  );
  if (digest.openOverdueReviewCount > 0) {
    lines.push(`Open overdue reviews: ${digest.openOverdueReviewCount}`);
  }
  if (digest.topRecurringDecisionTitles.length > 0) {
    lines.push("Recurring decisions:");
    for (const recurring of digest.topRecurringDecisionTitles.slice(0, maxRecurring)) {
      const tail = recurring.lastResultExcerpt
        ? ` — last: ${recurring.lastResultExcerpt}`
        : "";
      lines.push(
        `- ${recurring.title} ×${recurring.count} [${recurring.dominantSentiment}]${tail}`,
      );
    }
  }
  return lines.join("\n");
}
