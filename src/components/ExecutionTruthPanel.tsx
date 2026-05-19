// Phase 1C: Execution Truth — Daily OS execution surface.
// Plan Lock, time block execution status, missed reasons, carry forward,
// and the Shutdown Ritual. Supabase is the source of truth when signed in.

import { useCallback, useEffect, useMemo, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { SyncBadge } from "@/components/SyncBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUIMode } from "@/providers/UIModeContext";
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
  createBlockResolutionDraft,
  createShutdownRitualDraft,
  shouldShowAntiDriftWarning,
  type BlockResolutionDraft,
  type CarryForwardAction,
  type PlanChangeReason,
  type ShutdownRitualDraft,
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
  const { isAdvanced } = useUIMode();
  const [plan, setPlan] = useState<DailyPlanRow | null>(null);
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [shutdown, setShutdown] = useState<DailyShutdownRow | null>(null);
  const [status, setStatus] = useState<LifeeeSyncStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [unlockReason, setUnlockReason] = useState<PlanChangeReason>(PLAN_CHANGE_REASONS[0]);
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [blockResolution, setBlockResolution] = useState<
    | (BlockResolutionDraft & {
        block: TimeBlock;
        completeLinkedTask: boolean;
      })
    | null
  >(null);
  const [shutdownDraft, setShutdownDraft] = useState<ShutdownRitualDraft | null>(null);

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

    const loadExecutionData = async () => {
      if (!loggedIn || !userId) {
        if (active) setStatus(hasSupabaseConfig ? "waiting" : "local");
        return;
      }
      setStatus("loading");
      try {
        await reload();
        if (active) setStatus("saved");
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load execution data.");
        setStatus("error");
      }
    };

    void loadExecutionData();

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
      setError("Sign in to save.");
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

  function openUnlockDialog() {
    setUnlockReason(PLAN_CHANGE_REASONS[0]);
    setUnlockDialogOpen(true);
  }

  async function submitUnlock() {
    const reason = unlockReason;
    setUnlockDialogOpen(false);
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
  function requestBlockStatus(block: TimeBlock, next: ExecutionStatus) {
    const linked = block.linked_task_id ? taskById.get(block.linked_task_id) ?? null : null;
    const draft = createBlockResolutionDraft({
      block,
      nextStatus: next,
      linkedTask: linked,
    });

    if (draft.canApplyImmediately) {
      void applyBlockStatus(block, next, {
        missedReason: block.missed_reason,
        completeLinkedTask: false,
      });
      return;
    }

    setBlockResolution({
      ...draft,
      block,
      completeLinkedTask: false,
    });
  }

  async function applyBlockStatus(
    block: TimeBlock,
    next: ExecutionStatus,
    options: { missedReason: string | null; completeLinkedTask: boolean },
  ) {
    const now = new Date().toISOString();
    const missedReason = options.missedReason;

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
        if (linked && linked.status !== "done" && options.completeLinkedTask) {
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
    });
  }

  async function submitBlockResolution() {
    if (!blockResolution) return;
    const current = blockResolution;
    setBlockResolution(null);
    await applyBlockStatus(current.block, current.nextStatus, {
      missedReason: current.requiresReason ? current.missedReason : current.block.missed_reason,
      completeLinkedTask: current.completeLinkedTask,
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
  function openShutdownDialog() {
    setShutdownDraft(createShutdownRitualDraft(shutdown));
  }

  function updateShutdownDraft(patch: Partial<ShutdownRitualDraft>) {
    setShutdownDraft((current) => (current ? { ...current, ...patch } : current));
  }

  async function submitShutdown() {
    if (!shutdownDraft) return;
    const draft = shutdownDraft;
    setShutdownDraft(null);

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
        shutdown_notes: draft.notes,
        anti_drift_lesson: draft.lesson,
        tomorrow_first_move: draft.firstMove,
        tomorrow_shutdown_target: draft.target,
        missed_summary: missedSummary,
        carry_forward_summary: carrySummary,
      });
      await insertTaskEvent(userId!, {
        task_id: plan?.must_do_task_id ?? "",
        event_type: "shutdown_completed",
        reason: draft.firstMove,
      }).catch(() => undefined);
    });
  }

  return (
    <section className="card-surface p-4 border-l-2 border-[#6b87ae] space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#6b87ae]" />
          <h2 className="text-[10px] uppercase tracking-wider text-[#6b87ae] font-semibold">
            Today's Progress
          </h2>
        </div>
        <SyncBadge status={status} />
      </div>

      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      {!loggedIn ? (
        <p className="text-xs text-[#8c8478]">
          Draft only — sign in to track today's progress.
        </p>
      ) : null}

      {/* Plan Lock */}
      <div className="rounded-md border border-[#e3ddd2] p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[#25313c]">
            {lockStatus === "locked" ? "Plan Locked" : "Today's Plan"}
          </span>
          {lockStatus === "locked" ? (
            <Button size="sm" variant="outline" onClick={openUnlockDialog} disabled={!loggedIn}>
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
        {isAdvanced ? (
          <>
            {stats.total} blocks · {stats.completed} done · {stats.partial} partial ·{" "}
            {stats.missed} missed · {stats.skipped} skipped · {stats.notStarted} not started
            {stats.mostCommonMissedReason
              ? ` · top miss reason: ${stats.mostCommonMissedReason}`
              : ""}
          </>
        ) : (
          <>
            {stats.total} planned blocks · {stats.completed} complete
          </>
        )}
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
                    {isAdvanced && linked?.task_code ? ` · ${linked.task_code}` : ""}
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
                {isAdvanced ? (
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      disabled={!loggedIn}
                      onClick={() => requestBlockStatus(block, "in_progress")}
                    >
                      Start
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      disabled={!loggedIn}
                      onClick={() => requestBlockStatus(block, "done")}
                    >
                      Done
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      disabled={!loggedIn}
                      onClick={() => requestBlockStatus(block, "partial")}
                    >
                      Partial
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      disabled={!loggedIn}
                      onClick={() => requestBlockStatus(block, "missed")}
                    >
                      Missed
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      disabled={!loggedIn}
                      onClick={() => requestBlockStatus(block, "skipped")}
                    >
                      Skip
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      disabled={!loggedIn}
                      onClick={() => requestBlockStatus(block, "rescheduled")}
                    >
                      Reschedule
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    {block.execution_status === "in_progress" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        disabled={!loggedIn}
                        onClick={() => requestBlockStatus(block, "done")}
                      >
                        Complete
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        disabled={!loggedIn}
                        onClick={() => requestBlockStatus(block, "in_progress")}
                      >
                        Start
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px]"
                          disabled={!loggedIn}
                          aria-label={`More execution actions for ${block.title}`}
                        >
                          <MoreHorizontal size={14} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => requestBlockStatus(block, "done")}>
                          Done
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => requestBlockStatus(block, "partial")}>
                          Partial
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => requestBlockStatus(block, "missed")}>
                          Missed
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => requestBlockStatus(block, "skipped")}>
                          Skip
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => requestBlockStatus(block, "rescheduled")}>
                          Reschedule
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
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
          <Button size="sm" onClick={openShutdownDialog} disabled={!loggedIn}>
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

      <Dialog open={unlockDialogOpen} onOpenChange={setUnlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlock today&apos;s plan</DialogTitle>
            <DialogDescription>
              Choose the reason before changing a locked plan.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-1 text-sm font-medium text-foreground">
            Change reason
            <select
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={unlockReason}
              onChange={(event) => setUnlockReason(event.target.value as PlanChangeReason)}
            >
              {PLAN_CHANGE_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setUnlockDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submitUnlock} disabled={!loggedIn}>
              Save reason
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(blockResolution)}
        onOpenChange={(open) => {
          if (!open) setBlockResolution(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update block status</DialogTitle>
            <DialogDescription>
              Confirm what happened before saving today&apos;s progress.
            </DialogDescription>
          </DialogHeader>
          {blockResolution ? (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                <div className="font-medium text-foreground">{blockResolution.block.title}</div>
                <div className="text-xs text-muted-foreground">
                  {blockResolution.block.start_time}–{blockResolution.block.end_time} ·{" "}
                  {EXECUTION_STATUS_LABELS[blockResolution.nextStatus]}
                </div>
              </div>
              {blockResolution.requiresReason ? (
                <label className="space-y-1 text-sm font-medium text-foreground">
                  Reason
                  <select
                    className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                    value={blockResolution.missedReason}
                    onChange={(event) =>
                      setBlockResolution((current) =>
                        current ? { ...current, missedReason: event.target.value } : current,
                      )
                    }
                  >
                    {MISSED_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {blockResolution.requiresLinkedTaskDecision ? (
                <label className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={blockResolution.completeLinkedTask}
                    onChange={(event) =>
                      setBlockResolution((current) =>
                        current
                          ? { ...current, completeLinkedTask: event.target.checked }
                          : current,
                      )
                    }
                  />
                  <span>
                    Mark linked task done too
                    {blockResolution.linkedTaskTitle ? (
                      <span className="block text-xs text-muted-foreground">
                        {blockResolution.linkedTaskTitle}
                      </span>
                    ) : null}
                  </span>
                </label>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBlockResolution(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={submitBlockResolution} disabled={!loggedIn}>
              Save status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(shutdownDraft)}
        onOpenChange={(open) => {
          if (!open) setShutdownDraft(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Shutdown ritual</DialogTitle>
            <DialogDescription>
              Close the day with what happened, what it taught you, and tomorrow&apos;s first move.
            </DialogDescription>
          </DialogHeader>
          {shutdownDraft ? (
            <div className="grid gap-3">
              <label className="space-y-1 text-sm font-medium text-foreground">
                What happened today?
                <Textarea
                  value={shutdownDraft.notes}
                  onChange={(event) => updateShutdownDraft({ notes: event.target.value })}
                  placeholder="Plan changes, completions, misses, and useful context"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-foreground">
                Anti-drift lesson
                <Textarea
                  value={shutdownDraft.lesson}
                  onChange={(event) => updateShutdownDraft({ lesson: event.target.value })}
                  placeholder="What does the execution data teach you?"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-foreground">
                Tomorrow&apos;s first move
                <Input
                  value={shutdownDraft.firstMove}
                  onChange={(event) => updateShutdownDraft({ firstMove: event.target.value })}
                  placeholder="The first concrete action"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-foreground">
                Tomorrow shutdown / sleep target
                <Input
                  value={shutdownDraft.target}
                  onChange={(event) => updateShutdownDraft({ target: event.target.value })}
                  placeholder="22:30"
                />
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShutdownDraft(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={submitShutdown} disabled={!loggedIn}>
              Save shutdown
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
