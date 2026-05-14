// Phase 1C: Execution Truth — Daily OS execution surface.
// Plan Lock, time block execution status, missed reasons, carry forward,
// and the Shutdown Ritual. Supabase is the source of truth when signed in.

import { useCallback, useEffect, useMemo, useState } from "react";
import { SyncBadge } from "@/components/SyncBadge";
import { Button } from "@/components/ui/button";
import {
  EXECUTION_STATUS_LABELS,
  type ExecutionStatus,
  type TimeBlock,
} from "@/lib/calendar-system";
import {
  ANTI_DRIFT_WARNING,
  CARRY_FORWARD_ACTION_LABELS,
  CARRY_FORWARD_ACTIONS,
  EXECUTION_STATUS_TONE,
  MISSED_REASONS,
  PLAN_CHANGE_REASONS,
  aggregateExecutionStats,
  shouldShowAntiDriftWarning,
  type CarryForwardAction,
} from "@/lib/execution-truth";
import {
  fetchDailyPlan,
  fetchDailyShutdown,
  fetchTimeBlocksForDate,
  fetchUniversalTasks,
  insertTaskEvent,
  updateDailyPlanLock,
  updateTimeBlockExecution,
  upsertDailyShutdown,
  upsertUniversalTask,
  type DailyPlanRow,
  type DailyShutdownRow,
  type LifeeeSyncStatus,
} from "@/lib/lifeee-persistence";
import {
  archiveTask,
  incrementCarryForwardCount,
  incrementRescheduledCount,
  trashTask,
  updateTask,
  type Task,
} from "@/lib/task-system";

