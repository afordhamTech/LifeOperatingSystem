// Pure helper for summarizing decision_logs into a compact string the
// PromptDrawer can hand to AI prompts. No persistence, no React.

import type { DecisionLog } from "@/lib/lifeee-persistence";

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
