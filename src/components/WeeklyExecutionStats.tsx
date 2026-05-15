// Phase 1C: Execution Truth — Weekly Review execution inputs.
// Reads the week's time blocks, shutdowns, and daily plans, then surfaces
// what actually happened and persists the summary to weekly_reviews.

import { useCallback, useEffect, useMemo, useState } from "react";
import { SyncBadge } from "@/components/SyncBadge";
import { Button } from "@/components/ui/button";
import type { TimeBlock } from "@/lib/calendar-system";
import { aggregateExecutionStats } from "@/lib/execution-truth";
import {
  fetchDailyPlans,
  fetchDailyShutdowns,
  fetchTimeBlocks,
  upsertWeeklyReview,
  type DailyPlanRow,
  type DailyShutdownRow,
  type LifeeeSyncStatus,
} from "@/lib/lifeee-persistence";

type Props = {
  weekStart: string;
  weekEnd: string;
  userId: string | null;
  hasSupabaseConfig: boolean;
};

export default function WeeklyExecutionStats({
  weekStart,
  weekEnd,
  userId,
  hasSupabaseConfig,
}: Props) {
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [shutdowns, setShutdowns] = useState<DailyShutdownRow[]>([]);
  const [plans, setPlans] = useState<DailyPlanRow[]>([]);
  const [status, setStatus] = useState<LifeeeSyncStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const loggedIn = hasSupabaseConfig && Boolean(userId);

  const load = useCallback(async () => {
    if (!userId) return;
    const [blockRows, shutdownRows, planRows] = await Promise.all([
      fetchTimeBlocks(userId, weekStart, weekEnd),
      fetchDailyShutdowns(userId, weekStart, weekEnd),
      fetchDailyPlans(userId, weekStart, weekEnd),
    ]);
    setBlocks(blockRows);
    setShutdowns(shutdownRows);
    setPlans(planRows);
  }, [userId, weekStart, weekEnd]);

  useEffect(() => {
    let active = true;
    if (!loggedIn) {
      setStatus(hasSupabaseConfig ? "waiting" : "local");
      return;
    }
    setStatus("loading");
    load()
      .then(() => active && setStatus("saved"))
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load execution stats.");
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [hasSupabaseConfig, load, loggedIn]);

  const stats = useMemo(() => aggregateExecutionStats(blocks), [blocks]);
  const shutdownCount = useMemo(
    () => shutdowns.filter((s) => s.completed_at).length,
    [shutdowns],
  );
  const planChangeCount = useMemo(
    () => plans.reduce((sum, p) => sum + (p.plan_change_count ?? 0), 0),
    [plans],
  );
  const carryForwardCount = useMemo(
    () => blocks.filter((b) => b.carry_forward_task_id).length,
    [blocks],
  );

  async function save() {
    if (!userId) {
      setError("Sign in to save execution stats to Supabase.");
      return;
    }
    setStatus("saving");
    setError(null);
    try {
      await upsertWeeklyReview(userId, {
        week_start: weekStart,
        completed_blocks_count: stats.completed,
        missed_blocks_count: stats.missed,
        partial_blocks_count: stats.partial,
        skipped_blocks_count: stats.skipped,
        most_common_missed_reason: stats.mostCommonMissedReason,
        shutdown_count: shutdownCount,
        plan_change_count: planChangeCount,
        execution_summary: {
          total_blocks: stats.total,
          completed: stats.completed,
          missed: stats.missed,
          partial: stats.partial,
          skipped: stats.skipped,
          rescheduled: stats.rescheduled,
          not_started: stats.notStarted,
          missed_reason_counts: stats.missedReasonCounts,
          shutdown_count: shutdownCount,
          plan_change_count: planChangeCount,
          carry_forward_count: carryForwardCount,
        },
      });
      setStatus("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      setStatus("error");
    }
  }

  return (
    <section className="card-surface p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-[#25313c]">
          Execution summary — this week
        </h2>
        <div className="flex items-center gap-2">
          <SyncBadge status={status} />
          <Button size="sm" onClick={save} disabled={!loggedIn}>
            Save execution stats
          </Button>
        </div>
      </div>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      {!loggedIn ? (
        <p className="text-xs text-[#8c8478]">Sign in to read execution data.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-[#6f685f]">
          <Stat label="Completed blocks" value={stats.completed} />
          <Stat label="Missed blocks" value={stats.missed} />
          <Stat label="Partial blocks" value={stats.partial} />
          <Stat label="Skipped blocks" value={stats.skipped} />
          <Stat label="Rescheduled" value={stats.rescheduled} />
          <Stat label="Carry-forward" value={carryForwardCount} />
          <Stat label="Plan changes" value={planChangeCount} />
          <Stat label="Shutdowns done" value={shutdownCount} />
          <div className="col-span-2 md:col-span-4">
            Most common missed reason:{" "}
            <span className="font-medium text-[#25313c]">
              {stats.mostCommonMissedReason ?? "none recorded"}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[#e3ddd2] p-2">
      <div className="text-lg font-semibold text-[#25313c]">{value}</div>
      <div className="text-[10px] uppercase tracking-wider">{label}</div>
    </div>
  );
}
