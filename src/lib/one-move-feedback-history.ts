// Phase B9 One Move Feedback History.
// Pure read-only aggregator over weekly_reviews rows.
// No Supabase, no React, no side effects.

import {
  parseOneMoveVerdict,
  type OneMoveVerdictOutcome,
} from "@/lib/one-move-verdict";

type WeeklyReviewLike = {
  week_start?: string | null;
  next_week_big_3?: unknown;
  notes?: string | null;
};

export type OneMoveFeedbackHistoryEntry = {
  commitmentWeekStart: string;
  targetWeekStart: string;
  move: string;
  outcome: OneMoveVerdictOutcome | null;
  note: string;
};

export type OneMoveFeedbackHistory = {
  totalMoves: number;
  totalVerdicts: number;
  verdictRate: number;
  outcomeCounts: Record<OneMoveVerdictOutcome, number>;
  currentStreak: number;
  longestStreak: number;
  entries: OneMoveFeedbackHistoryEntry[];
};

function shiftDate(dateKey: string, deltaDays: number): string {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + deltaDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function extractFirstMove(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const first = value[0];
  return typeof first === "string" ? first.trim() : "";
}

export function buildOneMoveFeedbackHistory(
  reviews: WeeklyReviewLike[],
  options: { currentWeekStart: string },
): OneMoveFeedbackHistory {
  const currentWeekStart = options.currentWeekStart;

  const entries: OneMoveFeedbackHistoryEntry[] = [];
  const outcomeCounts: Record<OneMoveVerdictOutcome, number> = {
    worked: 0,
    partial: 0,
    missed: 0,
    skipped: 0,
  };

  for (const row of reviews) {
    const commitmentWeekStart = row.week_start ?? "";
    if (!commitmentWeekStart) continue;
    const move = extractFirstMove(row.next_week_big_3);
    if (!move) continue;
    const targetWeekStart = shiftDate(commitmentWeekStart, 7);
    if (targetWeekStart > currentWeekStart) continue;
    const verdict = parseOneMoveVerdict(row.notes ?? null);
    if (verdict.outcome) outcomeCounts[verdict.outcome]++;
    entries.push({
      commitmentWeekStart,
      targetWeekStart,
      move,
      outcome: verdict.outcome,
      note: verdict.note,
    });
  }

  entries.sort((a, b) => b.targetWeekStart.localeCompare(a.targetWeekStart));

  const totalMoves = entries.length;
  const totalVerdicts = entries.filter((entry) => entry.outcome !== null).length;
  const verdictRate = totalMoves === 0 ? 0 : totalVerdicts / totalMoves;

  let currentStreak = 0;
  for (const entry of entries) {
    if (entry.outcome !== null) currentStreak++;
    else break;
  }

  let longestStreak = 0;
  let runningStreak = 0;
  for (const entry of entries) {
    if (entry.outcome !== null) {
      runningStreak++;
      if (runningStreak > longestStreak) longestStreak = runningStreak;
    } else {
      runningStreak = 0;
    }
  }

  return {
    totalMoves,
    totalVerdicts,
    verdictRate,
    outcomeCounts,
    currentStreak,
    longestStreak,
    entries,
  };
}

export function buildOneMoveFeedbackHistorySummary(
  history: OneMoveFeedbackHistory,
  options: { windowWeeks?: number } = {},
): string {
  if (history.totalMoves === 0) return "No one-move feedback history yet.";
  const ratePct = Math.round(history.verdictRate * 100);
  const windowLabel = options.windowWeeks ? `${options.windowWeeks}w window · ` : "";
  const oc = history.outcomeCounts;
  return `${windowLabel}${history.totalMoves} eligible moves · ${history.totalVerdicts} verdicts · rate ${ratePct}% · outcomes worked:${oc.worked} partial:${oc.partial} missed:${oc.missed} skipped:${oc.skipped} · streak ${history.currentStreak}.`;
}
