import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookmarkPlus,
  CalendarClock,
  CheckCircle2,
  EyeOff,
  Inbox,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  TASK_TYPES,
  completeTask,
  ignoreTaskToday,
  makeTask,
  moveTaskToThisWeek,
  moveTaskToToday,
  updateTask,
  type DailyRole,
  type Task,
  type TaskType,
} from "@/lib/task-system";
import type { CalendarAnchor } from "@/lib/calendar-system";
import {
  buildDecisionLoopSummary,
  type TrustProtector,
} from "@/lib/today-decision-loop";
import {
  getSyncLabel,
  getSyncTone,
  type DecisionLog,
  type LifeeeSyncStatus,
  upsertUniversalTask,
} from "@/lib/lifeee-persistence";
import type { OutcomeMatch } from "@/lib/decision-outcome-feedback";

export type TodayDecisionLoopProps = {
  today: string;
  tasks: Task[];
  anchors: CalendarAnchor[];
  currentEnergy: number;
  userId: string | null;
  hasSupabaseConfig: boolean;
  sessionLoading: boolean;
  remoteLoaded: boolean;
  onTaskUpserted: (task: Task) => void;
  onTaskCreated: (task: Task) => void;
  planNotes: string;
  onPlanNotesChange: (notes: string) => void;
  planNotesSyncStatus: LifeeeSyncStatus;
  planNotesError: string | null;
  onLogIgnoreDecision?: (task: Task, reviewDate: string | null) => Promise<void> | void;
  outcomeMatches?: Record<string, OutcomeMatch>;
  decisions?: DecisionLog[];
};

const QUICK_TYPES: TaskType[] = ["Academic", "Career", "Household", "Personal"];

const TRUST_KIND_STYLE: Record<TrustProtector["kind"], { label: string; color: string }> = {
  overdue: { label: "Overdue", color: "text-rose-700 bg-rose-100 border-rose-200" },
  "due-today": { label: "Due today", color: "text-amber-700 bg-amber-100 border-amber-200" },
  prep: { label: "Prep", color: "text-sky-700 bg-sky-100 border-sky-200" },
  "follow-up": { label: "Follow up", color: "text-violet-700 bg-violet-100 border-violet-200" },
  "high-consequence": {
    label: "High consequence",
    color: "text-stone-700 bg-stone-100 border-stone-200",
  },
  "overdue-decision-review": {
    label: "Review overdue",
    color: "text-fuchsia-700 bg-fuchsia-100 border-fuchsia-200",
  },
};

