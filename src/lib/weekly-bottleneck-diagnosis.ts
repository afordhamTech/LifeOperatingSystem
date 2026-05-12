// Phase B6 Weekly Bottleneck Diagnosis.
// Pure helper that aggregates already-loaded Lifeee data into a single
// deterministic bottleneck label. No Supabase calls. No React. No fuzzy
// matching. No AI.

import type { Task, TaskType } from "@/lib/task-system";
import type { CalendarAnchor } from "@/lib/calendar-system";
import type { DecisionLog } from "@/lib/lifeee-persistence";
import { hasResult } from "@/lib/decision-log-summary";

export type BottleneckKind =
  | "overdue-tasks"
  | "incomplete-today"
  | "ignored-today"
  | "open-decision-reviews"
  | "calendar-prep"
  | "calendar-follow-up"
  | "insufficient-evidence";

export type BottleneckConfidence = "high" | "medium" | "low";

export type BottleneckEvidence = {
  label: string;
  count: number;
};

export type WeeklyBottleneckDiagnosis = {
  primaryBottleneckDomain: TaskType | "Unknown";
  bottleneckKind: BottleneckKind;
  bottleneckLabel: string;
  bottleneckDescription: string;
  evidence: BottleneckEvidence[];
  suggestedFix: string;
  confidence: BottleneckConfidence;
  score: number;
  counts: {
    overdueTaskCount: number;
    ignoredTodayCount: number;
    incompleteTodayCount: number;
    openDecisionReviewCount: number;
    reviewedDecisionCount: number;
    calendarPrepCount: number;
    calendarFollowUpCount: number;
    domainCounts: Record<string, number>;
  };
};

export type WeeklyBottleneckInput = {
  tasks: Task[];
  decisionLogs: DecisionLog[];
  anchors: CalendarAnchor[];
  weekStart: string;
  weekEnd: string;
  today: string;
};

function dominantDomain(domainCounts: Record<string, number>): TaskType | "Unknown" {
  const entries = Object.entries(domainCounts);
  if (entries.length === 0) return "Unknown";
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = entries[0];
  if (!top || top[1] === 0) return "Unknown";
  return top[0] as TaskType;
}

function labelFor(kind: BottleneckKind, domain: TaskType | "Unknown"): string {
  switch (kind) {
    case "overdue-tasks":
      return domain === "Unknown"
        ? "Overdue tasks piling up"
        : `Overdue ${domain} work piling up`;
    case "incomplete-today":
      return "Today's plan is overloaded";
    case "ignored-today":
      return "Too many tasks being deferred";
    case "open-decision-reviews":
      return "Open decision reviews are stale";
    case "calendar-prep":
      return "Calendar prep is missing";
    case "calendar-follow-up":
      return "Calendar follow-up is missing";
    case "insufficient-evidence":
      return "Insufficient evidence";
  }
}

function descriptionFor(kind: BottleneckKind): string {
  switch (kind) {
    case "overdue-tasks":
      return "Multiple tasks slipped past their due date. Trust drifts when overdue work compounds.";
    case "incomplete-today":
      return "Today's committed plan has more items than realistic. Plans become wish lists.";
    case "ignored-today":
      return "Several items keep getting deferred. Either commit or drop them — silent carryover hides the real bottleneck.";
    case "open-decision-reviews":
      return "Past decisions have not been reviewed. The feedback loop breaks without closure.";
    case "calendar-prep":
      return "Anchors with explicit prep notes are not being prepared. Meetings start unready.";
    case "calendar-follow-up":
      return "Anchors with explicit follow-ups are not being closed. Loose ends accumulate.";
    case "insufficient-evidence":
      return "Not enough Lifeee data this week to identify a single constraint.";
  }
}

function fixFor(kind: BottleneckKind, domain: TaskType | "Unknown"): string {
  switch (kind) {
    case "overdue-tasks":
      return domain === "Unknown" || domain === "Personal"
        ? "Pick one overdue task and finish it before adding anything new."
        : `Choose one ${domain} must-do before adding new project work.`;
    case "incomplete-today":
      return "Reduce today's plan to one must-do and two supports.";
    case "ignored-today":
      return "Decide for each deferred item: do it tomorrow, schedule it, or drop it.";
    case "open-decision-reviews":
      return "Close one overdue decision review before planning new work.";
    case "calendar-prep":
      return "Add prep blocks before fixed calendar anchors.";
    case "calendar-follow-up":
      return "Block a 15-minute follow-up window after the next anchor.";
    case "insufficient-evidence":
      return "Log more real inputs this week before diagnosing.";
  }
}

function withinWeek(dateKey: string | null, start: string, end: string): boolean {
  if (!dateKey) return false;
  return dateKey >= start && dateKey <= end;
}

