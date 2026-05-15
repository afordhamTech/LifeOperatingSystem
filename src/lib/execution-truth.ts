// Phase 1C: Execution Truth — shared constants and pure helpers.
// Lifeee must track what actually happened, not just what was planned.

import type { ExecutionStatus, TimeBlock } from "@/lib/calendar-system";

// ── Plan change reasons (Plan Lock) ─────────────────────────────────────────
export const PLAN_CHANGE_REASONS = [
  "new urgent task",
  "too tired",
  "time conflict",
  "task too vague",
  "avoidance / resistance",
  "underestimated duration",
  "priority changed",
  "no longer important",
  "completed elsewhere",
  "other",
] as const;
export type PlanChangeReason = (typeof PLAN_CHANGE_REASONS)[number];

// ── Missed reasons (block / task level) ─────────────────────────────────────
export const MISSED_REASONS = [
  "too vague",
  "too big",
  "low energy",
  "time conflict",
  "avoidance / resistance",
  "waiting on someone",
  "bad estimate",
  "not actually important",
  "forgot",
  "interruption",
  "health / recovery",
  "other",
] as const;
export type MissedReason = (typeof MISSED_REASONS)[number];

// ── Carry forward actions ───────────────────────────────────────────────────
export const CARRY_FORWARD_ACTIONS = [
  "carry_tomorrow",
  "reschedule",
  "break_down",
  "parking_lot",
  "archive",
  "trash",
  "mark_done",
  "keep_active_week",
] as const;
export type CarryForwardAction = (typeof CARRY_FORWARD_ACTIONS)[number];

export const CARRY_FORWARD_ACTION_LABELS: Record<CarryForwardAction, string> = {
  carry_tomorrow: "Carry to tomorrow",
  reschedule: "Reschedule",
  break_down: "Break down",
  parking_lot: "Move to Parking Lot",
  archive: "Archive",
  trash: "Trash",
  mark_done: "Mark Done",
  keep_active_week: "Keep active this week",
};

export const ANTI_DRIFT_CARRY_LIMIT = 3;

export const EXECUTION_STATUS_TONE: Record<ExecutionStatus, string> = {
  not_started: "border-slate-500/25 bg-slate-500/10 text-slate-700",
  in_progress: "border-primary/25 bg-primary/10 text-primary",
  done: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700",
  partial: "border-amber-500/25 bg-amber-500/10 text-amber-700",
  missed: "border-destructive/25 bg-destructive/10 text-destructive",
  skipped: "border-zinc-500/25 bg-zinc-500/10 text-zinc-700",
  rescheduled: "border-sky-500/25 bg-sky-500/10 text-sky-700",
};

// ── Execution stats aggregation ─────────────────────────────────────────────
export type ExecutionStats = {
  total: number;
  completed: number;
  missed: number;
  partial: number;
  skipped: number;
  rescheduled: number;
  notStarted: number;
  inProgress: number;
  mostCommonMissedReason: string | null;
  missedReasonCounts: Record<string, number>;
};

export function aggregateExecutionStats(blocks: TimeBlock[]): ExecutionStats {
  const stats: ExecutionStats = {
    total: blocks.length,
    completed: 0,
    missed: 0,
    partial: 0,
    skipped: 0,
    rescheduled: 0,
    notStarted: 0,
    inProgress: 0,
    mostCommonMissedReason: null,
    missedReasonCounts: {},
  };

  for (const block of blocks) {
    switch (block.execution_status) {
      case "done":
        stats.completed += 1;
        break;
      case "missed":
        stats.missed += 1;
        break;
      case "partial":
        stats.partial += 1;
        break;
      case "skipped":
        stats.skipped += 1;
        break;
      case "rescheduled":
        stats.rescheduled += 1;
        break;
      case "in_progress":
        stats.inProgress += 1;
        break;
      default:
        stats.notStarted += 1;
    }
    const reason = block.missed_reason?.trim();
    if (reason && (block.execution_status === "missed" || block.execution_status === "skipped")) {
      stats.missedReasonCounts[reason] = (stats.missedReasonCounts[reason] ?? 0) + 1;
    }
  }

  let topReason: string | null = null;
  let topCount = 0;
  for (const [reason, count] of Object.entries(stats.missedReasonCounts)) {
    if (count > topCount) {
      topReason = reason;
      topCount = count;
    }
  }
  stats.mostCommonMissedReason = topReason;
  return stats;
}

export function shouldShowAntiDriftWarning(carryForwardCount: number): boolean {
  return carryForwardCount >= ANTI_DRIFT_CARRY_LIMIT;
}

export const ANTI_DRIFT_WARNING =
  "This has been carried forward multiple times. Break down, schedule, park, or archive?";

// A block "needs execution attention" if it is scheduled but not yet resolved.
export function blockNeedsAttention(block: TimeBlock): boolean {
  return block.execution_status === "not_started" || block.execution_status === "in_progress";
}