type Props = {
  today: string;
  userId: string | null;
  hasSupabaseConfig: boolean;
};

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function ExecutionTruthPanel({ today, userId, hasSupabaseConfig }: Props) {
  const [plan, setPlan] = useState<DailyPlanRow | null>(null);
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [shutdown, setShutdown] = useState<DailyShutdownRow | null>(null);
  const [status, setStatus] = useState<LifeeeSyncStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const loggedIn = hasSupabaseConfig && Boolean(userId);

  const reload = useCallback(async () => {
    if (!userId) return;
    const [planRow, blockRows, taskRows, shutdownRow] = await Promise.all([
      fetchDailyPlan(userId, today),
      fetchTimeBlocksForDate(userId, today),
      fetchUniversalTasks(userId),
      fetchDailyShutdown(userId, today),
    ]);
    setPlan(planRow);
    setBlocks(blockRows);
    setTasks(taskRows);
    setShutdown(shutdownRow);
  }, [today, userId]);

  useEffect(() => {
    let active = true;
    if (!loggedIn || !userId) {
      setStatus(hasSupabaseConfig ? "waiting" : "local");
      return;
    }
    setStatus("loading");
    reload()
      .then(() => {
        if (active) setStatus("saved");
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load execution data.");
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [hasSupabaseConfig, loggedIn, reload, userId]);

  const stats = useMemo(() => aggregateExecutionStats(blocks), [blocks]);
  const taskById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks],
  );

  async function runMutation(fn: () => Promise<void>) {
    if (!userId) {
      setError("Sign in to save execution truth to Supabase.");
      return;
    }
    setStatus("saving");
    setError(null);
    try {
      await fn();
      await reload();
      setStatus("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      setStatus("error");
    }
  }

  // ── Plan Lock ─────────────────────────────────────────────────────────────
  const lockStatus = plan?.lock_status === "locked" ? "locked" : "unlocked";

  async function handleLock() {
    await runMutation(async () => {
      await updateDailyPlanLock(userId!, { date: today, lock_status: "locked" });
      await insertTaskEvent(userId!, {
        task_id: plan?.must_do_task_id ?? "",
        event_type: "plan_locked",
        reason: today,
      }).catch(() => undefined);
    });
  }

  async function handleUnlock() {
    const reason = window.prompt(
      `Change reason (one of: ${PLAN_CHANGE_REASONS.join(", ")}):`,
      PLAN_CHANGE_REASONS[0],
    );
    if (!reason) return;
    await runMutation(async () => {
      await updateDailyPlanLock(userId!, {
        date: today,
        lock_status: "unlocked",
        lock_reason: reason,
        changeReason: reason,
      });
      await insertTaskEvent(userId!, {
        task_id: plan?.must_do_task_id ?? "",
        event_type: "plan_unlocked",
        reason,
      }).catch(() => undefined);
    });
  }

  // ── Time Block Execution ──────────────────────────────────────────────────
  async function setBlockStatus(block: TimeBlock, next: ExecutionStatus) {
    const now = new Date().toISOString();
    let missedReason: string | null = block.missed_reason;

    if (next === "missed" || next === "skipped") {
      const linked = block.linked_task_id ? taskById.get(block.linked_task_id) : undefined;
      const highStakes =
        linked?.priority === "high" ||
        linked?.priority === "critical" ||
        linked?.consequence_level === "high" ||
        linked?.consequence_level === "critical";
      if (next === "missed" || highStakes) {
        const entered = window.prompt(
          `Reason this block was ${next} (one of: ${MISSED_REASONS.join(", ")}):`,
          MISSED_REASONS[0],
        );
        if (!entered) return;
        missedReason = entered;
      }
    }

    await runMutation(async () => {
      await updateTimeBlockExecution(userId!, block.id, {
        execution_status: next,
        started_at: next === "in_progress" ? now : block.started_at,
        completed_at: next === "done" ? now : next === "partial" ? now : block.completed_at,
        missed_at: next === "missed" ? now : block.missed_at,
        skipped_at: next === "skipped" ? now : block.skipped_at,
        missed_reason: missedReason,
      });

      const eventType =
        next === "in_progress"
          ? "block_started"
          : next === "done"
            ? "block_completed"
            : next === "partial"
              ? "block_partial"
              : next === "missed"
                ? "block_missed"
                : next === "skipped"
                  ? "block_skipped"
                  : "block_rescheduled";
      if (block.linked_task_id) {
        await insertTaskEvent(userId!, {
          task_id: block.linked_task_id,
          event_type: eventType,
          reason: missedReason ?? block.title,
        }).catch(() => undefined);
      }

      // Mark linked task done only when block represents the whole task.
      if (next === "done" && block.linked_task_id) {
        const linked = taskById.get(block.linked_task_id);
        if (linked && linked.status !== "done") {
          const confirmDone = window.confirm(
            `Mark linked task "${linked.title}" as done too?`,
          );
          if (confirmDone) {
            await upsertUniversalTask(
              userId!,
              updateTask(linked, {
                status: "done",
                completed_at: now,
                previous_status: linked.status,
              }),
              5,
            );
          }
        }
      }
    });
  }

  // ── Carry Forward ─────────────────────────────────────────────────────────
  async function applyCarryForward(block: TimeBlock, action: CarryForwardAction) {
    const linked = block.linked_task_id ? taskById.get(block.linked_task_id) : undefined;
    await runMutation(async () => {
      if (!linked) {
        if (action === "reschedule") {
          await updateTimeBlockExecution(userId!, block.id, {
            execution_status: "rescheduled",
          });
        }
        return;
      }
      let updated: Task = linked;
      switch (action) {
        case "carry_tomorrow":
          updated = incrementCarryForwardCount(
            updateTask(linked, { due_date: nextDay(today), status: "today" }),
          );
          break;
        case "reschedule":
          updated = incrementRescheduledCount(updateTask(linked, { status: "scheduled" }));
          break;
        case "break_down":
          updated = updateTask(linked, { status: "this_week" });
          break;
        case "parking_lot":
          updated = updateTask(linked, {
            status: "parking_lot",
            previous_status: linked.status,
          });
          break;
        case "archive":
          updated = archiveTask(linked);
          break;
        case "trash":
          updated = trashTask(linked);
          break;
        case "mark_done":
          updated = updateTask(linked, {
            status: "done",
            completed_at: new Date().toISOString(),
            previous_status: linked.status,
          });
          break;
        case "keep_active_week":
          updated = updateTask(linked, { status: "this_week" });
          break;
      }
      await upsertUniversalTask(userId!, updated, 5);
      const eventType =
        action === "carry_tomorrow"
          ? "task_carried_forward"
          : action === "archive"
            ? "task_archived"
            : action === "trash"
              ? "task_trashed"
              : action === "reschedule"
                ? "block_rescheduled"
                : "edited";
      await insertTaskEvent(userId!, {
        task_id: linked.id,
        event_type: eventType,
        reason: CARRY_FORWARD_ACTION_LABELS[action],
      }).catch(() => undefined);
    });
  }

  // ── Shutdown Ritual ───────────────────────────────────────────────────────
  async function completeShutdown() {
    const notes = window.prompt("Shutdown notes — what happened today?", shutdown?.shutdown_notes ?? "");
    if (notes === null) return;
    const lesson = window.prompt(
      "Anti-drift lesson — what does the execution data teach you?",
      shutdown?.anti_drift_lesson ?? "",
    );
    if (lesson === null) return;
    const firstMove = window.prompt(
      "Tomorrow's first move?",
      shutdown?.tomorrow_first_move ?? "",
    );
    if (firstMove === null) return;
    const target = window.prompt(
      "Tomorrow shutdown / sleep target?",
      shutdown?.tomorrow_shutdown_target ?? "",
    );
    if (target === null) return;

    const missedSummary = blocks
      .filter((b) => b.execution_status === "missed" || b.execution_status === "skipped")
      .map((b) => ({ id: b.id, title: b.title, reason: b.missed_reason }));
    const carrySummary = blocks
      .filter((b) => b.execution_status === "partial" || b.execution_status === "missed")
      .map((b) => ({ id: b.id, title: b.title, task_id: b.linked_task_id }));

    await runMutation(async () => {
      await upsertDailyShutdown(userId!, {
        date: today,
        completed_at: new Date().toISOString(),
        shutdown_notes: notes,
        anti_drift_lesson: lesson,
        tomorrow_first_move: firstMove,
        tomorrow_shutdown_target: target,
        missed_summary: missedSummary,
        carry_forward_summary: carrySummary,
      });
      await insertTaskEvent(userId!, {
        task_id: plan?.must_do_task_id ?? "",
        event_type: "shutdown_completed",
        reason: firstMove,
      }).catch(() => undefined);
    });
  }

  return (
    <section className="card-surface p-4 border-l-2 border-[#6b87ae] space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#6b87ae]" />
          <h2 className="text-[10px] uppercase tracking-wider text-[#6b87ae] font-semibold">
            Execution Truth
          </h2>
        </div>
        <SyncBadge status={status} />
      </div>

      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      {!loggedIn ? (
        <p className="text-xs text-[#8c8478]">
          Local draft only — sign in to track execution against Supabase.
        </p>
      ) : null}

      {/* Plan Lock */}
      <div className="rounded-md border border-[#e3ddd2] p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[#25313c]">
            {lockStatus === "locked" ? "Plan Locked" : "Today's Plan"}
          </span>
          {lockStatus === "locked" ? (
            <Button size="sm" variant="outline" onClick={handleUnlock} disabled={!loggedIn}>
              Unlock / modify (reason required)
            </Button>
          ) : (
            <Button size="sm" onClick={handleLock} disabled={!loggedIn}>
              Lock Today's Plan
            </Button>
          )}
        </div>
        <p className="text-[11px] text-[#6f685f]">
          Plan changes: {plan?.plan_change_count ?? 0}
          {plan?.lock_reason ? ` · last reason: ${plan.lock_reason}` : ""}
        </p>
      </div>

      {/* Execution summary */}
      <div className="text-[11px] text-[#6f685f]">
        {stats.total} blocks · {stats.completed} done · {stats.partial} partial ·{" "}
        {stats.missed} missed · {stats.skipped} skipped · {stats.notStarted} not started
        {stats.mostCommonMissedReason
          ? ` · top miss reason: ${stats.mostCommonMissedReason}`
          : ""}
      </div>

      {/* Time blocks */}
      <div className="space-y-2">
        {blocks.length === 0 ? (
          <p className="text-xs text-[#8c8478]">
            No time blocks for today. Import a schedule on the Calendar.
          </p>
        ) : (
          blocks.map((block) => {
            const linked = block.linked_task_id
              ? taskById.get(block.linked_task_id)
              : undefined;
            const showCarry =
              block.execution_status === "missed" || block.execution_status === "partial";
            const antiDrift =
              linked && shouldShowAntiDriftWarning(linked.carry_forward_count ?? 0);
            return (
              <div
                key={block.id}
                className="rounded-md border border-[#e3ddd2] p-2.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-medium text-[#25313c]">
                    {block.start_time}–{block.end_time} · {block.title}
                    {linked?.task_code ? ` · ${linked.task_code}` : ""}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${EXECUTION_STATUS_TONE[block.execution_status]}`}
                  >
                    {EXECUTION_STATUS_LABELS[block.execution_status]}
                  </span>
                </div>
                {block.missed_reason ? (
                  <p className="text-[10px] text-[#8c8478]">
                    Reason: {block.missed_reason}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    disabled={!loggedIn}
                    onClick={() => setBlockStatus(block, "in_progress")}
                  >
                    Start
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    disabled={!loggedIn}
                    onClick={() => setBlockStatus(block, "done")}
                  >
                    Done
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    disabled={!loggedIn}
                    onClick={() => setBlockStatus(block, "partial")}
                  >
                    Partial
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    disabled={!loggedIn}
                    onClick={() => setBlockStatus(block, "missed")}
                  >
                    Missed
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    disabled={!loggedIn}
                    onClick={() => setBlockStatus(block, "skipped")}
                  >
                    Skip
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    disabled={!loggedIn}
                    onClick={() => setBlockStatus(block, "rescheduled")}
                  >
                    Reschedule
                  </Button>
                </div>
                {antiDrift ? (
                  <p className="text-[10px] text-amber-700 font-medium">
                    {ANTI_DRIFT_WARNING}
                  </p>
                ) : null}
                {showCarry ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-[#6f685f]">Carry forward:</span>
                    <select
                      className="h-7 rounded border border-[#e3ddd2] bg-white text-[11px] px-1"
                      defaultValue=""
                      disabled={!loggedIn}
                      onChange={(event) => {
                        const value = event.target.value as CarryForwardAction | "";
                        if (value) {
                          void applyCarryForward(block, value);
                          event.target.value = "";
                        }
                      }}
                    >
                      <option value="" disabled>
                        choose action…
                      </option>
                      {CARRY_FORWARD_ACTIONS.map((action) => (
                        <option key={action} value={action}>
                          {CARRY_FORWARD_ACTION_LABELS[action]}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* Shutdown Ritual */}
      <div className="rounded-md border border-[#e3ddd2] p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[#25313c]">Shutdown Ritual</span>
          <Button size="sm" onClick={completeShutdown} disabled={!loggedIn}>
            {shutdown?.completed_at ? "Update Shutdown" : "Complete Shutdown"}
          </Button>
        </div>
        <p className="text-[11px] text-[#6f685f]">
          Review locked plan, completed and missed blocks, capture reasons, choose
          carry-forward, write the anti-drift lesson, set tomorrow's first move.
        </p>
        {shutdown?.completed_at ? (
          <div className="text-[11px] text-[#6f685f] space-y-0.5">
            <div>Closed at {new Date(shutdown.completed_at).toLocaleString()}</div>
            {shutdown.anti_drift_lesson ? (
              <div>Lesson: {shutdown.anti_drift_lesson}</div>
            ) : null}
            {shutdown.tomorrow_first_move ? (
              <div>Tomorrow first move: {shutdown.tomorrow_first_move}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
