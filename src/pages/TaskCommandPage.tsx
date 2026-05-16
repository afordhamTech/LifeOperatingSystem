import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  CalendarClock,
  CalendarDays,
  Hourglass,
  CheckCircle2,
  Plus,
  Trash2,
  CheckCheck,
  MoreHorizontal,
  Edit3,
  RotateCcw,
  CalendarPlus,
  ParkingCircle,
  Zap,
} from "lucide-react";
import {
  CONSEQUENCE_LEVELS,
  TASK_TYPES,
  DAILY_ROLES,
  TASK_PRIORITIES,
  archiveTask,
  buildTaskSmartViews,
  type Task,
  type CanonicalTaskStatus,
  type TaskStatus,
  type TaskType,
  type DailyRole,
  changeTaskStatus,
  completeTask as markTaskDone,
  formatTaskForPlanningExport,
  hardDeleteTask,
  ignoreTaskToday,
  isActiveTask,
  isArchivedTask,
  isDoneStatus,
  isTrashedTask,
  loadTasks,
  makeTask,
  calcTaskPriority,
  moveTaskToThisWeek,
  moveTaskToToday,
  restoreTask,
  saveTasks,
  scheduleTask,
  trashTask,
  buildTriagePrompt,
  updateTask as patchTaskRecord,
} from "@/lib/task-system";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import {
  fetchUniversalTasks,
  getSyncLabel,
  getSyncTone,
  hardDeleteUniversalTask,
  type LifeeeSyncStatus,
  upsertUniversalTask,
} from "@/lib/lifeee-persistence";
import { useUIMode } from "@/providers/UIModeContext";
import {
  PageDecisionHeader,
  SegmentedModeTabs,
  CollapsibleSection,
  AdvancedDetails,
  AdvancedOnly,
  EmptyStateCard,
  AIActionButton,
} from "@/components/ui-kit";
import { parseTaskTitleInput } from "@/lib/task-nlp-parser";

type PageMode = "capture" | "plan" | "review";

const MODE_OPTIONS: { value: PageMode; label: string }[] = [
  { value: "capture", label: "Capture" },
  { value: "plan", label: "Plan" },
  { value: "review", label: "Review" },
];

function readCurrentEnergy(): number {
  if (typeof window === "undefined") return 7;
  try {
    const raw = window.localStorage.getItem("lifeee.daily.energy");
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
  } catch {
    // ignore
  }
  return 7;
}

