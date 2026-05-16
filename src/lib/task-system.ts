// Lifeee Task Command - universal task model.
// Supabase is the source of truth when signed in. localStorage remains a
// logged-out draft/cache so Task Command and Daily OS stay usable offline.

export const TASK_TYPES = [
  "Academic",
  "Connex / Project",
  "Work",
  "Family",
  "Household",
  "Health",
  "Workout",
  "Nutrition",
  "MCAT",
  "Money",
  "Faith",
  "Relationship",
  "Career",
  "Admin",
  "Personal",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const DAILY_ROLES = [
  "Anchor",
  "Must Do",
  "Should Do",
  "Maintenance",
  "Quick Win",
  "Waiting",
  "Ignore Today",
] as const;
export type DailyRole = (typeof DAILY_ROLES)[number];

export const TASK_STATUSES = [
  "inbox",
  "today",
  "this_week",
  "scheduled",
  "waiting",
  "done",
  "ignored_today",
  "parking_lot",
  "archived",
  "trashed",
] as const;
export type CanonicalTaskStatus = (typeof TASK_STATUSES)[number];
export type TaskStatus = CanonicalTaskStatus | "completed";

export const TASK_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const CONSEQUENCE_LEVELS = ["low", "medium", "high", "critical"] as const;
export type ConsequenceLevel = (typeof CONSEQUENCE_LEVELS)[number];

export type Task = {
  id: string;
  task_code: string;
  title: string;
  description: string;
  task_type: TaskType;
  due_date: string | null;
  fixed_time: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  estimated_minutes: number | null;
  energy_required: number | null; // 1-10
  resistance_level: number | null; // 1-10
  urgency: number; // 1-10, legacy priority signal
  importance: number; // 1-10, legacy priority signal
  consequence_if_delayed: number; // 1-10, legacy priority signal
  trust_impact: number; // 1-10
  time_efficiency: number; // 1-10
  priority: TaskPriority | null;
  consequence_level: ConsequenceLevel | null;
  priority_score?: number | null;
  status: TaskStatus;
  daily_role: DailyRole | null;
  recurring: boolean;
  notes: string;
  source: string | null;
  template_key: string | null;
  template_day_index: number | null;
  template_week_index: number | null;
  template_phase: string | null;
  generated_from: Record<string, unknown> | null;
  previous_status: TaskStatus | null;
  ignored_until: string | null;
  ignored_count: number;
  carry_forward_count: number;
  rescheduled_count: number;
  parent_task_id: string | null;
  review_date: string | null;
  completed_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  linked_anchor_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskSmartViews = {
  trustProtectors: Task[];
  inboxCandidates: Task[];
  committedToday: Task[];
  ignoreToday: Task[];
  parkingLot: Task[];
  driftRisk: Task[];
  quickWins: Task[];
  exportablePlanningSet: Task[];
};

export type TaskSmartViewOptions = {
  today?: string;
  currentEnergy?: number;
  includeParkingLot?: boolean;
  includeIgnoredToday?: boolean;
};

const STORAGE_KEY = "lifeee.tasks.v1";
const TASK_CODE_COUNTER_KEY = "lifeee.task_code_counters.v1";
let memoryTaskCodeCounters: Record<string, number> = {};

function nowIso() {
  return new Date().toISOString();
}

function toDateKey(date = new Date()) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function toDashedDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function datePart(value: string | null | undefined) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function createLifeeeTaskId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `t_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function readTaskCodeCounters() {
  if (typeof window === "undefined") return memoryTaskCodeCounters;
  try {
    const raw = window.localStorage.getItem(TASK_CODE_COUNTER_KEY);
    if (!raw) return memoryTaskCodeCounters;
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, number>)
      : memoryTaskCodeCounters;
  } catch {
    return memoryTaskCodeCounters;
  }
}

function writeTaskCodeCounters(counters: Record<string, number>) {
  memoryTaskCodeCounters = counters;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TASK_CODE_COUNTER_KEY, JSON.stringify(counters));
  } catch {
    // Local cache writes should never block task creation.
  }
}

export function createTaskCode(date = new Date()) {
  const key = toDateKey(date);
  const counters = readTaskCodeCounters();
  const next = (Number(counters[key]) || 0) + 1;
  writeTaskCodeCounters({ ...counters, [key]: next });
  return `TASK-${key}-${String(next).padStart(3, "0")}`;
}

function fallbackTaskCode(input: { id?: string; created_at?: string | null }, index = 0) {
  const created = input.created_at ? new Date(input.created_at) : new Date();
  const dateKey = Number.isNaN(created.getTime()) ? toDateKey() : toDateKey(created);
  const suffix =
    input.id && input.id.length > 0
      ? input.id.replace(/[^a-zA-Z0-9]/g, "").slice(-3).toUpperCase().padStart(3, "0")
      : String(index + 1).padStart(3, "0");
  return `TASK-${dateKey}-${suffix}`;
}

function readAll(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((item, index) => normalizeTask(item, index))
      : [];
  } catch {
    return [];
  }
}

function writeAll(tasks: Task[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(dedupeTasks(tasks).map((task, index) => normalizeTask(task, index))),
  );
}

function dedupeTasks(tasks: Task[]) {
  const seen = new Set<string>();
  const unique: Task[] = [];
  for (const task of tasks) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    unique.push(task);
  }
  return unique;
}

function normalizeNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeTaskStatus(value: unknown): CanonicalTaskStatus {
  if (value === "completed") return "done";
  if (typeof value === "string" && TASK_STATUSES.includes(value as CanonicalTaskStatus)) {
    return value as CanonicalTaskStatus;
  }
  return "inbox";
}

function normalizePriority(value: unknown): TaskPriority | null {
  return typeof value === "string" && TASK_PRIORITIES.includes(value as TaskPriority)
    ? (value as TaskPriority)
    : null;
}

function normalizeConsequence(value: unknown): ConsequenceLevel | null {
  return typeof value === "string" && CONSEQUENCE_LEVELS.includes(value as ConsequenceLevel)
    ? (value as ConsequenceLevel)
    : null;
}

export function normalizeTask(raw: Partial<Task>, index = 0): Task {
  const now = nowIso();
  const status = normalizeTaskStatus(raw.status);
  const createdAt = raw.created_at ?? now;
  const task: Task = {
    id: raw.id ?? createLifeeeTaskId(),
    task_code: raw.task_code?.trim() || fallbackTaskCode(raw, index),
    title: raw.title?.trim() || "Untitled task",
    description: raw.description ?? "",
    task_type: TASK_TYPES.includes(raw.task_type as TaskType)
      ? (raw.task_type as TaskType)
      : "Personal",
    due_date: raw.due_date ?? null,
    fixed_time: raw.fixed_time ?? null,
    scheduled_start: raw.scheduled_start ?? null,
    scheduled_end: raw.scheduled_end ?? null,
    estimated_minutes: normalizeNullableNumber(raw.estimated_minutes),
    energy_required: normalizeNullableNumber(raw.energy_required),
    resistance_level: normalizeNullableNumber(raw.resistance_level),
    urgency: normalizeNumber(raw.urgency, 5),
    importance: normalizeNumber(raw.importance, 5),
    consequence_if_delayed: normalizeNumber(raw.consequence_if_delayed, 5),
    trust_impact: normalizeNumber(raw.trust_impact, 5),
    time_efficiency: normalizeNumber(raw.time_efficiency, 5),
    priority: normalizePriority(raw.priority),
    consequence_level: normalizeConsequence(raw.consequence_level),
    priority_score: normalizeNullableNumber(raw.priority_score),
    status,
    daily_role: DAILY_ROLES.includes(raw.daily_role as DailyRole)
      ? (raw.daily_role as DailyRole)
      : null,
    recurring: raw.recurring ?? false,
    notes: raw.notes ?? "",
    source: raw.source ?? "manual",
    template_key: raw.template_key ?? null,
    template_day_index: normalizeNullableNumber(raw.template_day_index),
    template_week_index: normalizeNullableNumber(raw.template_week_index),
    template_phase: raw.template_phase ?? null,
    generated_from: raw.generated_from ?? null,
    previous_status: raw.previous_status ? normalizeTaskStatus(raw.previous_status) : null,
    ignored_until: raw.ignored_until ?? null,
    ignored_count: normalizeNumber(raw.ignored_count, 0),
    carry_forward_count: normalizeNumber(raw.carry_forward_count, 0),
    rescheduled_count: normalizeNumber(raw.rescheduled_count, 0),
    parent_task_id: raw.parent_task_id ?? null,
    review_date: raw.review_date ?? null,
    completed_at: raw.completed_at ?? null,
    archived_at: raw.archived_at ?? null,
    deleted_at: raw.deleted_at ?? null,
    linked_anchor_id: raw.linked_anchor_id ?? null,
    created_at: createdAt,
    updated_at: raw.updated_at ?? now,
  };

  if (
    task.daily_role === "Ignore Today" &&
    task.status !== "ignored_today" &&
    task.status !== "parking_lot" &&
    task.status !== "archived" &&
    task.status !== "trashed" &&
    !isDoneStatus(task.status)
  ) {
    return {
      ...task,
      status: "ignored_today",
      previous_status: task.previous_status ?? status,
      ignored_until: task.ignored_until ?? toDashedDateKey(),
    };
  }

  return task;
}

export function loadTasks(): Task[] {
  const tasks = readAll();
  if (typeof window !== "undefined" && tasks.length > 0) {
    writeAll(tasks);
  }
  return tasks;
}

export function saveTasks(tasks: Task[]) {
  writeAll(tasks);
}

export function createTask(partial: Partial<Task> & { title: string }): Task {
  const now = nowIso();
  return normalizeTask({
    ...partial,
    id: partial.id ?? createLifeeeTaskId(),
    task_code: partial.task_code ?? createTaskCode(),
    title: partial.title,
    description: partial.description ?? "",
    task_type: partial.task_type ?? "Personal",
    due_date: partial.due_date ?? null,
    fixed_time: partial.fixed_time ?? null,
    scheduled_start: partial.scheduled_start ?? null,
    scheduled_end: partial.scheduled_end ?? null,
    estimated_minutes: partial.estimated_minutes ?? null,
    energy_required: partial.energy_required ?? null,
    resistance_level: partial.resistance_level ?? null,
    urgency: partial.urgency ?? 5,
    importance: partial.importance ?? 5,
    consequence_if_delayed: partial.consequence_if_delayed ?? 5,
    trust_impact: partial.trust_impact ?? 5,
    time_efficiency: partial.time_efficiency ?? 5,
    priority: partial.priority ?? null,
    consequence_level: partial.consequence_level ?? null,
    status: partial.status ?? "inbox",
    daily_role: partial.daily_role ?? null,
    recurring: partial.recurring ?? false,
    notes: partial.notes ?? "",
    source: partial.source ?? "manual",
    template_key: partial.template_key ?? null,
    template_day_index: partial.template_day_index ?? null,
    template_week_index: partial.template_week_index ?? null,
    template_phase: partial.template_phase ?? null,
    generated_from: partial.generated_from ?? null,
    previous_status: partial.previous_status ?? null,
    ignored_until: partial.ignored_until ?? null,
    ignored_count: partial.ignored_count ?? 0,
    carry_forward_count: partial.carry_forward_count ?? 0,
    rescheduled_count: partial.rescheduled_count ?? 0,
    parent_task_id: partial.parent_task_id ?? null,
    review_date: partial.review_date ?? null,
    completed_at: partial.completed_at ?? null,
    archived_at: partial.archived_at ?? null,
    deleted_at: partial.deleted_at ?? null,
    linked_anchor_id: partial.linked_anchor_id ?? null,
    created_at: partial.created_at ?? now,
    updated_at: partial.updated_at ?? now,
  });
}

export function makeTask(partial: Partial<Task> & { title: string }): Task {
  return createTask(partial);
}

export function updateTask(task: Task, patch: Partial<Task>): Task {
  return normalizeTask({
    ...task,
    ...patch,
    id: task.id,
    task_code: task.task_code || patch.task_code,
    created_at: task.created_at,
    updated_at: nowIso(),
  });
}

export function changeTaskStatus(
  task: Task,
  status: CanonicalTaskStatus,
  options: {
    today?: string;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
    dueDate?: string | null;
    fixedTime?: string | null;
  } = {},
): Task {
  const now = nowIso();
  const previous = task.status === status ? task.previous_status : task.status;
  const base: Partial<Task> = {
    status,
    previous_status: previous,
    updated_at: now,
  };

  if (status === "today") {
    base.daily_role = task.daily_role === "Ignore Today" ? null : task.daily_role;
    base.ignored_until = null;
    base.archived_at = null;
    base.deleted_at = null;
  }

  if (status === "this_week" || status === "inbox") {
    base.daily_role = status === "inbox" ? null : task.daily_role;
    base.ignored_until = null;
    base.archived_at = null;
    base.deleted_at = null;
  }

  if (status === "scheduled") {
    base.scheduled_start = options.scheduledStart ?? task.scheduled_start;
    base.scheduled_end = options.scheduledEnd ?? task.scheduled_end;
    base.due_date = options.dueDate ?? task.due_date ?? datePart(options.scheduledStart);
    base.fixed_time = options.fixedTime ?? task.fixed_time;
    base.rescheduled_count = task.status === "scheduled" ? task.rescheduled_count + 1 : task.rescheduled_count;
  }

  if (status === "waiting") {
    base.daily_role = "Waiting";
  }

  if (status === "ignored_today") {
    base.daily_role = "Ignore Today";
    base.ignored_until = options.today ?? toDashedDateKey();
    base.ignored_count = task.ignored_count + 1;
  }

  if (status === "parking_lot") {
    base.daily_role = null;
    base.ignored_until = null;
  }

  if (status === "done") {
    base.daily_role = null;
    base.completed_at = task.completed_at ?? now;
  }

  if (status === "archived") {
    base.daily_role = null;
    base.archived_at = task.archived_at ?? now;
    base.deleted_at = null;
  }

  if (status === "trashed") {
    base.daily_role = null;
    base.deleted_at = task.deleted_at ?? now;
  }

  return updateTask(task, base);
}

export function moveTaskToToday(task: Task) {
  return changeTaskStatus(task, "today");
}

export function moveTaskToThisWeek(task: Task) {
  return changeTaskStatus(task, "this_week");
}

export function scheduleTask(
  task: Task,
  input: {
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
    dueDate?: string | null;
    fixedTime?: string | null;
  } = {},
) {
  return changeTaskStatus(task, "scheduled", input);
}

export function ignoreTaskToday(task: Task, today = toDashedDateKey()) {
  return changeTaskStatus(task, "ignored_today", { today });
}

export function completeTask(task: Task) {
  return changeTaskStatus(task, "done");
}

export function archiveTask(task: Task) {
  return changeTaskStatus(task, "archived");
}

export function trashTask(task: Task) {
  return changeTaskStatus(task, "trashed");
}

export function restoreTask(task: Task) {
  const fallback = isActiveStatus(task.previous_status) ? task.previous_status : "inbox";
  return updateTask(task, {
    status: fallback,
    previous_status: task.status,
    archived_at: null,
    deleted_at: null,
    completed_at: task.status === "done" ? task.completed_at : null,
    daily_role: fallback === "waiting" ? "Waiting" : null,
  });
}

export function incrementIgnoredCount(task: Task) {
  return updateTask(task, { ignored_count: task.ignored_count + 1 });
}

export function incrementCarryForwardCount(task: Task) {
  return updateTask(task, { carry_forward_count: task.carry_forward_count + 1 });
}

export function incrementRescheduledCount(task: Task) {
  return updateTask(task, { rescheduled_count: task.rescheduled_count + 1 });
}

export function hardDeleteTask(task: Task, confirmed: boolean) {
  if (!confirmed || task.status !== "trashed") {
    throw new Error("Hard delete requires confirmation and a trashed task.");
  }
  return task.id;
}

export function isDoneStatus(status: TaskStatus | null | undefined) {
  return status === "done" || status === "completed";
}

export function isActiveStatus(status: TaskStatus | null | undefined): status is CanonicalTaskStatus {
  return (
    status === "inbox" ||
    status === "today" ||
    status === "this_week" ||
    status === "scheduled" ||
    status === "waiting" ||
    status === "ignored_today" ||
    status === "parking_lot"
  );
}

export function isArchivedTask(task: Task) {
  return task.status === "archived" || task.archived_at != null;
}

export function isTrashedTask(task: Task) {
  return task.status === "trashed" || task.deleted_at != null;
}

export function isActiveTask(task: Task) {
  return !isDoneStatus(task.status) && !isArchivedTask(task) && !isTrashedTask(task);
}

export function isIgnoredTodayTask(task: Task, today = toDashedDateKey()) {
  if (!isActiveTask(task)) return false;
  if (task.status !== "ignored_today" && task.daily_role !== "Ignore Today") return false;
  return !task.ignored_until || task.ignored_until >= today;
}

function priorityWeight(priority: TaskPriority | null) {
  if (priority === "critical") return 10;
  if (priority === "high") return 8;
  if (priority === "medium") return 5;
  if (priority === "low") return 2;
  return 0;
}

function consequenceWeight(level: ConsequenceLevel | null) {
  if (level === "critical") return 10;
  if (level === "high") return 8;
  if (level === "medium") return 5;
  if (level === "low") return 2;
  return 0;
}

// Energy match: high score when current energy is close to or above required.
// Diff = required - current. If current >= required => 10. Each missing point
// drops the score by 1.5 (clamped 0-10).
export function energyMatchScore(currentEnergy: number, required: number): number {
  const diff = required - currentEnergy;
  if (diff <= 0) return 10;
  return Math.max(0, 10 - diff * 1.5);
}

export function calcTaskPriority(task: Task, currentEnergy: number): number {
  const energyMatch = energyMatchScore(currentEnergy, task.energy_required ?? 5);
  const priority = priorityWeight(task.priority);
  const consequence = Math.max(
    task.consequence_if_delayed,
    consequenceWeight(task.consequence_level),
  );
  return (
    task.urgency * 0.2 +
    consequence * 0.25 +
    task.importance * 0.15 +
    task.trust_impact * 0.15 +
    priority * 0.15 +
    energyMatch * 0.07 +
    task.time_efficiency * 0.03
  );
}

// Auto-assign a daily role based on heuristics from the user's spec.
export function assignDailyRole(task: Task, currentEnergy: number): DailyRole {
  if (!isActiveTask(task)) return "Ignore Today";
  if (task.status === "ignored_today") return "Ignore Today";
  if (task.status === "waiting") return "Waiting";

  if (task.fixed_time || task.scheduled_start) return "Anchor";

  const priority = calcTaskPriority(task, currentEnergy);

  if (
    task.priority === "critical" ||
    task.consequence_level === "critical" ||
    (task.urgency >= 8 && task.consequence_if_delayed >= 8)
  ) {
    return "Must Do";
  }

  if ((task.estimated_minutes ?? 999) <= 15 && task.trust_impact >= 6) return "Quick Win";

  const maintenanceTypes: TaskType[] = [
    "Household",
    "Health",
    "Nutrition",
    "Workout",
    "Admin",
    "Personal",
  ];
  if (
    (task.estimated_minutes ?? 999) <= 30 &&
    (task.recurring || maintenanceTypes.includes(task.task_type)) &&
    task.urgency < 8
  ) {
    return "Maintenance";
  }

  if (priority >= 6) return "Should Do";
  return "Ignore Today";
}

export type DayPlan = {
  anchors: Task[];
  mustDo: Task[];
  shouldDo: Task[];
  maintenance: Task[];
  quickWins: Task[];
  waiting: Task[];
  ignoreToday: Task[];
};

function addByRole(plan: DayPlan, task: Task, currentEnergy: number) {
  const role = task.daily_role ?? assignDailyRole(task, currentEnergy);
  switch (role) {
    case "Anchor":
      plan.anchors.push(task);
      break;
    case "Must Do":
      plan.mustDo.push(task);
      break;
    case "Should Do":
      plan.shouldDo.push(task);
      break;
    case "Maintenance":
      plan.maintenance.push(task);
      break;
    case "Quick Win":
      plan.quickWins.push(task);
      break;
    case "Waiting":
      plan.waiting.push(task);
      break;
    case "Ignore Today":
      plan.ignoreToday.push(task);
      break;
  }
}

export function buildDayPlan(
  tasks: Task[],
  currentEnergy: number,
  today = toDashedDateKey(),
): DayPlan {
  const live = tasks.filter((task) => isActiveTask(task) && task.status !== "parking_lot");
  const sorted = [...live].sort(
    (a, b) =>
      calcTaskPriority(b, currentEnergy) - calcTaskPriority(a, currentEnergy),
  );

  const plan: DayPlan = {
    anchors: [],
    mustDo: [],
    shouldDo: [],
    maintenance: [],
    quickWins: [],
    waiting: [],
    ignoreToday: [],
  };

  for (const task of sorted) {
    if (isIgnoredTodayTask(task, today)) {
      plan.ignoreToday.push(task);
      continue;
    }
    addByRole(plan, task, currentEnergy);
  }
  return plan;
}

function isScheduledToday(task: Task, today: string) {
  if (task.status !== "scheduled") return false;
  return (
    datePart(task.scheduled_start) === today ||
    datePart(task.scheduled_end) === today ||
    task.due_date === today
  );
}

function isTrustProtectorTask(task: Task, today: string) {
  if (!isActiveTask(task) || task.status === "parking_lot") return false;
  const due = task.due_date;
  return (
    (due != null && due <= today) ||
    task.priority === "high" ||
    task.priority === "critical" ||
    task.consequence_level === "high" ||
    task.consequence_level === "critical" ||
    task.consequence_if_delayed >= 8 ||
    task.trust_impact >= 8 ||
    task.carry_forward_count >= 2
  );
}

function byInputOrder<T>(items: T[]) {
  return items;
}

export function buildExportablePlanningSet(
  tasks: Task[],
  options: TaskSmartViewOptions = {},
): Task[] {
  const today = options.today ?? toDashedDateKey();
  const active = tasks.filter(isActiveTask);
  const trustTaskIds = new Set(active.filter((task) => isTrustProtectorTask(task, today)).map((task) => task.id));
  return active.filter((task) => {
    if (isDoneStatus(task.status) || isArchivedTask(task) || isTrashedTask(task)) return false;
    if (!options.includeParkingLot && task.status === "parking_lot") return false;
    if (!options.includeIgnoredToday && task.status === "ignored_today") return false;
    return (
      task.status === "today" ||
      task.status === "this_week" ||
      isScheduledToday(task, today) ||
      trustTaskIds.has(task.id)
    );
  });
}

export function buildTaskSmartViews(
  tasks: Task[],
  options: TaskSmartViewOptions = {},
): TaskSmartViews {
  const today = options.today ?? toDashedDateKey();
  const active = tasks.filter(isActiveTask);
  const trustProtectors = active.filter((task) => isTrustProtectorTask(task, today));
  const inboxCandidates = active.filter((task) => task.status === "inbox");
  const committedToday = active.filter(
    (task) => task.status === "today" || isScheduledToday(task, today),
  );
  const ignoreToday = active.filter((task) => isIgnoredTodayTask(task, today));
  const parkingLot = active.filter((task) => task.status === "parking_lot");
  const driftRisk = active.filter(
    (task) =>
      task.ignored_count >= 2 ||
      task.carry_forward_count >= 2 ||
      task.rescheduled_count >= 2,
  );
  const quickWins = active.filter(
    (task) => (task.estimated_minutes ?? 999) <= 15 && (task.energy_required ?? 5) <= 5,
  );

  return {
    trustProtectors: byInputOrder(trustProtectors),
    inboxCandidates: byInputOrder(inboxCandidates),
    committedToday: byInputOrder(committedToday),
    ignoreToday: byInputOrder(ignoreToday),
    parkingLot: byInputOrder(parkingLot),
    driftRisk: byInputOrder(driftRisk),
    quickWins: byInputOrder(quickWins),
    exportablePlanningSet: buildExportablePlanningSet(tasks, options),
  };
}

function labelEstimatedMinutes(task: Task) {
  return task.estimated_minutes == null ? "Estimate missing" : String(task.estimated_minutes);
}

function labelPriority(task: Task) {
  return task.priority ?? "Priority unset";
}

function labelConsequence(task: Task) {
  return task.consequence_level ?? "Consequence unset";
}

export function formatTaskForPlanningExport(task: Task): string {
  const energy =
    task.energy_required == null ? "Energy unset" : `${task.energy_required}/10`;
  const role = task.daily_role ?? "Daily role unset";
  const notes = task.notes.trim() ? ` | notes ${task.notes.trim()}` : "";
  return `${task.task_code} | id ${task.id} | title ${task.title} | domain ${
    task.task_type
  } | status ${normalizeTaskStatus(task.status)} | daily_role ${role} | due_date ${
    task.due_date ?? "due unset"
  } | estimated_minutes ${labelEstimatedMinutes(task)} | priority ${labelPriority(
    task,
  )} | consequence_level ${labelConsequence(task)} | energy_required ${energy} | trust_impact ${
    task.trust_impact
  }/10 | ignored_count ${task.ignored_count} | carry_forward_count ${
    task.carry_forward_count
  } | rescheduled_count ${task.rescheduled_count}${notes}`;
}

export function validatePlanningExport(input: {
  tasks: Task[];
  mustDo: Task[];
  anchorsCount: number;
}) {
  const warnings: string[] = [];
  const missingCodes = input.tasks.filter((task) => !task.task_code?.trim());
  if (missingCodes.length > 0) {
    warnings.push(`${missingCodes.length} exported task(s) are missing task codes.`);
  }
  if (input.mustDo.length === 0) warnings.push("Must Do missing.");
  const missingEstimate = input.tasks.filter((task) => task.estimated_minutes == null);
  if (missingEstimate.length > 0) {
    warnings.push(`${missingEstimate.length} task(s) marked Estimate missing.`);
  }
  const missingPriority = input.tasks.filter((task) => task.priority == null);
  if (missingPriority.length > 0) {
    warnings.push(`${missingPriority.length} task(s) marked Priority unset.`);
  }
  const missingConsequence = input.tasks.filter((task) => task.consequence_level == null);
  if (missingConsequence.length > 0) {
    warnings.push(`${missingConsequence.length} task(s) marked Consequence unset.`);
  }
  if (input.anchorsCount === 0) warnings.push("Fixed anchors missing.");
  return warnings;
}

function listPlanningTasks(tasks: Task[]): string {
  if (tasks.length === 0) return "- none";
  return tasks.map((task) => `- ${formatTaskForPlanningExport(task)}`).join("\n");
}

export function buildTriagePrompt(tasks: Task[], currentEnergy: number): string {
  const views = buildTaskSmartViews(tasks, { currentEnergy });
  const calendarAnchors = tasks
    .filter((task) => task.fixed_time)
    .map((task) => `- ${task.task_code} | ${task.title} @ ${task.fixed_time}`)
    .join("\n");

  return `Here is my Lifeee task inbox:

Inbox candidates:
${listPlanningTasks(views.inboxCandidates)}

Committed today:
${listPlanningTasks(views.committedToday)}

Trust protectors:
${listPlanningTasks(views.trustProtectors)}

Drift risk:
${listPlanningTasks(views.driftRisk)}

Current energy: ${currentEnergy}/10

Calendar anchors:
${calendarAnchors || "- none"}

Sort my tasks into:
1. Anchors
2. Must Do
3. Should Do
4. Maintenance
5. Quick Wins
6. Waiting
7. Ignore Today

Then build me a realistic day plan and explain what I should not do today.`;
}
