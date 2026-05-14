import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Inbox,
  CalendarClock,
  CalendarDays,
  Repeat,
  Hourglass,
  CheckCircle2,
  Plus,
  Trash2,
  Copy,
  CheckCheck,
  MoreHorizontal,
  Edit3,
  RotateCcw,
  CalendarPlus,
  ParkingCircle,
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

const TABS: { key: TaskStatus | "all"; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "inbox", label: "Life Inbox", icon: Inbox },
  { key: "today", label: "Today", icon: CalendarClock },
  { key: "this_week", label: "This Week", icon: CalendarDays },
  { key: "scheduled", label: "Scheduled", icon: CalendarPlus },
  { key: "all", label: "Recurring", icon: Repeat },
  { key: "waiting", label: "Waiting", icon: Hourglass },
  { key: "ignored_today", label: "Ignored Today", icon: ParkingCircle },
  { key: "parking_lot", label: "Parking Lot", icon: ParkingCircle },
  { key: "done", label: "Done", icon: CheckCircle2 },
  { key: "archived", label: "Archived", icon: Archive },
  { key: "trashed", label: "Trash", icon: Trash2 },
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
  const [activeTab, setActiveTab] = useState<TaskStatus | "all">("inbox");
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

  const filtered = useMemo(() => {
    if (activeTab === "all") return tasks.filter((t) => t.recurring);
    if (activeTab === "done") return tasks.filter((t) => isDoneStatus(t.status));
    if (activeTab === "archived") return tasks.filter((t) => isArchivedTask(t));
    if (activeTab === "trashed") return tasks.filter((t) => isTrashedTask(t));
    return tasks.filter((t) => t.status === activeTab);
  }, [tasks, activeTab]);

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
    if (!draft.title.trim()) return;
    const task = makeTask({
      title: draft.title.trim(),
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

  const topPriority = [...tasks]
    .filter((t) => isActiveTask(t) && t.status !== "parking_lot")
    .sort((a, b) => calcTaskPriority(b, currentEnergy) - calcTaskPriority(a, currentEnergy))
    .slice(0, 5);
  const visibleSyncStatus: LifeeeSyncStatus = sessionLoading
    ? "loading"
    : !hasSupabaseConfig
      ? "local"
      : !userId
        ? "waiting"
        : syncStatus;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="border-b border-[#ddd4c6] pb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#25313c]">Task Command</h1>
          <p className="text-sm text-[#6f685f] mt-1">
            One inbox for everything — school, Connex, work, family, health, faith, money, errands.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${getSyncTone(visibleSyncStatus)}`}
            title={visibleSyncStatus === "error" ? syncError ?? undefined : undefined}
          >
            {getSyncLabel(visibleSyncStatus)}
          </span>
          <label className="text-xs text-[#6f685f] flex items-center gap-2">
            Current energy <span className="text-[10px] uppercase tracking-wider">(Local draft only)</span>
            <input
              type="number"
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
              className="w-16 rounded-md border border-[#ddd4c6] px-2 py-1 text-sm"
            />
          </label>
          <button
            onClick={copyPrompt}
            className="inline-flex items-center gap-2 rounded-lg border border-[#ddd4c6] bg-white px-3 py-2 text-sm hover:bg-[#f7f3ec]"
          >
            {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy Task Triage Prompt"}
          </button>
        </div>
      </div>

      <PlanOverview smartViews={smartViews} topPriority={topPriority} />

      <div className="card-surface p-4 space-y-3">
        <div className="text-sm font-medium text-[#25313c]">Add a task</div>
        <div className="grid gap-2 md:grid-cols-3">
          <input
            placeholder="Title (e.g. Connex Zoom, Dishes, MCAT block)"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className="rounded-md border border-[#ddd4c6] px-3 py-2 text-sm md:col-span-2"
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
        <textarea
          placeholder="Description or planning context"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          className="min-h-[70px] rounded-md border border-[#ddd4c6] px-3 py-2 text-sm"
        />
        <div className="grid gap-2 md:grid-cols-6 text-xs">
          <NumField label="Due (YYYY-MM-DD)" type="text" value={draft.due_date} onChange={(v) => setDraft({ ...draft, due_date: v as string })} />
          <NumField label="Fixed time (e.g. 14:00)" type="text" value={draft.fixed_time} onChange={(v) => setDraft({ ...draft, fixed_time: v as string })} />
          <NumField label="Est. minutes" value={draft.estimated_minutes} onChange={(v) => setDraft({ ...draft, estimated_minutes: Number(v) })} />
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
          <label className="flex flex-col text-[10px] uppercase tracking-wider text-[#6f685f]">
            Consequence
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
          <NumField label="Energy req" value={draft.energy_required} onChange={(v) => setDraft({ ...draft, energy_required: Number(v) })} />
          <NumField label="Resistance" value={draft.resistance_level} onChange={(v) => setDraft({ ...draft, resistance_level: Number(v) })} />
          <NumField label="Urgency" value={draft.urgency} onChange={(v) => setDraft({ ...draft, urgency: Number(v) })} />
          <NumField label="Importance" value={draft.importance} onChange={(v) => setDraft({ ...draft, importance: Number(v) })} />
          <NumField label="Consequence" value={draft.consequence_if_delayed} onChange={(v) => setDraft({ ...draft, consequence_if_delayed: Number(v) })} />
          <NumField label="Trust impact" value={draft.trust_impact} onChange={(v) => setDraft({ ...draft, trust_impact: Number(v) })} />
          <NumField label="Time eff." value={draft.time_efficiency} onChange={(v) => setDraft({ ...draft, time_efficiency: Number(v) })} />
        </div>
        <button
          onClick={addTask}
          className="inline-flex items-center gap-2 rounded-lg bg-[#25313c] px-3 py-2 text-sm text-white hover:bg-[#3a4754]"
        >
          <Plus size={14} /> Add to Inbox
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                active
                  ? "border-[#25313c] bg-[#25313c] text-white"
                  : "border-[#ddd4c6] bg-white text-[#6f685f] hover:bg-[#f7f3ec]"
              }`}
            >
              <Icon size={12} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <TaskList
        tasks={filtered}
        currentEnergy={currentEnergy}
        onUpdate={updateTask}
        onChangeStatus={(id, status) => applyTaskMutation(id, (task) => changeTaskStatus(task, status))}
        onComplete={completeTask}
        onMoveToday={(id) => applyTaskMutation(id, moveTaskToToday)}
        onMoveThisWeek={(id) => applyTaskMutation(id, moveTaskToThisWeek)}
        onSchedule={(id) => applyTaskMutation(id, (task) => scheduleTask(task, { dueDate: task.due_date ?? today }))}
        onMarkWaiting={(id) => applyTaskMutation(id, (task) => changeTaskStatus(task, "waiting"))}
        onIgnoreToday={(id) => applyTaskMutation(id, (task) => ignoreTaskToday(task, today))}
        onArchive={(id) => applyTaskMutation(id, archiveTask)}
        onTrash={(id) => applyTaskMutation(id, trashTask)}
        onRestore={(id) => applyTaskMutation(id, restoreTask)}
        onHardDelete={hardRemoveTask}
      />
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  type = "number",
}: {
  label: string;
  value: string | number;
  onChange: (v: string | number) => void;
  type?: "number" | "text";
}) {
  return (
    <label className="flex flex-col text-[10px] uppercase tracking-wider text-[#6f685f]">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 rounded-md border border-[#ddd4c6] px-2 py-1 text-sm normal-case tracking-normal"
      />
    </label>
  );
}

function PlanOverview({
  smartViews,
  topPriority,
}: {
  smartViews: ReturnType<typeof buildTaskSmartViews>;
  topPriority: Task[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Panel title="Trust Protectors" tasks={smartViews.trustProtectors} />
      <Panel title="Inbox Candidates" tasks={smartViews.inboxCandidates} />
      <Panel title="Committed Today" tasks={smartViews.committedToday} />
      <Panel title="Ignore Today" tasks={smartViews.ignoreToday} muted />
      <Panel title="Parking Lot" tasks={smartViews.parkingLot} muted />
      <Panel title="Drift Risk" tasks={smartViews.driftRisk} />
      <Panel title="Quick Wins" tasks={smartViews.quickWins} />
      <Panel title="Exportable Planning Set" tasks={smartViews.exportablePlanningSet} />
      <Panel title="Top priority" tasks={topPriority} />
    </div>
  );
}

function Panel({
  title,
  tasks,
  hint,
  muted,
}: {
  title: string;
  tasks: Task[];
  hint?: string;
  muted?: boolean;
}) {
  return (
    <div className={`card-surface p-4 ${muted ? "opacity-70" : ""}`}>
      <div className="text-xs uppercase tracking-wider text-[#6f685f] mb-2">{title}</div>
      {tasks.length === 0 ? (
        <div className="text-sm text-[#9b938a]">{hint ?? "Nothing here."}</div>
      ) : (
        <ul className="space-y-1.5 text-sm text-[#25313c]">
          {tasks.slice(0, 6).map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{t.title}</span>
              <span className="text-[10px] text-[#9b938a]">{t.task_code}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
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
}: {
  tasks: Task[];
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
        {sorted.map((task) => {
          const priorityScore = calcTaskPriority(task, currentEnergy);
          const archivedOrTrashed = isArchivedTask(task) || isTrashedTask(task);
          return (
            <div key={task.id} className="p-3 flex flex-wrap items-center gap-3">
              <button
                onClick={() => onComplete(task.id)}
                className="text-[#9b938a] hover:text-[#6a9a74] disabled:opacity-40"
                title="Mark done"
                disabled={archivedOrTrashed || isDoneStatus(task.status)}
              >
                <CheckCircle2 size={18} />
              </button>
              <div className="flex-1 min-w-[220px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono-data rounded border border-[#ddd4c6] bg-white px-1.5 py-0.5 text-[10px] text-[#6f685f]">
                    {task.task_code}
                  </span>
                  <span className="text-sm text-[#25313c]">{task.title}</span>
                </div>
                <div className="mt-1 text-[11px] text-[#9b938a]">
                  {task.task_type} · {formatEstimate(task)} · priority {task.priority ?? "unset"} ·
                  consequence {task.consequence_level ?? "unset"} · energy {task.energy_required ?? "unset"} ·
                  status {task.status} · role {task.daily_role ?? "auto"} · score {priorityScore.toFixed(2)}
                  {task.due_date ? ` · due ${task.due_date}` : ""}
                  {task.fixed_time ? ` · @${task.fixed_time}` : ""}
                  {task.recurring ? " · recurring" : ""}
                </div>
                <details className="mt-1 text-[11px] text-[#6f685f]">
                  <summary className="cursor-pointer select-none">Details</summary>
                  <div className="mt-1 whitespace-pre-wrap rounded-md bg-[#f7f3ec] p-2">
                    {formatTaskForPlanningExport(task)}
                    {task.description ? `\n${task.description}` : ""}
                  </div>
                </details>
              </div>
              <select
                value={task.status === "completed" ? "done" : task.status}
                onChange={(e) => onChangeStatus(task.id, e.target.value as CanonicalTaskStatus)}
                className="rounded-md border border-[#ddd4c6] px-2 py-1 text-xs"
              >
                <option value="inbox">Inbox</option>
                <option value="today">Today</option>
                <option value="this_week">This Week</option>
                <option value="scheduled">Scheduled</option>
                <option value="waiting">Waiting</option>
                <option value="done">Done</option>
                <option value="ignored_today">Ignored Today</option>
                <option value="parking_lot">Parking Lot</option>
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
              <TaskActionMenu
                task={task}
                onEdit={() => setEditingTask(task)}
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
                  if (window.confirm(`Permanently delete ${task.task_code}? This cannot be undone.`)) {
                    onHardDelete(task);
                  }
                }}
              />
            </div>
          );
        })}
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
          title="Task actions"
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
              <ParkingCircle size={14} /> Ignore Today
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
            <SelectField label="Consequence" value={draft.consequence_level ?? ""} values={["", ...CONSEQUENCE_LEVELS]} onChange={(value) => updateDraft({ consequence_level: (value || null) as Task["consequence_level"] })} />
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
