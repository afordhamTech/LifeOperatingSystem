import { useEffect, useMemo, useRef, useState } from "react";
import {
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
} from "lucide-react";
import {
  TASK_TYPES,
  DAILY_ROLES,
  type Task,
  type TaskStatus,
  type TaskType,
  type DailyRole,
  loadTasks,
  saveTasks,
  makeTask,
  buildDayPlan,
  calcTaskPriority,
  buildTriagePrompt,
} from "@/lib/task-system";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import {
  deleteUniversalTask,
  fetchUniversalTasks,
  getSyncLabel,
  getSyncTone,
  type LifeeeSyncStatus,
  upsertUniversalTask,
} from "@/lib/lifeee-persistence";

const TABS: { key: TaskStatus | "all"; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "inbox", label: "Life Inbox", icon: Inbox },
  { key: "today", label: "Today", icon: CalendarClock },
  { key: "this_week", label: "This Week", icon: CalendarDays },
  { key: "all", label: "Recurring", icon: Repeat },
  { key: "waiting", label: "Waiting", icon: Hourglass },
  { key: "completed", label: "Completed", icon: CheckCircle2 },
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
  const [draft, setDraft] = useState({
    title: "",
    task_type: "Personal" as TaskType,
    due_date: "",
    estimated_minutes: 15,
    energy_required: 5,
    urgency: 5,
    importance: 5,
    consequence_if_delayed: 5,
    trust_impact: 5,
    time_efficiency: 5,
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

  const plan = useMemo(() => buildDayPlan(tasks, currentEnergy), [tasks, currentEnergy]);

  const filtered = useMemo(() => {
    if (activeTab === "all") return tasks.filter((t) => t.recurring);
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
      task_type: draft.task_type,
      due_date: draft.due_date || null,
      estimated_minutes: Number(draft.estimated_minutes) || 15,
      energy_required: Number(draft.energy_required) || 5,
      urgency: Number(draft.urgency) || 5,
      importance: Number(draft.importance) || 5,
      consequence_if_delayed: Number(draft.consequence_if_delayed) || 5,
      trust_impact: Number(draft.trust_impact) || 5,
      time_efficiency: Number(draft.time_efficiency) || 5,
      fixed_time: draft.fixed_time || null,
      recurring: draft.recurring,
      status: "inbox",
    });
    setTasks((prev) => [task, ...prev]);
    setDraft((d) => ({ ...d, title: "", fixed_time: "" }));
    void persistTask(task);
  };

  const updateTask = (id: string, patch: Partial<Task>) => {
    const current = tasks.find((task) => task.id === id);
    if (!current) return;
    const nextTask = { ...current, ...patch, updated_at: new Date().toISOString() };
    setTasks((prev) => prev.map((t) => (t.id === id ? nextTask : t)));
    void persistTask(nextTask);
  };

  const removeTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (!userId || !remoteLoadedRef.current) {
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
      return;
    }

    setSyncStatus("saving");
    setSyncError(null);
    void deleteUniversalTask(userId, id)
      .then(() => setSyncStatus("saved"))
      .catch((error: unknown) => {
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Unable to delete task.");
      });
  };

  const completeTask = (id: string) =>
    updateTask(id, { status: "completed", daily_role: null });

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

  const inbox = tasks.filter((t) => t.status === "inbox");
  const topPriority = [...tasks]
    .filter((t) => t.status !== "completed")
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
            Current energy
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

      <PlanOverview plan={plan} topPriority={topPriority} inboxCount={inbox.length} />

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
        <div className="grid gap-2 md:grid-cols-4 text-xs">
          <NumField label="Due (YYYY-MM-DD)" type="text" value={draft.due_date} onChange={(v) => setDraft({ ...draft, due_date: v as string })} />
          <NumField label="Fixed time (e.g. 14:00)" type="text" value={draft.fixed_time} onChange={(v) => setDraft({ ...draft, fixed_time: v as string })} />
          <NumField label="Est. minutes" value={draft.estimated_minutes} onChange={(v) => setDraft({ ...draft, estimated_minutes: Number(v) })} />
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
        onComplete={completeTask}
        onRemove={removeTask}
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
  plan,
  topPriority,
  inboxCount,
}: {
  plan: ReturnType<typeof buildDayPlan>;
  topPriority: Task[];
  inboxCount: number;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Panel title={`Life Inbox (${inboxCount})`} tasks={[]} hint="Capture first, sort later." />
      <Panel title="Today's Anchors" tasks={plan.anchors} />
      <Panel title="Top priority" tasks={topPriority} />
      <Panel title="Quick wins" tasks={plan.quickWins} />
      <Panel title="Maintenance" tasks={plan.maintenance} />
      <Panel title="Waiting" tasks={plan.waiting} />
      <Panel title="Ignore today" tasks={plan.ignoreToday} muted />
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
              <span className="text-[10px] text-[#9b938a]">{t.task_type}</span>
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
  onComplete,
  onRemove,
}: {
  tasks: Task[];
  currentEnergy: number;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onComplete: (id: string) => void;
  onRemove: (id: string) => void;
}) {
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
    <div className="card-surface divide-y divide-[#ece5da]">
      {sorted.map((t) => {
        const priority = calcTaskPriority(t, currentEnergy);
        return (
          <div key={t.id} className="p-3 flex flex-wrap items-center gap-3">
            <button
              onClick={() => onComplete(t.id)}
              className="text-[#9b938a] hover:text-[#6a9a74]"
              title="Complete"
            >
              <CheckCircle2 size={18} />
            </button>
            <div className="flex-1 min-w-[180px]">
              <div className="text-sm text-[#25313c]">{t.title}</div>
              <div className="text-[11px] text-[#9b938a]">
                {t.task_type} · {t.estimated_minutes}m · priority {priority.toFixed(2)}
                {t.due_date ? ` · due ${t.due_date}` : ""}
                {t.fixed_time ? ` · @${t.fixed_time}` : ""}
                {t.recurring ? " · recurring" : ""}
              </div>
            </div>
            <select
              value={t.status}
              onChange={(e) => onUpdate(t.id, { status: e.target.value as TaskStatus })}
              className="rounded-md border border-[#ddd4c6] px-2 py-1 text-xs"
            >
              <option value="inbox">Inbox</option>
              <option value="today">Today</option>
              <option value="this_week">This Week</option>
              <option value="waiting">Waiting</option>
              <option value="completed">Completed</option>
            </select>
            <select
              value={t.daily_role ?? ""}
              onChange={(e) =>
                onUpdate(t.id, {
                  daily_role: (e.target.value || null) as DailyRole | null,
                })
              }
              className="rounded-md border border-[#ddd4c6] px-2 py-1 text-xs"
            >
              <option value="">Auto role</option>
              {DAILY_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              onClick={() => onRemove(t.id)}
              className="text-[#9b938a] hover:text-[#c97a73]"
              title="Delete"
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
