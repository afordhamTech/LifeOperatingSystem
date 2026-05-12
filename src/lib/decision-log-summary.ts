// Pure helpers for summarizing decision_logs into compact strings the
// PromptDrawer can hand to AI prompts, and for splitting them into
// review buckets used by the Decision Review surface. No persistence,
// no React.

import type { DecisionLog } from "@/lib/lifeee-persistence";

export function hasResult(decision: DecisionLog): boolean {
  const result = decision.result_later?.trim();
  return Boolean(result && result.length > 0);
}

// reviewed_at is not a column in decision_logs. Practical rule:
// when result_later is set, treat updated_at as the reviewed timestamp;
// fall back to created_at only if updated_at is missing.
export function reviewedTimestamp(decision: DecisionLog): string | null {
  if (!hasResult(decision)) return null;
  return decision.updated_at ?? decision.created_at ?? null;
}

export type ReviewBuckets = {
  dueForReview: DecisionLog[];
  reviewedThisWeek: DecisionLog[];
  openWithFutureReview: DecisionLog[];
};

export function splitDecisionsByReview(
  decisions: DecisionLog[],
  today: string,
  weekStart: string,
  weekEnd: string,
): ReviewBuckets {
  const dueForReview: DecisionLog[] = [];
  const reviewedThisWeek: DecisionLog[] = [];
  const openWithFutureReview: DecisionLog[] = [];

  for (const decision of decisions) {
    const reviewed = hasResult(decision);
    if (reviewed) {
      const ts = reviewedTimestamp(decision);
      const tsDate = ts ? ts.slice(0, 10) : null;
      if (tsDate && tsDate >= weekStart && tsDate <= weekEnd) {
        reviewedThisWeek.push(decision);
      }
      continue;
    }
    const reviewDate = decision.review_date ?? null;
    if (!reviewDate) continue;
    if (reviewDate <= today) {
      dueForReview.push(decision);
    } else {
      openWithFutureReview.push(decision);
    }
  }

  dueForReview.sort((a, b) =>
    (a.review_date ?? "").localeCompare(b.review_date ?? ""),
  );
  openWithFutureReview.sort((a, b) =>
    (a.review_date ?? "").localeCompare(b.review_date ?? ""),
  );
  reviewedThisWeek.sort((a, b) => {
    const aTs = reviewedTimestamp(a) ?? "";
    const bTs = reviewedTimestamp(b) ?? "";
    return bTs.localeCompare(aTs);
  });

  return { dueForReview, reviewedThisWeek, openWithFutureReview };
}

export function buildReviewedDecisionsSummary(
  buckets: ReviewBuckets,
  options: { maxEach?: number } = {},
): string {
  const maxEach = options.maxEach ?? 5;

  const sections: string[] = [];

  if (buckets.dueForReview.length > 0) {
    const lines = buckets.dueForReview
      .slice(0, maxEach)
      .map(
        (d) =>
          `- ${d.decision}${d.review_date ? ` (review ${d.review_date})` : ""}${
            d.reason_chosen ? ` — ${d.reason_chosen}` : ""
          }`,
      );
    sections.push(`Due for review:\n${lines.join("\n")}`);
  }

  if (buckets.reviewedThisWeek.length > 0) {
    const lines = buckets.reviewedThisWeek
      .slice(0, maxEach)
      .map((d) => `- ${d.decision} → ${d.result_later?.trim() ?? ""}`);
    sections.push(`Reviewed this week:\n${lines.join("\n")}`);
  }

  if (buckets.openWithFutureReview.length > 0) {
    const lines = buckets.openWithFutureReview
      .slice(0, maxEach)
      .map((d) => `- ${d.decision}${d.review_date ? ` (review ${d.review_date})` : ""}`);
    sections.push(`Open with future review:\n${lines.join("\n")}`);
  }

  return sections.length === 0
    ? "No decision feedback yet."
    : sections.join("\n\n");
}

export type DecisionReviewStatus = "overdue" | "today" | "upcoming" | "none";

export function classifyReviewDate(
  reviewDate: string | null | undefined,
  today: string,
): DecisionReviewStatus {
  if (!reviewDate) return "none";
  if (reviewDate < today) return "overdue";
  if (reviewDate === today) return "today";
  return "upcoming";
}

function lineForDecision(decision: DecisionLog, today: string): string {
  const status = classifyReviewDate(decision.review_date ?? null, today);
  const reviewSuffix =
    status === "overdue"
      ? ` (review overdue ${decision.review_date})`
      : status === "today"
        ? ` (review today)`
        : status === "upcoming"
          ? ` (review ${decision.review_date})`
          : "";

  const reason = decision.reason_chosen?.trim();
  const reasonSuffix = reason ? ` — ${reason}` : "";
  return `${decision.decision}${reasonSuffix}${reviewSuffix}`;
}

export function buildDecisionSummary(
  decisions: DecisionLog[],
  today: string,
  options: { maxRecent?: number } = {},
): string {
  if (decisions.length === 0) return "No decisions logged yet.";

  const maxRecent = options.maxRecent ?? 5;

  const ranked = [...decisions].sort((a, b) => {
    const aStatus = classifyReviewDate(a.review_date ?? null, today);
    const bStatus = classifyReviewDate(b.review_date ?? null, today);
    const rank = (status: DecisionReviewStatus) =>
      status === "overdue" ? 0 : status === "today" ? 1 : status === "upcoming" ? 2 : 3;
    const diff = rank(aStatus) - rank(bStatus);
    if (diff !== 0) return diff;
    const aDate = a.decision_date ?? a.created_at ?? "";
    const bDate = b.decision_date ?? b.created_at ?? "";
    return bDate.localeCompare(aDate);
  });

  const recent = ranked.slice(0, maxRecent);
  const lines = recent.map((decision) => `- ${lineForDecision(decision, today)}`);

  const overdueCount = decisions.filter(
    (d) => classifyReviewDate(d.review_date ?? null, today) === "overdue",
  ).length;
  const todayCount = decisions.filter(
    (d) => classifyReviewDate(d.review_date ?? null, today) === "today",
  ).length;

  const headerParts: string[] = [];
  if (overdueCount > 0) headerParts.push(`${overdueCount} overdue review`);
  if (todayCount > 0) headerParts.push(`${todayCount} review today`);
  const header =
    headerParts.length > 0 ? `${headerParts.join(", ")}:\n` : "Recent decisions:\n";

  return `${header}${lines.join("\n")}`;
}
