// Lifeee Today Decision Loop — pure helpers that wire existing Lifeee data
// (universal_tasks, calendar_anchors, daily_plans) into one daily picture.
// No persistence here. Stay framework-free.

import type { Task } from "@/lib/task-system";
import type { CalendarAnchor } from "@/lib/calendar-system";
import type { DecisionLog } from "@/lib/lifeee-persistence";
import { calcTaskPriority } from "@/lib/task-system";
import { parseTimeToMinutes } from "@/lib/calendar-system";
import { hasResult } from "@/lib/decision-log-summary";

export type TrustProtector = {
  id: string;
  title: string;
  reason: string;
  kind:
    | "overdue"
    | "due-today"
    | "prep"
    | "follow-up"
    | "high-consequence"
    | "overdue-decision-review";
  source: "task" | "anchor" | "decision";
  detail?: string;
};

function isLiveTask(task: Task) {
  return task.status !== "completed";
}

function isTodayString(value: string | null, today: string) {
  return Boolean(value) && value === today;
}

function isOverdue(value: string | null, today: string) {
  if (!value) return false;
  return value < today;
}

export function pickTrustProtectors(
  tasks: Task[],
  anchors: CalendarAnchor[],
  today: string,
  decisions: DecisionLog[] = [],
): TrustProtector[] {
  const protectors: TrustProtector[] = [];
  const seen = new Set<string>();

  const addTask = (task: Task, kind: TrustProtector["kind"], reason: string) => {
    const key = `task:${task.id}:${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    protectors.push({
      id: key,
      title: task.title,
      reason,
      kind,
      source: "task",
      detail: task.task_type,
    });
  };

  for (const task of tasks) {
    if (!isLiveTask(task)) continue;
    if (isOverdue(task.due_date, today)) {
      addTask(task, "overdue", `Overdue since ${task.due_date}`);
      continue;
    }
    if (isTodayString(task.due_date, today)) {
      addTask(task, "due-today", "Due today");
      continue;
    }
    if (task.consequence_if_delayed >= 8 || task.trust_impact >= 8) {
      addTask(
        task,
        "high-consequence",
        `High consequence (c${task.consequence_if_delayed}/t${task.trust_impact})`,
      );
    }
  }

  for (const anchor of anchors) {
    if (anchor.date !== today) continue;
    const prep = anchor.prep?.trim();
    if (prep) {
      const key = `anchor:${anchor.id}:prep`;
      if (!seen.has(key)) {
        seen.add(key);
        protectors.push({
          id: key,
          title: `Prep: ${anchor.title}`,
          reason: prep,
          kind: "prep",
          source: "anchor",
          detail: `${anchor.start_time} ${anchor.category}`,
        });
      }
    }
    const followUp = anchor.follow_up?.trim();
    if (followUp) {
      const key = `anchor:${anchor.id}:follow-up`;
      if (!seen.has(key)) {
        seen.add(key);
        protectors.push({
          id: key,
          title: `Follow up: ${anchor.title}`,
          reason: followUp,
          kind: "follow-up",
          source: "anchor",
          detail: `${anchor.end_time} ${anchor.category}`,
        });
      }
    }
  }

  for (const decision of decisions) {
    if (hasResult(decision)) continue;
    const reviewDate = decision.review_date ?? null;
    if (!reviewDate) continue;
    if (reviewDate > today) continue;
    const key = `decision:${decision.id}:overdue-decision-review`;
    if (seen.has(key)) continue;
    seen.add(key);
    protectors.push({
      id: key,
      title: `Decision review: ${decision.decision}`,
      reason: `Decision review still open since ${reviewDate}`,
      kind: "overdue-decision-review",
      source: "decision",
      detail: decision.reason_chosen ?? undefined,
    });
  }

  const rank = (kind: TrustProtector["kind"]) =>
    kind === "overdue"
      ? 0
      : kind === "due-today"
        ? 1
        : kind === "overdue-decision-review"
          ? 2
          : kind === "prep"
            ? 3
            : kind === "follow-up"
              ? 4
              : 5;

  return protectors.sort((a, b) => rank(a.kind) - rank(b.kind)).slice(0, 8);
}

export function pickInboxCandidates(tasks: Task[], currentEnergy: number) {
  return tasks
    .filter((task) => task.status === "inbox" && task.daily_role !== "Ignore Today")
    .sort((a, b) => calcTaskPriority(b, currentEnergy) - calcTaskPriority(a, currentEnergy))
    .slice(0, 8);
}

export function pickIgnoredToday(tasks: Task[]) {
  return tasks
    .filter((task) => task.status !== "completed" && task.daily_role === "Ignore Today")
    .slice(0, 10);
}

export function pickTodayCommittedTasks(tasks: Task[], today: string) {
  return tasks
    .filter((task) => task.status !== "completed")
    .filter(
      (task) =>
        task.status === "today" ||
        isTodayString(task.due_date, today) ||
        (task.fixed_time != null && isTodayString(task.due_date, today)),
    );
}

export type DecisionLoopSummary = {
  trustProtectors: TrustProtector[];
  inboxCandidates: Task[];
  ignoredToday: Task[];
  todayCommitted: Task[];
};

export function buildDecisionLoopSummary(input: {
  tasks: Task[];
  anchors: CalendarAnchor[];
  today: string;
  currentEnergy: number;
  decisions?: DecisionLog[];
}): DecisionLoopSummary {
  return {
    trustProtectors: pickTrustProtectors(
      input.tasks,
      input.anchors,
      input.today,
      input.decisions ?? [],
    ),
    inboxCandidates: pickInboxCandidates(input.tasks, input.currentEnergy),
    ignoredToday: pickIgnoredToday(input.tasks),
    todayCommitted: pickTodayCommittedTasks(input.tasks, input.today),
  };
}

function joinLines(values: string[]) {
  return values.length === 0 ? "- none" : values.map((v) => `- ${v}`).join("\n");
}

export function summarizeTaskCandidates(tasks: Task[]) {
  return joinLines(
    tasks.map(
      (task) =>
        `${task.title} · ${task.task_type} · ~${task.estimated_minutes}m · u${task.urgency}/i${task.importance}${
          task.due_date ? ` · due ${task.due_date}` : ""
        }`,
    ),
  );
}

export function summarizeTrustProtectors(protectors: TrustProtector[]) {
  return joinLines(
    protectors.map((protector) => `${protector.title} — ${protector.reason} [${protector.kind}]`),
  );
}

export function summarizeAnchors(anchors: CalendarAnchor[], today: string) {
  const todayAnchors = anchors
    .filter((anchor) => anchor.date === today)
    .sort(
      (a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time),
    );
  return joinLines(
    todayAnchors.map(
      (anchor) =>
        `${anchor.start_time}–${anchor.end_time} ${anchor.title} (${anchor.category}${
          anchor.location ? `, ${anchor.location}` : ""
        })`,
    ),
  );
}

export type AntiDriftContext = {
  computedBottleneck: string | null;
  userNote: string | null;
  ignored: Task[];
  trustProtectors: TrustProtector[];
};

export function summarizeAntiDrift(ctx: AntiDriftContext) {
  const lines: string[] = [];
  if (ctx.computedBottleneck) lines.push(`Computed bottleneck: ${ctx.computedBottleneck}`);
  if (ctx.userNote) lines.push(`User anti-drift note: ${ctx.userNote}`);
  if (ctx.ignored.length) {
    lines.push("Ignored today:");
    for (const task of ctx.ignored) lines.push(`  - ${task.title}`);
  }
  if (ctx.trustProtectors.length) {
    lines.push("Trust protectors:");
    for (const protector of ctx.trustProtectors)
      lines.push(`  - ${protector.title} (${protector.kind})`);
  }
  return lines.length === 0 ? "Nothing flagged." : lines.join("\n");
}