export function buildWeeklyBottleneckDiagnosis(
  input: WeeklyBottleneckInput,
): WeeklyBottleneckDiagnosis {
  const { tasks, decisionLogs, anchors, weekStart, weekEnd, today } = input;

  const liveTasks = tasks.filter((task) => task.status !== "completed");

  const overdueTasks = liveTasks.filter(
    (task) => task.due_date != null && task.due_date < today,
  );
  const incompleteToday = liveTasks.filter(
    (task) =>
      task.status === "today" && (task.daily_role ?? "") !== "Ignore Today",
  );
  const ignoredToday = liveTasks.filter(
    (task) => task.daily_role === "Ignore Today",
  );

  const openDecisionReviews = decisionLogs.filter((decision) => {
    if (hasResult(decision)) return false;
    const reviewDate = decision.review_date ?? null;
    if (!reviewDate) return false;
    return reviewDate <= today;
  });
  const reviewedDecisionsThisWeek = decisionLogs.filter((decision) => {
    if (!hasResult(decision)) return false;
    const ts = decision.updated_at ?? decision.created_at ?? null;
    return withinWeek(ts ? ts.slice(0, 10) : null, weekStart, weekEnd);
  });

  const calendarThisWeek = anchors.filter((anchor) =>
    withinWeek(anchor.date ?? null, weekStart, weekEnd),
  );
  const calendarPrep = calendarThisWeek.filter(
    (anchor) => (anchor.prep ?? "").trim().length > 0,
  );
  const calendarFollowUp = calendarThisWeek.filter(
    (anchor) => (anchor.follow_up ?? "").trim().length > 0,
  );

  const domainCounts: Record<string, number> = {};
  for (const task of overdueTasks) {
    const key = task.task_type || "Unknown";
    domainCounts[key] = (domainCounts[key] ?? 0) + 1;
  }

  const counts = {
    overdueTaskCount: overdueTasks.length,
    ignoredTodayCount: ignoredToday.length,
    incompleteTodayCount: incompleteToday.length,
    openDecisionReviewCount: openDecisionReviews.length,
    reviewedDecisionCount: reviewedDecisionsThisWeek.length,
    calendarPrepCount: calendarPrep.length,
    calendarFollowUpCount: calendarFollowUp.length,
    domainCounts,
  };

  const score =
    3 * counts.overdueTaskCount +
    2 * counts.incompleteTodayCount +
    2 * counts.ignoredTodayCount +
    2 * counts.openDecisionReviewCount +
    1 * counts.calendarPrepCount +
    1 * counts.calendarFollowUpCount;

  // Pick the strongest contributing kind.
  const ranked: Array<[BottleneckKind, number]> = [
    ["overdue-tasks", 3 * counts.overdueTaskCount],
    ["incomplete-today", 2 * counts.incompleteTodayCount],
    ["ignored-today", 2 * counts.ignoredTodayCount],
    ["open-decision-reviews", 2 * counts.openDecisionReviewCount],
    ["calendar-prep", counts.calendarPrepCount],
    ["calendar-follow-up", counts.calendarFollowUpCount],
  ];
  ranked.sort((a, b) => b[1] - a[1]);
  const topKind: BottleneckKind = (ranked[0]?.[1] ?? 0) > 0
    ? ranked[0]![0]
    : "insufficient-evidence";

  const domain = dominantDomain(domainCounts);

  const evidence: BottleneckEvidence[] = [];
  if (counts.overdueTaskCount > 0) {
    evidence.push({ label: "Overdue tasks", count: counts.overdueTaskCount });
  }
  if (counts.incompleteTodayCount > 0) {
    evidence.push({ label: "Committed today", count: counts.incompleteTodayCount });
  }
  if (counts.ignoredTodayCount > 0) {
    evidence.push({ label: "Ignored today", count: counts.ignoredTodayCount });
  }
  if (counts.openDecisionReviewCount > 0) {
    evidence.push({
      label: "Open decision reviews",
      count: counts.openDecisionReviewCount,
    });
  }
  if (counts.calendarPrepCount > 0) {
    evidence.push({ label: "Calendar prep needed", count: counts.calendarPrepCount });
  }
  if (counts.calendarFollowUpCount > 0) {
    evidence.push({
      label: "Calendar follow-up needed",
      count: counts.calendarFollowUpCount,
    });
  }

  let confidence: BottleneckConfidence;
  if (topKind === "insufficient-evidence") {
    confidence = "low";
  } else if (score >= 8 && evidence.length >= 3) {
    confidence = "high";
  } else if (score >= 4) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return {
    primaryBottleneckDomain: topKind === "overdue-tasks" ? domain : "Unknown",
    bottleneckKind: topKind,
    bottleneckLabel: labelFor(topKind, domain),
    bottleneckDescription: descriptionFor(topKind),
    evidence,
    suggestedFix: fixFor(topKind, domain),
    confidence,
    score,
    counts,
  };
}

export function buildWeeklyBottleneckSummary(
  diagnosis: WeeklyBottleneckDiagnosis,
): string {
  if (diagnosis.bottleneckKind === "insufficient-evidence") {
    return "Not enough weekly evidence to identify a bottleneck yet.";
  }
  const lines: string[] = [];
  lines.push(
    `${diagnosis.bottleneckLabel} (confidence: ${diagnosis.confidence})`,
  );
  if (diagnosis.evidence.length > 0) {
    const top = diagnosis.evidence
      .slice(0, 3)
      .map((e) => `${e.label} ${e.count}`)
      .join(" · ");
    lines.push(`Evidence: ${top}`);
  }
  lines.push(`Fix: ${diagnosis.suggestedFix}`);
  return lines.join("\n");
}