export default function TaskCommandPage() {
  const { hasSupabaseConfig, isLoading: sessionLoading, userId } = useSupabaseSession();
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks());
  const [pageMode, setPageMode] = useState<PageMode>("capture");
  const [currentEnergy, setCurrentEnergy] = useState<number>(readCurrentEnergy());
  const currentEnergyRef = useRef(currentEnergy);
  const remoteLoadedRef = useRef(false);
  const saveSequenceRef = useRef(0);
  const [syncStatus, setSyncStatus] = useState<LifeeeSyncStatus>("local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [draft, setDraft] = useState({
    title: "",
    description: "",
    task_type: "Personal" as TaskType,
    due_date: "",
    estimated_minutes: 15,
    energy_required: 5,
    resistance_level: 5,
    urgency: 5,
    importance: 5,
    consequence_if_delayed: 5,
    trust_impact: 5,
    time_efficiency: 5,
    priority: "" as "" | Task["priority"],
    consequence_level: "" as "" | Task["consequence_level"],
    fixed_time: "",
    recurring: false,
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    currentEnergyRef.current = currentEnergy;
  }, [currentEnergy]);

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    let active = true;

    const loadPersistedTasks = async () => {
      if (sessionLoading) return;

      if (!hasSupabaseConfig || !userId) {
        remoteLoadedRef.current = false;
        if (!active) return;
        setTasks(loadTasks());
        setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
        setSyncError(null);
        return;
      }

      setSyncStatus("loading");
      setSyncError(null);

      try {
        const remoteTasks = await fetchUniversalTasks(userId);
        const localTasks = loadTasks();
        const nextTasks =
          remoteTasks.length === 0 && localTasks.length > 0
            ? await Promise.all(
                localTasks.map((task) =>
                  upsertUniversalTask(userId, task, currentEnergyRef.current),
                ),
              )
            : remoteTasks;

        if (!active) return;
        remoteLoadedRef.current = true;
        setTasks(nextTasks);
        saveTasks(nextTasks);
        setSyncStatus("saved");
      } catch (error) {
        if (!active) return;
        remoteLoadedRef.current = false;
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Unable to load tasks.");
      }
    };

    void loadPersistedTasks();

    return () => {
      active = false;
    };
  }, [hasSupabaseConfig, sessionLoading, userId]);

  const smartViews = useMemo(
    () => buildTaskSmartViews(tasks, { today, currentEnergy }),
    [currentEnergy, tasks, today],
  );

  const persistTask = async (task: Task) => {
    if (!userId || !remoteLoadedRef.current) {
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
      return;
    }

    const saveSequence = saveSequenceRef.current + 1;
    saveSequenceRef.current = saveSequence;
    setSyncStatus("saving");
    setSyncError(null);

    try {
      const savedTask = await upsertUniversalTask(userId, task, currentEnergy);
      if (saveSequenceRef.current !== saveSequence) return;
      setTasks((current) =>
        current.map((item) => (item.id === savedTask.id ? savedTask : item)),
      );
      setSyncStatus("saved");
    } catch (error) {
      if (saveSequenceRef.current !== saveSequence) return;
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Unable to save task.");
    }
  };

  const addTask = () => {
    const parsed = parseTaskTitleInput(draft.title);
    const title = parsed.cleanedTitle || draft.title.trim();
    if (!title) return;
    const task = makeTask({
      title,
      description: draft.description.trim(),
      task_type: draft.task_type,
      due_date: draft.due_date || null,
      estimated_minutes: Number(draft.estimated_minutes) || null,
      energy_required: Number(draft.energy_required) || null,
      resistance_level: Number(draft.resistance_level) || null,
      urgency: Number(draft.urgency) || 5,
      importance: Number(draft.importance) || 5,
      consequence_if_delayed: Number(draft.consequence_if_delayed) || 5,
      trust_impact: Number(draft.trust_impact) || 5,
      time_efficiency: Number(draft.time_efficiency) || 5,
      priority: draft.priority || null,
      consequence_level: draft.consequence_level || null,
      fixed_time: draft.fixed_time || null,
      recurring: draft.recurring,
      status: "inbox",
    });
    setTasks((prev) => [task, ...prev]);
    setDraft((d) => ({ ...d, title: "", description: "", fixed_time: "" }));
    void persistTask(task);
  };

  const applyTaskMutation = (id: string, mutate: (task: Task) => Task) => {
    const current = tasks.find((task) => task.id === id);
    if (!current) return;
    const nextTask = mutate(current);
    setTasks((prev) => prev.map((t) => (t.id === id ? nextTask : t)));
    void persistTask(nextTask);
  };

  const updateTask = (id: string, patch: Partial<Task>) => {
    applyTaskMutation(id, (task) => patchTaskRecord(task, patch));
  };

  const hardRemoveTask = (task: Task) => {
    try {
      hardDeleteTask(task, true);
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Hard delete rejected.");
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    if (!userId || !remoteLoadedRef.current) {
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
      return;
    }

    setSyncStatus("saving");
    setSyncError(null);
    void hardDeleteUniversalTask(userId, task, true)
      .then(() => setSyncStatus("saved"))
      .catch((error: unknown) => {
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Unable to delete task.");
      });
  };

  const completeTask = (id: string) =>
    applyTaskMutation(id, markTaskDone);

  const copyPrompt = async () => {
    const text = buildTriagePrompt(tasks, currentEnergy);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const topPriority = useMemo(
    () =>
      [...tasks]
        .filter((t) => isActiveTask(t) && t.status !== "parking_lot")
        .sort(
          (a, b) => calcTaskPriority(b, currentEnergy) - calcTaskPriority(a, currentEnergy),
        )
        .slice(0, 5),
    [tasks, currentEnergy],
  );

  const visibleSyncStatus: LifeeeSyncStatus = sessionLoading
    ? "loading"
    : !hasSupabaseConfig
      ? "local"
      : !userId
        ? "waiting"
        : syncStatus;

  // Shared list-action props.
  const listHandlers = {
    currentEnergy,
    onUpdate: updateTask,
    onChangeStatus: (id: string, status: CanonicalTaskStatus) =>
      applyTaskMutation(id, (task) => changeTaskStatus(task, status)),
    onComplete: completeTask,
    onMoveToday: (id: string) => applyTaskMutation(id, moveTaskToToday),
    onMoveThisWeek: (id: string) => applyTaskMutation(id, moveTaskToThisWeek),
    onSchedule: (id: string) =>
      applyTaskMutation(id, (task) =>
        scheduleTask(task, { dueDate: task.due_date ?? today }),
      ),
    onMarkWaiting: (id: string) =>
      applyTaskMutation(id, (task) => changeTaskStatus(task, "waiting")),
    onIgnoreToday: (id: string) =>
      applyTaskMutation(id, (task) => ignoreTaskToday(task, today)),
    onArchive: (id: string) => applyTaskMutation(id, archiveTask),
    onTrash: (id: string) => applyTaskMutation(id, trashTask),
    onRestore: (id: string) => applyTaskMutation(id, restoreTask),
    onHardDelete: hardRemoveTask,
  };

  const recurringTasks = useMemo(() => tasks.filter((t) => t.recurring), [tasks]);
  const waitingTasks = useMemo(
    () => tasks.filter((t) => t.status === "waiting"),
    [tasks],
  );
  const doneTasks = useMemo(
    () => tasks.filter((t) => isDoneStatus(t.status)),
    [tasks],
  );
  const archivedTasks = useMemo(
    () => tasks.filter((t) => isArchivedTask(t)),
    [tasks],
  );
  const trashedTasks = useMemo(
    () => tasks.filter((t) => isTrashedTask(t)),
    [tasks],
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageDecisionHeader
        title="Tasks"
        question="What needs capturing, planning, or reviewing right now?"
      >
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${getSyncTone(visibleSyncStatus)}`}
          title={visibleSyncStatus === "error" ? syncError ?? undefined : undefined}
        >
          {getSyncLabel(visibleSyncStatus)}
        </span>
        <label className="text-xs text-[#6f685f] flex items-center gap-2">
          <Zap size={13} className="text-[#c39a4e]" />
          Energy
          <input
            type="range"
            min={1}
            max={10}
            value={currentEnergy}
            onChange={(e) => {
              const v = Number(e.target.value) || 1;
              setCurrentEnergy(v);
              try {
                window.localStorage.setItem("lifeee.daily.energy", String(v));
              } catch {
                // ignore
              }
            }}
            className="w-24 accent-[#c39a4e]"
          />
          <span className="font-mono-data text-xs text-[#25313c]">{currentEnergy}/10</span>
        </label>
        <AIActionButton onClick={copyPrompt}>
          {copied ? (
            <>
              <CheckCheck size={14} className="mr-1" /> Copied
            </>
          ) : (
            "Triage with AI"
          )}
        </AIActionButton>
      </PageDecisionHeader>

      <SegmentedModeTabs value={pageMode} onChange={setPageMode} options={MODE_OPTIONS} />

      {pageMode === "capture" ? (
        <CaptureMode
          draft={draft}
          setDraft={setDraft}
          addTask={addTask}
          smartViews={smartViews}
          {...listHandlers}
        />
      ) : null}

      {pageMode === "plan" ? (
        <PlanMode
          smartViews={smartViews}
          topPriority={topPriority}
          {...listHandlers}
        />
      ) : null}

      {pageMode === "review" ? (
        <ReviewMode
          waiting={waitingTasks}
          driftRisk={smartViews.driftRisk}
          backlog={smartViews.parkingLot}
          recurring={recurringTasks}
          done={doneTasks}
          archived={archivedTasks}
          trashed={trashedTasks}
          {...listHandlers}
        />
      ) : null}
    </div>
  );
}

type ListHandlers = {
  currentEnergy: number;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onChangeStatus: (id: string, status: CanonicalTaskStatus) => void;
  onComplete: (id: string) => void;
  onMoveToday: (id: string) => void;
  onMoveThisWeek: (id: string) => void;
  onSchedule: (id: string) => void;
  onMarkWaiting: (id: string) => void;
  onIgnoreToday: (id: string) => void;
  onArchive: (id: string) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onHardDelete: (task: Task) => void;
};

type DraftState = {
  title: string;
  description: string;
  task_type: TaskType;
  due_date: string;
  estimated_minutes: number;
  energy_required: number;
  resistance_level: number;
  urgency: number;
  importance: number;
  consequence_if_delayed: number;
  trust_impact: number;
  time_efficiency: number;
  priority: "" | Task["priority"];
  consequence_level: "" | Task["consequence_level"];
  fixed_time: string;
  recurring: boolean;
};

/* ----------------------------- Capture mode ----------------------------- */

function CaptureMode({
  draft,
  setDraft,
  addTask,
  smartViews,
  ...handlers
}: ListHandlers & {
  draft: DraftState;
  setDraft: React.Dispatch<React.SetStateAction<DraftState>>;
  addTask: () => void;
  smartViews: ReturnType<typeof buildTaskSmartViews>;
}) {
  const applyTitleParse = (value: string) => {
    const parsed = parseTaskTitleInput(value);
    setDraft((current) => ({
      ...current,
      title: value,
      task_type: parsed.taskType ?? current.task_type,
      due_date: parsed.dueDate ?? current.due_date,
      estimated_minutes: parsed.estimatedMinutes ?? current.estimated_minutes,
      fixed_time: parsed.fixedTime ?? current.fixed_time,
      priority: parsed.priority ?? current.priority,
    }));
  };

  const submitIfShortcut = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      addTask();
    }
  };

  return (
    <div className="space-y-6">
      <div className="card-surface p-4 space-y-3" onKeyDown={submitIfShortcut}>
        <div className="text-sm font-medium text-[#25313c]">Add a task</div>
        <div className="grid gap-2 md:grid-cols-3">
          <input
            data-lifeee-capture-input="true"
            placeholder="Title (e.g. Connex Zoom, Dishes, MCAT block)"
            value={draft.title}
            onChange={(e) => applyTitleParse(e.target.value)}
            className="rounded-md border border-[#b9a98f] bg-[#fffdf8] px-3 py-2 text-sm shadow-inner outline-none transition focus:border-[#6b87ae] focus:ring-2 focus:ring-[#6b87ae]/20 md:col-span-2"
          />
          <select
            value={draft.task_type}
            onChange={(e) => setDraft({ ...draft, task_type: e.target.value as TaskType })}
            className="rounded-md border border-[#ddd4c6] px-3 py-2 text-sm"
          >
            {TASK_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2 text-xs md:grid-cols-3">
          <NumField label="Due date" type="date" value={draft.due_date} onChange={(v) => setDraft({ ...draft, due_date: v as string })} />
          <NumField label="Est. minutes" min={0} value={draft.estimated_minutes} onChange={(v) => setDraft({ ...draft, estimated_minutes: Number(v) })} />
          <label className="flex flex-col text-[10px] uppercase tracking-wider text-[#6f685f]">
            Priority
            <select
              value={draft.priority ?? ""}
              onChange={(e) => setDraft({ ...draft, priority: (e.target.value || null) as Task["priority"] })}
              className="mt-1 rounded-md border border-[#ddd4c6] px-2 py-1 text-sm normal-case tracking-normal"
            >
              <option value="">Unset</option>
              {TASK_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>{priority}</option>
              ))}
            </select>
          </label>
        </div>

        <AdvancedDetails title="Advanced scoring">
          <div className="space-y-3">
            <textarea
              placeholder="Description or planning context"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className="min-h-[70px] w-full rounded-md border border-[#ddd4c6] px-3 py-2 text-sm"
            />
            <div className="grid gap-2 md:grid-cols-6 text-xs">
              <NumField label="Fixed time" type="time" value={draft.fixed_time} onChange={(v) => setDraft({ ...draft, fixed_time: v as string })} />
              <label className="flex flex-col text-[10px] uppercase tracking-wider text-[#6f685f]">
                Cost if delayed
                <select
                  value={draft.consequence_level ?? ""}
                  onChange={(e) => setDraft({ ...draft, consequence_level: (e.target.value || null) as Task["consequence_level"] })}
                  className="mt-1 rounded-md border border-[#ddd4c6] px-2 py-1 text-sm normal-case tracking-normal"
                >
                  <option value="">Unset</option>
                  {CONSEQUENCE_LEVELS.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-[#6f685f]">
                <input
                  type="checkbox"
                  checked={draft.recurring}
                  onChange={(e) => setDraft({ ...draft, recurring: e.target.checked })}
                />
                Recurring
              </label>
            </div>
            <div className="grid gap-2 md:grid-cols-6 text-xs">
              <NumField label="Energy req" min={1} max={10} value={draft.energy_required} onChange={(v) => setDraft({ ...draft, energy_required: Number(v) })} />
              <NumField label="Resistance" min={1} max={10} value={draft.resistance_level} onChange={(v) => setDraft({ ...draft, resistance_level: Number(v) })} />
              <NumField label="Urgency" min={1} max={10} value={draft.urgency} onChange={(v) => setDraft({ ...draft, urgency: Number(v) })} />
              <NumField label="Importance" min={1} max={10} value={draft.importance} onChange={(v) => setDraft({ ...draft, importance: Number(v) })} />
              <NumField label="Cost if delayed" min={1} max={10} value={draft.consequence_if_delayed} onChange={(v) => setDraft({ ...draft, consequence_if_delayed: Number(v) })} />
              <NumField label="Trust impact" min={1} max={10} value={draft.trust_impact} onChange={(v) => setDraft({ ...draft, trust_impact: Number(v) })} />
              <NumField label="Leverage" min={1} max={10} value={draft.time_efficiency} onChange={(v) => setDraft({ ...draft, time_efficiency: Number(v) })} />
            </div>
          </div>
        </AdvancedDetails>

        <button
          onClick={addTask}
          className="ml-auto inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#25313c] px-3 py-2 text-sm text-white hover:bg-[#3a4754] sm:w-auto"
        >
          <Plus size={14} /> Add to Inbox
        </button>
      </div>

      <ModeSection
        title="Life Inbox"
        subtitle="Recently captured, not yet triaged"
        tasks={smartViews.inboxCandidates}
        empty={
          <EmptyStateCard
            missing="Your inbox is clear."
            nextAction="Capture the next thing on your mind above."
            why="Getting tasks out of your head is what keeps the system trustworthy."
          />
        }
        {...handlers}
      />
    </div>
  );
}

/* ------------------------------ Plan mode ------------------------------- */

function PlanMode({
  smartViews,
  topPriority,
  ...handlers
}: ListHandlers & {
  smartViews: ReturnType<typeof buildTaskSmartViews>;
  topPriority: Task[];
}) {
  return (
    <div className="space-y-6">
      <ModeSection
        title="Must Do / Today"
        subtitle="Highest-priority active work"
        tasks={topPriority}
        empty={
          <EmptyStateCard
            missing="Nothing is queued for today."
            nextAction="Move a task to Today from Capture or Review."
            why="A clear Must Do list is what makes the day plannable."
          />
        }
        {...handlers}
      />
      <ModeSection
        title="Should Do"
        subtitle="Committed for today"
        tasks={smartViews.committedToday}
        empty={
          <EmptyStateCard
            missing="No Should-Do tasks committed."
            nextAction="Promote a few tasks into Today's commitment."
            why="Should-Do work fills the day after the must-dos are safe."
          />
        }
        {...handlers}
      />
      <ModeSection
        title="Trust Protectors"
        subtitle="Tasks that protect commitments to others"
        tasks={smartViews.trustProtectors}
        empty={
          <EmptyStateCard
            missing="No trust-protecting tasks right now."
            nextAction="Flag tasks tied to promises with a due date."
            why="These are the tasks that keep relationships intact."
          />
        }
        {...handlers}
      />
      {smartViews.quickWins.length > 0 ? (
        <ModeSection
          title="Quick Wins"
          subtitle="Low effort, good momentum"
          tasks={smartViews.quickWins}
          {...handlers}
        />
      ) : null}
      {smartViews.ignoreToday.length > 0 ? (
        <ModeSection
          title="Hide for Today"
          subtitle="Consciously set aside until tomorrow"
          tasks={smartViews.ignoreToday}
          muted
          {...handlers}
        />
      ) : null}

      <AdvancedOnly>
        <ModeSection
          title="Ready for Planning"
          subtitle="Exportable set for the calendar planner"
          tasks={smartViews.exportablePlanningSet}
          {...handlers}
        />
      </AdvancedOnly>
    </div>
  );
}

/* ----------------------------- Review mode ------------------------------ */

function ReviewMode({
  waiting,
  driftRisk,
  backlog,
  recurring,
  done,
  archived,
  trashed,
  ...handlers
}: ListHandlers & {
  waiting: Task[];
  driftRisk: Task[];
  backlog: Task[];
  recurring: Task[];
  done: Task[];
  archived: Task[];
  trashed: Task[];
}) {
  return (
    <div className="space-y-6">
      <ModeSection
        title="Waiting"
        subtitle="Blocked on someone or something else"
        tasks={waiting}
        empty={
          <EmptyStateCard
            missing="Nothing is waiting on others."
            nextAction="Mark a task Waiting when it's blocked."
            why="Tracking blockers stops them from quietly slipping."
          />
        }
        {...handlers}
      />
      <ModeSection
        title="Needs Attention"
        subtitle="At risk of slipping without action"
        tasks={driftRisk}
        empty={
          <EmptyStateCard
            missing="Nothing is drifting right now."
            nextAction="Keep due dates and estimates current."
            why="Catching drift early is cheaper than a missed commitment."
          />
        }
        {...handlers}
      />
      <ModeSection
        title="Backlog"
        subtitle="Parked, not scheduled"
        tasks={backlog}
        muted
        empty={
          <EmptyStateCard
            missing="The backlog is empty."
            nextAction="Park tasks here when they're not for now."
            why="A backlog keeps maybe-later work out of your daily plan."
          />
        }
        {...handlers}
      />
      <AdvancedOnly>
        <CollapsibleSection title="Recurring" subtitle={`${recurring.length}`}>
          <TaskList tasks={recurring} {...handlers} />
        </CollapsibleSection>
      </AdvancedOnly>
      <CollapsibleSection title="Done" subtitle={`${done.length}`}>
        <TaskList tasks={done} {...handlers} />
      </CollapsibleSection>
      <CollapsibleSection title="Archived" subtitle={`${archived.length}`}>
        <TaskList tasks={archived} {...handlers} />
      </CollapsibleSection>
      <CollapsibleSection title="Trash" subtitle={`${trashed.length}`}>
        <TaskList tasks={trashed} {...handlers} />
      </CollapsibleSection>
    </div>
  );
}

/* --------------------------- Shared section ----------------------------- */

function ModeSection({
  title,
  subtitle,
  tasks,
  empty,
  muted,
  ...handlers
}: ListHandlers & {
  title: string;
  subtitle?: string;
  tasks: Task[];
  empty?: React.ReactNode;
  muted?: boolean;
}) {
  const { isSimple } = useUIMode();
  // In Simple mode, an empty smart view is just noise — render nothing.
  if (isSimple && tasks.length === 0) return null;
  return (
    <section className={muted ? "opacity-80" : ""}>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-[#25313c]">{title}</h2>
        {subtitle ? (
          <span className="text-xs text-[#9b938a]">{subtitle}</span>
        ) : null}
        <span className="text-xs text-[#9b938a]">· {tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        empty ?? (
          <div className="card-surface p-6 text-center text-sm text-[#9b938a]">
            Nothing here yet.
          </div>
        )
      ) : (
        <TaskList tasks={tasks} {...handlers} />
      )}
    </section>
  );
}

function NumField({
  label,
  value,
  onChange,
  type = "number",
  min,
  max,
  step,
}: {
  label: string;
  value: string | number;
  onChange: (v: string | number) => void;
  type?: "number" | "text" | "date" | "time";
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="flex flex-col text-[10px] uppercase tracking-wider text-[#6f685f]">
      {label}
      <input
        type={type}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 rounded-md border border-[#ddd4c6] px-2 py-1 text-sm normal-case tracking-normal"
      />
    </label>
  );
}

function TaskList({
  tasks,
  currentEnergy,
  onUpdate,
  onChangeStatus,
  onComplete,
  onMoveToday,
  onMoveThisWeek,
  onSchedule,
  onMarkWaiting,
  onIgnoreToday,
  onArchive,
  onTrash,
  onRestore,
  onHardDelete,
}: ListHandlers & {
  tasks: Task[];
}) {
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  if (tasks.length === 0) {
    return (
      <div className="card-surface p-6 text-center text-sm text-[#9b938a]">
        No tasks here yet.
      </div>
    );
  }
  const sorted = [...tasks].sort(
    (a, b) => calcTaskPriority(b, currentEnergy) - calcTaskPriority(a, currentEnergy),
  );
  return (
    <>
      <div className="card-surface divide-y divide-[#ece5da]">
        {sorted.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            currentEnergy={currentEnergy}
            onUpdate={onUpdate}
            onChangeStatus={onChangeStatus}
            onComplete={onComplete}
            onEdit={() => setEditingTask(task)}
            onMoveToday={onMoveToday}
            onMoveThisWeek={onMoveThisWeek}
            onSchedule={onSchedule}
            onMarkWaiting={onMarkWaiting}
            onIgnoreToday={onIgnoreToday}
            onArchive={onArchive}
            onTrash={onTrash}
            onRestore={onRestore}
            onHardDelete={onHardDelete}
          />
        ))}
      </div>
      <TaskEditorSheet
        task={editingTask}
        onOpenChange={(open) => {
          if (!open) setEditingTask(null);
        }}
        onSave={(id, patch) => {
          onUpdate(id, patch);
          setEditingTask(null);
        }}
      />
    </>
  );
}

function roleLabel(task: Task): string {
  if (isDoneStatus(task.status)) return "Done";
  if (isArchivedTask(task)) return "Archived";
  if (isTrashedTask(task)) return "Trash";
  switch (task.status) {
    case "inbox":
      return "Inbox";
    case "today":
      return "Today";
    case "this_week":
      return "This Week";
    case "scheduled":
      return "Scheduled";
    case "waiting":
      return "Waiting";
    case "ignored_today":
      return "Hidden for Today";
    case "parking_lot":
      return "Backlog";
    default:
      return task.daily_role ?? "Active";
  }
}

function TaskRow({
  task,
  currentEnergy,
  onUpdate,
  onChangeStatus,
  onComplete,
  onEdit,
  onMoveToday,
  onMoveThisWeek,
  onSchedule,
  onMarkWaiting,
  onIgnoreToday,
  onArchive,
  onTrash,
  onRestore,
  onHardDelete,
}: {
  task: Task;
  currentEnergy: number;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onChangeStatus: (id: string, status: CanonicalTaskStatus) => void;
  onComplete: (id: string) => void;
  onEdit: () => void;
  onMoveToday: (id: string) => void;
  onMoveThisWeek: (id: string) => void;
  onSchedule: (id: string) => void;
  onMarkWaiting: (id: string) => void;
  onIgnoreToday: (id: string) => void;
  onArchive: (id: string) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onHardDelete: (task: Task) => void;
}) {
  const { isAdvanced } = useUIMode();
  const priorityScore = calcTaskPriority(task, currentEnergy);
  const archivedOrTrashed = isArchivedTask(task) || isTrashedTask(task);
  const isDone = isDoneStatus(task.status);

  return (
    <div className="p-3 flex flex-wrap items-center gap-3">
      <button
        onClick={() => onComplete(task.id)}
        className="text-[#9b938a] hover:text-[#6a9a74] disabled:opacity-40"
        title="Mark done"
        disabled={archivedOrTrashed || isDone}
      >
        <CheckCircle2 size={18} />
      </button>
      <div className="flex-1 min-w-[220px]">
        <div className="flex flex-wrap items-center gap-2">
          <AdvancedOnly>
            <span className="font-mono-data rounded border border-[#ddd4c6] bg-white px-1.5 py-0.5 text-[10px] text-[#6f685f]">
              {task.task_code}
            </span>
          </AdvancedOnly>
          <span className="text-sm text-[#25313c]">{task.title}</span>
        </div>
        <div className="mt-1 text-[11px] text-[#9b938a]">
          {task.due_date ? `due ${task.due_date}` : "no due date"} · {formatEstimate(task)} ·{" "}
          {roleLabel(task)}
        </div>
        <AdvancedDetails title="Task details">
          <div className="space-y-1 text-[11px] text-[#6f685f]">
            <div>
              code {task.task_code} · id {task.id}
            </div>
            <div>
              status {task.status} · role {task.daily_role ?? "auto"} · type {task.task_type}
            </div>
            <div>
              priority {task.priority ?? "unset"} · cost if delayed{" "}
              {task.consequence_level ?? "unset"} · energy {task.energy_required ?? "unset"} ·
              resistance {task.resistance_level ?? "unset"}
            </div>
            <div>
              urgency {task.urgency ?? "unset"} · importance {task.importance ?? "unset"} ·
              trust {task.trust_impact ?? "unset"} · leverage{" "}
              {task.time_efficiency ?? "unset"} · score {priorityScore.toFixed(2)}
              {task.fixed_time ? ` · @${task.fixed_time}` : ""}
              {task.recurring ? " · recurring" : ""}
            </div>
            <div className="mt-1 whitespace-pre-wrap rounded-md bg-[#f7f3ec] p-2">
              {formatTaskForPlanningExport(task)}
              {task.description ? `\n${task.description}` : ""}
            </div>
          </div>
        </AdvancedDetails>
      </div>

      {isAdvanced ? (
        <>
          <select
            value={task.status === "completed" ? "done" : task.status}
            onChange={(e) =>
              onChangeStatus(task.id, e.target.value as CanonicalTaskStatus)
            }
            className="rounded-md border border-[#ddd4c6] px-2 py-1 text-xs"
          >
            <option value="inbox">Inbox</option>
            <option value="today">Today</option>
            <option value="this_week">This Week</option>
            <option value="scheduled">Scheduled</option>
            <option value="waiting">Waiting</option>
            <option value="done">Done</option>
            <option value="ignored_today">Hidden for Today</option>
            <option value="parking_lot">Backlog</option>
            <option value="archived">Archived</option>
            <option value="trashed">Trash</option>
          </select>
          <select
            value={task.daily_role ?? ""}
            onChange={(e) =>
              onUpdate(task.id, {
                daily_role: (e.target.value || null) as DailyRole | null,
              })
            }
            className="rounded-md border border-[#ddd4c6] px-2 py-1 text-xs"
          >
            <option value="">Auto role</option>
            {DAILY_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </>
      ) : null}

      <TaskActionMenu
        task={task}
        onEdit={onEdit}
        onMoveToday={() => onMoveToday(task.id)}
        onMoveThisWeek={() => onMoveThisWeek(task.id)}
        onSchedule={() => onSchedule(task.id)}
        onMarkWaiting={() => onMarkWaiting(task.id)}
        onIgnoreToday={() => onIgnoreToday(task.id)}
        onComplete={() => onComplete(task.id)}
        onArchive={() => onArchive(task.id)}
        onTrash={() => onTrash(task.id)}
        onRestore={() => onRestore(task.id)}
        onHardDelete={() => {
          if (
            window.confirm(
              `Permanently delete ${task.task_code}? This cannot be undone.`,
            )
          ) {
            onHardDelete(task);
          }
        }}
      />
    </div>
  );
}

function formatEstimate(task: Task) {
  return task.estimated_minutes == null ? "Estimate missing" : `${task.estimated_minutes}m`;
}

function TaskActionMenu({
  task,
  onEdit,
  onMoveToday,
  onMoveThisWeek,
  onSchedule,
  onMarkWaiting,
  onIgnoreToday,
  onComplete,
  onArchive,
  onTrash,
  onRestore,
  onHardDelete,
}: {
  task: Task;
  onEdit: () => void;
  onMoveToday: () => void;
  onMoveThisWeek: () => void;
  onSchedule: () => void;
  onMarkWaiting: () => void;
  onIgnoreToday: () => void;
  onComplete: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onHardDelete: () => void;
}) {
  const archivedOrTrashed = isArchivedTask(task) || isTrashedTask(task);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-md border border-[#ddd4c6] bg-white p-1.5 text-[#6f685f] hover:bg-[#f7f3ec]"
          title="More"
        >
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {archivedOrTrashed ? (
          <>
            <DropdownMenuItem onClick={onRestore}>
              <RotateCcw size={14} /> Restore
            </DropdownMenuItem>
            {isTrashedTask(task) ? (
              <DropdownMenuItem variant="destructive" onClick={onHardDelete}>
                <Trash2 size={14} /> Hard Delete
              </DropdownMenuItem>
            ) : null}
          </>
        ) : (
          <>
            <DropdownMenuItem onClick={onEdit}>
              <Edit3 size={14} /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onMoveToday}>
              <CalendarClock size={14} /> Move to Today
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMoveThisWeek}>
              <CalendarDays size={14} /> Move to This Week
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSchedule}>
              <CalendarPlus size={14} /> Schedule
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMarkWaiting}>
              <Hourglass size={14} /> Mark Waiting
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onIgnoreToday}>
              <ParkingCircle size={14} /> Hide for Today
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onComplete}>
              <CheckCircle2 size={14} /> Mark Done
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onArchive}>
              <Archive size={14} /> Archive
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onTrash}>
              <Trash2 size={14} /> Trash
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TaskEditorSheet({
  task,
  onOpenChange,
  onSave,
}: {
  task: Task | null;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, patch: Partial<Task>) => void;
}) {
  const [draft, setDraft] = useState<Task | null>(task);

  useEffect(() => {
    setDraft(task);
  }, [task]);

  if (!task || !draft) {
    return <Sheet open={false} onOpenChange={onOpenChange} />;
  }

  const updateDraft = (patch: Partial<Task>) => setDraft((current) => current ? { ...current, ...patch } : current);

  return (
    <Sheet open={Boolean(task)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Edit task</SheetTitle>
          <SheetDescription>
            Edit the canonical task metadata used by smart views and planning exports.
          </SheetDescription>
          <div className="font-mono-data text-xs text-muted-foreground">{task.task_code}</div>
        </SheetHeader>
        <div className="grid gap-3 px-4 pb-4">
          <label className="text-xs font-medium text-[#6f685f]">
            Title
            <input
              value={draft.title}
              onChange={(e) => updateDraft({ title: e.target.value })}
              className="mt-1 w-full rounded-md border border-[#ddd4c6] px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-[#6f685f]">
            Description
            <textarea
              value={draft.description}
              onChange={(e) => updateDraft({ description: e.target.value })}
              className="mt-1 min-h-[80px] w-full rounded-md border border-[#ddd4c6] px-3 py-2 text-sm"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Task type" value={draft.task_type} values={TASK_TYPES} onChange={(value) => updateDraft({ task_type: value as TaskType })} />
            <SelectField label="Status" value={draft.status === "completed" ? "done" : draft.status} values={["inbox", "today", "this_week", "scheduled", "waiting", "done", "ignored_today", "parking_lot", "archived", "trashed"]} onChange={(value) => updateDraft({ status: value as TaskStatus })} />
            <SelectField label="Priority" value={draft.priority ?? ""} values={["", ...TASK_PRIORITIES]} onChange={(value) => updateDraft({ priority: (value || null) as Task["priority"] })} />
            <SelectField label="Cost if delayed" value={draft.consequence_level ?? ""} values={["", ...CONSEQUENCE_LEVELS]} onChange={(value) => updateDraft({ consequence_level: (value || null) as Task["consequence_level"] })} />
            <SelectField label="Daily role" value={draft.daily_role ?? ""} values={["", ...DAILY_ROLES]} onChange={(value) => updateDraft({ daily_role: (value || null) as DailyRole | null })} />
            <label className="text-xs font-medium text-[#6f685f]">
              Due date
              <input
                type="date"
                value={draft.due_date ?? ""}
                onChange={(e) => updateDraft({ due_date: e.target.value || null })}
                className="mt-1 w-full rounded-md border border-[#ddd4c6] px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-[#6f685f]">
              Fixed time
              <input
                type="time"
                value={draft.fixed_time ?? ""}
                onChange={(e) => updateDraft({ fixed_time: e.target.value || null })}
                className="mt-1 w-full rounded-md border border-[#ddd4c6] px-3 py-2 text-sm"
              />
            </label>
            <NumberEdit label="Estimate minutes" value={draft.estimated_minutes} onChange={(value) => updateDraft({ estimated_minutes: value })} />
            <NumberEdit label="Energy required" value={draft.energy_required} onChange={(value) => updateDraft({ energy_required: value })} />
            <NumberEdit label="Resistance" value={draft.resistance_level} onChange={(value) => updateDraft({ resistance_level: value })} />
          </div>
          <label className="text-xs font-medium text-[#6f685f]">
            Notes
            <textarea
              value={draft.notes}
              onChange={(e) => updateDraft({ notes: e.target.value })}
              className="mt-1 min-h-[100px] w-full rounded-md border border-[#ddd4c6] px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => onSave(task.id, draft)}
            className="inline-flex items-center justify-center rounded-md bg-[#25313c] px-3 py-2 text-sm text-white hover:bg-[#3a4754]"
          >
            Save changes
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SelectField({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-medium text-[#6f685f]">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-[#ddd4c6] px-3 py-2 text-sm"
      >
        {values.map((item) => (
          <option key={item || "unset"} value={item}>
            {item || "Unset"}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberEdit({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="text-xs font-medium text-[#6f685f]">
      {label}
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="mt-1 w-full rounded-md border border-[#ddd4c6] px-3 py-2 text-sm"
      />
    </label>
  );
}