export default function TodayDecisionLoop({
  today,
  tasks,
  anchors,
  currentEnergy,
  userId,
  hasSupabaseConfig,
  sessionLoading,
  remoteLoaded,
  onTaskUpserted,
  onTaskCreated,
  planNotes,
  onPlanNotesChange,
  planNotesSyncStatus,
  planNotesError,
  onLogIgnoreDecision,
  outcomeMatches,
  decisions,
}: TodayDecisionLoopProps) {
  const summary = useMemo(
    () =>
      buildDecisionLoopSummary({
        tasks,
        anchors,
        today,
        currentEnergy,
        decisions,
      }),
    [tasks, anchors, today, currentEnergy, decisions],
  );

  const [captureTitle, setCaptureTitle] = useState("");
  const [captureType, setCaptureType] = useState<TaskType>("Personal");
  const [captureSyncStatus, setCaptureSyncStatus] = useState<LifeeeSyncStatus>("local");
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const captureSeqRef = useRef(0);
  const draftPlanNoteRef = useRef(planNotes);
  const [planNoteDraft, setPlanNoteDraft] = useState(planNotes);
  const [logFormTaskId, setLogFormTaskId] = useState<string | null>(null);
  const [logFormReviewDate, setLogFormReviewDate] = useState<string>("");
  const [loggedIgnoreIds, setLoggedIgnoreIds] = useState<Set<string>>(() => new Set());
  const [logSyncStatus, setLogSyncStatus] = useState<LifeeeSyncStatus>("local");
  const [logError, setLogError] = useState<string | null>(null);

  if (draftPlanNoteRef.current !== planNotes) {
    draftPlanNoteRef.current = planNotes;
    // Stay in sync if the parent reloads notes from Supabase.
    if (planNoteDraft !== planNotes) setPlanNoteDraft(planNotes);
  }

  const visibleCaptureStatus: LifeeeSyncStatus = sessionLoading
    ? "loading"
    : !hasSupabaseConfig
      ? "local"
      : !userId
        ? "waiting"
        : captureSyncStatus;

  const persistTask = async (task: Task, mode: "create" | "update") => {
    if (!hasSupabaseConfig) {
      // Notify parent so optimistic state updates, but mark as local draft only.
      if (mode === "create") onTaskCreated(task);
      else onTaskUpserted(task);
      setCaptureSyncStatus("local");
      return;
    }

    if (!userId || !remoteLoaded) {
      if (mode === "create") onTaskCreated(task);
      else onTaskUpserted(task);
      setCaptureSyncStatus("waiting");
      return;
    }

    const seq = captureSeqRef.current + 1;
    captureSeqRef.current = seq;
    setCaptureSyncStatus("saving");
    setCaptureError(null);
    setPendingId(task.id);

    try {
      const saved = await upsertUniversalTask(userId, task, currentEnergy);
      if (captureSeqRef.current !== seq) return;
      if (mode === "create") onTaskCreated(saved);
      else onTaskUpserted(saved);
      setCaptureSyncStatus("saved");
    } catch (error) {
      if (captureSeqRef.current !== seq) return;
      setCaptureSyncStatus("error");
      setCaptureError(error instanceof Error ? error.message : "Decision loop save failed.");
    } finally {
      setPendingId((current) => (current === task.id ? null : current));
    }
  };

  const captureNow = async () => {
    const title = captureTitle.trim();
    if (!title) return;
    const task = makeTask({
      title,
      task_type: captureType,
      status: "inbox",
    });
    setCaptureTitle("");
    await persistTask(task, "create");
  };

  const moveTo = async (task: Task, target: "today" | "ignore" | "complete" | "this_week") => {
    let next: Task = task;
    if (target === "today") {
      next = updateTask(moveTaskToToday(task), { daily_role: dailyRoleForToday(task) });
    } else if (target === "ignore") {
      next = ignoreTaskToday(task, today);
    } else if (target === "this_week") {
      next = moveTaskToThisWeek(task);
    } else if (target === "complete") {
      next = completeTask(task);
    }
    await persistTask(next, "update");
  };

  const commitPlanNote = () => {
    if (planNoteDraft === planNotes) return;
    onPlanNotesChange(planNoteDraft);
  };

  const beginLogDecision = (task: Task) => {
    setLogFormTaskId(task.id);
    setLogFormReviewDate("");
    setLogError(null);
  };

  const cancelLogDecision = () => {
    setLogFormTaskId(null);
    setLogFormReviewDate("");
    setLogError(null);
  };

  const confirmLogDecision = async (task: Task) => {
    if (!onLogIgnoreDecision) return;
    if (loggedIgnoreIds.has(task.id)) return;
    setLogSyncStatus("saving");
    setLogError(null);
    try {
      await onLogIgnoreDecision(task, logFormReviewDate || null);
      setLoggedIgnoreIds((prev) => {
        const next = new Set(prev);
        next.add(task.id);
        return next;
      });
      setLogSyncStatus("saved");
      setLogFormTaskId(null);
      setLogFormReviewDate("");
    } catch (error) {
      setLogSyncStatus("error");
      setLogError(error instanceof Error ? error.message : "Decision log save failed.");
    }
  };

  return (
    <section className="card-surface p-4 space-y-4 border-l-2 border-[#6b87ae]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-[#6b87ae]" />
            <h2 className="text-sm font-semibold text-[#25313c] uppercase tracking-wider">
              Today Decision Loop
            </h2>
          </div>
          <p className="mt-1 max-w-xl text-xs text-[#6f685f]">
            Capture into universal_tasks, decide what counts today, mark what to ignore,
            and surface trust protectors. All edits persist to Supabase.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-wider font-semibold ${getSyncTone(
              visibleCaptureStatus,
            )}`}
            title={captureError ?? undefined}
          >
            {getSyncLabel(visibleCaptureStatus)}
          </span>
          {captureError ? (
            <span className="text-[10px] text-destructive max-w-[220px] text-right">
              {captureError}
            </span>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-[#ddd4c6] bg-white/70 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Inbox size={14} className="text-[#6f685f]" />
          <div className="text-[11px] uppercase tracking-wider text-[#6f685f] font-semibold">
            Capture to Life Inbox
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={captureTitle}
            onChange={(event) => setCaptureTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void captureNow();
              }
            }}
            placeholder="What just came up? (saved to universal_tasks)"
            className="flex-1 min-w-[200px] rounded-md border border-[#ddd4c6] bg-white px-3 py-2 text-sm"
          />
          <select
            value={captureType}
            onChange={(event) => setCaptureType(event.target.value as TaskType)}
            className="rounded-md border border-[#ddd4c6] bg-white px-3 py-2 text-sm"
          >
            {TASK_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <button
            onClick={() => void captureNow()}
            className="inline-flex items-center gap-2 rounded-md bg-[#25313c] px-3 py-2 text-sm text-white hover:bg-[#3a4754]"
            disabled={!captureTitle.trim()}
          >
            <Plus size={14} />
            Capture
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {QUICK_TYPES.map((quick) => (
            <button
              key={quick}
              type="button"
              onClick={() => setCaptureType(quick)}
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                captureType === quick
                  ? "border-[#25313c] bg-[#25313c] text-white"
                  : "border-[#ddd4c6] bg-white text-[#6f685f] hover:bg-[#f7f3ec]"
              }`}
            >
              {quick}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <DecisionListPanel
          icon={<ShieldCheck size={12} className="text-[#6b87ae]" />}
          title="Trust protectors"
          emptyHint="No overdue, due-today, prep, or high-consequence items detected."
        >
          {summary.trustProtectors.length === 0 ? null : (
            <ul className="space-y-1.5">
              {summary.trustProtectors.map((protector) => {
                const style = TRUST_KIND_STYLE[protector.kind];
                return (
                  <li
                    key={protector.id}
                    className="rounded-md border border-[#ece5da] bg-white/80 p-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-[#25313c]">{protector.title}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${style.color}`}
                      >
                        {style.label}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-[#6f685f]">
                      {protector.task_code ? `${protector.task_code} · ` : ""}
                      {protector.reason}
                      {protector.detail ? ` · ${protector.detail}` : ""}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DecisionListPanel>

        <DecisionListPanel
          icon={<Inbox size={12} className="text-[#c39a4e]" />}
          title="Inbox candidates"
          emptyHint="Inbox is clear. Add anything new in the capture box above."
        >
          {summary.inboxCandidates.length === 0 ? null : (
            <ul className="space-y-1.5">
              {summary.inboxCandidates.map((task) => (
                <li
                  key={task.id}
                  className="rounded-md border border-[#ece5da] bg-white/80 p-2 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-[#25313c] truncate">{task.title}</span>
                    <span className="text-[10px] text-[#6f685f]">
                      {task.task_code} · {task.task_type}
                    </span>
                  </div>
                  {outcomeMatches?.[task.id] ? (
                    <OutcomeLensTag match={outcomeMatches[task.id]!} />
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-1">
                    <ActionButton
                      label="Today"
                      icon={<CalendarClock size={10} />}
                      onClick={() => void moveTo(task, "today")}
                      pending={pendingId === task.id}
                    />
                    <ActionButton
                      label="This Week"
                      icon={<ArrowRight size={10} />}
                      onClick={() => void moveTo(task, "this_week")}
                      pending={pendingId === task.id}
                    />
                    <ActionButton
                      label="Ignore Today"
                      icon={<EyeOff size={10} />}
                      onClick={() => void moveTo(task, "ignore")}
                      pending={pendingId === task.id}
                      variant="muted"
                    />
                    <ActionButton
                      label="Done"
                      icon={<CheckCircle2 size={10} />}
                      onClick={() => void moveTo(task, "complete")}
                      pending={pendingId === task.id}
                      variant="success"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DecisionListPanel>

        <DecisionListPanel
          icon={<CalendarClock size={12} className="text-[#6b87ae]" />}
          title="Committed today"
          emptyHint="Nothing committed for today yet. Move an inbox candidate into Today."
        >
          {summary.todayCommitted.length === 0 ? null : (
            <ul className="space-y-1.5">
              {summary.todayCommitted.slice(0, 8).map((task) => (
                <li
                  key={task.id}
                  className="rounded-md border border-[#ece5da] bg-white/80 p-2 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-[#25313c] truncate">{task.title}</span>
                    <span className="text-[10px] text-[#6f685f]">
                      {task.task_code} · {task.daily_role ?? "Auto"}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <ActionButton
                      label="Done"
                      icon={<CheckCircle2 size={10} />}
                      onClick={() => void moveTo(task, "complete")}
                      pending={pendingId === task.id}
                      variant="success"
                    />
                    <ActionButton
                      label="Ignore Today"
                      icon={<EyeOff size={10} />}
                      onClick={() => void moveTo(task, "ignore")}
                      pending={pendingId === task.id}
                      variant="muted"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DecisionListPanel>

        <DecisionListPanel
          icon={<EyeOff size={12} className="text-[#9b938a]" />}
          title="Ignore today (intentional)"
          emptyHint="Mark items as Ignore Today to clear noise without losing them."
        >
          {summary.ignoredToday.length === 0 ? null : (
            <ul className="space-y-1.5">
              {summary.ignoredToday.map((task) => {
                const isLogging = logFormTaskId === task.id;
                const alreadyLogged = loggedIgnoreIds.has(task.id);
                return (
                  <li
                    key={task.id}
                    className="rounded-md border border-[#ece5da] bg-white/70 p-2 text-xs opacity-90"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-[#25313c] truncate">{task.title}</span>
                      <span className="text-[10px] text-[#9b938a]">
                        {task.task_code} · {task.task_type}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <ActionButton
                        label="Move to Today"
                        icon={<CalendarClock size={10} />}
                        onClick={() => void moveTo(task, "today")}
                        pending={pendingId === task.id}
                      />
                      <ActionButton
                        label="This Week"
                        icon={<ArrowRight size={10} />}
                        onClick={() => void moveTo(task, "this_week")}
                        pending={pendingId === task.id}
                      />
                      {onLogIgnoreDecision ? (
                        <ActionButton
                          label={alreadyLogged ? "Logged" : "Log decision"}
                          icon={<BookmarkPlus size={10} />}
                          onClick={() => beginLogDecision(task)}
                          pending={alreadyLogged || isLogging}
                          variant="muted"
                        />
                      ) : null}
                    </div>
                    {isLogging ? (
                      <div className="mt-2 space-y-1 rounded-md border border-[#ddd4c6] bg-white p-2">
                        <div className="text-[10px] uppercase tracking-wider text-[#6f685f] font-semibold">
                          Log decision: ignore today
                        </div>
                        <div className="text-[11px] text-[#6f685f]">
                          decision = “{task.title}” · reason = “Chose to ignore today”
                        </div>
                        <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[#6f685f]">
                          Review date
                          <input
                            type="date"
                            value={logFormReviewDate}
                            onChange={(event) => setLogFormReviewDate(event.target.value)}
                            className="rounded-md border border-[#ddd4c6] px-2 py-1 text-sm normal-case tracking-normal"
                          />
                        </label>
                        <div className="flex flex-wrap gap-1 pt-1">
                          <ActionButton
                            label="Save"
                            icon={<BookmarkPlus size={10} />}
                            onClick={() => void confirmLogDecision(task)}
                            pending={logSyncStatus === "saving"}
                            variant="success"
                          />
                          <ActionButton
                            label="Cancel"
                            icon={<ArrowRight size={10} />}
                            onClick={cancelLogDecision}
                            variant="muted"
                          />
                        </div>
                        {logError ? (
                          <p className="text-[10px] text-destructive">{logError}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </DecisionListPanel>
      </div>

      <div className="rounded-xl border border-[#ddd4c6] bg-white/70 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={12} className="text-[#c39a4e]" />
            <div className="text-[11px] uppercase tracking-wider text-[#6f685f] font-semibold">
              Anti-Drift note (saves to daily_plans.notes)
            </div>
          </div>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getSyncTone(
              planNotesSyncStatus,
            )}`}
            title={planNotesError ?? undefined}
          >
            {getSyncLabel(planNotesSyncStatus)}
          </span>
        </div>
        <textarea
          value={planNoteDraft}
          onChange={(event) => setPlanNoteDraft(event.target.value)}
          onBlur={commitPlanNote}
          placeholder="If today slips, the next action is..."
          rows={2}
          className="w-full rounded-md border border-[#ddd4c6] bg-white px-3 py-2 text-sm"
        />
        {planNotesError ? (
          <p className="text-[11px] text-destructive">{planNotesError}</p>
        ) : null}
      </div>
    </section>
  );
}

function dailyRoleForToday(task: Task): DailyRole | null {
  if (task.fixed_time) return "Anchor";
  if (task.urgency >= 8 && task.consequence_if_delayed >= 8) return "Must Do";
  if ((task.estimated_minutes ?? 999) <= 15 && task.trust_impact >= 6) return "Quick Win";
  return "Should Do";
}

function DecisionListPanel({
  icon,
  title,
  emptyHint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  emptyHint: string;
  children: React.ReactNode;
}) {
  const isEmpty = !children;
  return (
    <div className="rounded-xl border border-[#ddd4c6] bg-white/60 p-3">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <div className="text-[11px] uppercase tracking-wider text-[#6f685f] font-semibold">
          {title}
        </div>
      </div>
      {isEmpty ? <div className="text-xs text-[#9b938a]">{emptyHint}</div> : children}
    </div>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
  pending,
  variant = "default",
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  pending?: boolean;
  variant?: "default" | "success" | "muted";
}) {
  const palette =
    variant === "success"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
      : variant === "muted"
        ? "border-[#ddd4c6] bg-[#f7f3ec] text-[#6f685f] hover:bg-[#ece5da]"
        : "border-[#ddd4c6] bg-white text-[#25313c] hover:bg-[#f7f3ec]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${palette} ${
        pending ? "opacity-50 cursor-not-allowed" : ""
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function OutcomeLensTag({ match }: { match: OutcomeMatch }) {
  const palette =
    match.sentiment === "positive"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : match.sentiment === "negative"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-stone-200 bg-stone-50 text-stone-700";
  const label =
    match.sentiment === "positive"
      ? "Worked before"
      : match.sentiment === "negative"
        ? "Backfired before"
        : "Logged before";
  const result = (match.decision.result_later ?? "").trim();
  const shortResult = result.length > 40 ? `${result.slice(0, 40)}…` : result;
  return (
    <div
      className={`mt-1 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium ${palette}`}
      title={result}
    >
      <span>{label}</span>
      {shortResult ? <span>· Last result: {shortResult}</span> : null}
    </div>
  );
}
