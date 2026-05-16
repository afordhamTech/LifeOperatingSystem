import {
  isDoneStatus,
  TASK_TYPES,
  type CanonicalTaskStatus,
  type ConsequenceLevel,
  type DailyRole,
  type Task,
  type TaskPriority,
  type TaskType,
} from "@/lib/task-system";

export const ROUTINE_SOURCE = "life_routine_seed" as const;
export const DEFAULT_DAILY_HORIZON_DAYS = 14;
export const DEFAULT_WEEKLY_HORIZON_WEEKS = 8;

export type RoutineCadence =
  | "daily"
  | "weekly"
  | "weekdays"
  | "five_x_week"
  | "four_x_week";

export type RoutineDomain =
  | "Faith"
  | "Depth & Learning"
  | "Money"
  | "Career"
  | "Health"
  | "Sleep"
  | "Nutrition"
  | "Workout"
  | "MCAT";

export type RoutineTemplate = {
  template_key: string;
  name: string;
  domain: RoutineDomain;
  task_type: TaskType;
  cadence: RoutineCadence;
  estimated_minutes: number;
  daily_role: DailyRole;
  priority: TaskPriority;
  consequence_level: ConsequenceLevel;
  energy_required: number;
  resistance_level: number;
  title: string;
  description: string;
  preferred_weekdays?: number[];
  optional?: boolean;
  horizon_days?: number;
};

export type RoutineInstance = {
  id?: string;
  user_id?: string;
  template_key: string;
  name: string;
  domain: RoutineDomain;
  cadence: RoutineCadence;
  start_date: string;
  end_date: string | null;
  preferred_days: number[] | null;
  preferred_time: string | null;
  estimated_minutes: number | null;
  status: "active" | "paused";
};

export type RoutineTaskPayload = Partial<Task> & {
  title: string;
  description: string;
  task_type: TaskType;
  due_date: string;
  estimated_minutes: number;
  source: typeof ROUTINE_SOURCE;
  template_key: string;
  template_phase: string;
  generated_from: Record<string, unknown>;
};

// Map a domain to a TASK_TYPES value; fall back to "Personal" when not present.
function resolveTaskType(preferred: TaskType): TaskType {
  return TASK_TYPES.includes(preferred) ? preferred : ("Personal" as TaskType);
}

export const LIFE_ROUTINE_TEMPLATES: RoutineTemplate[] = [
  {
    template_key: "faith_daily_reading_v1",
    name: "Faith daily reading",
    domain: "Faith",
    task_type: resolveTaskType("Faith"),
    cadence: "daily",
    estimated_minutes: 20,
    daily_role: "Maintenance",
    priority: "medium",
    consequence_level: "medium",
    energy_required: 4,
    resistance_level: 3,
    title: "Faith: 20-minute reading and prayer",
    description:
      "Daily faith block. Read scripture for 20 minutes, write the one verse that stood out, and pray over the day. Success = one passage read, one note recorded, one prayer offered.",
  },
  {
    template_key: "depth_learning_v1",
    name: "Depth & Learning block",
    domain: "Depth & Learning",
    task_type: resolveTaskType("Academic"),
    cadence: "four_x_week",
    estimated_minutes: 25,
    daily_role: "Should Do",
    priority: "medium",
    consequence_level: "medium",
    energy_required: 5,
    resistance_level: 4,
    preferred_weekdays: [1, 3, 5, 6],
    title: "Depth & Learning: 25-minute focused block",
    description:
      "Depth block. Pick the current learning thread, do 25 minutes of active reading or practice, and write one insight. Success = one block completed and one insight captured.",
  },
  {
    template_key: "money_weekly_check_v1",
    name: "Money weekly check",
    domain: "Money",
    task_type: resolveTaskType("Money"),
    cadence: "weekly",
    estimated_minutes: 25,
    daily_role: "Should Do",
    priority: "high",
    consequence_level: "high",
    energy_required: 4,
    resistance_level: 5,
    preferred_weekdays: [0],
    title: "Money: 25-minute weekly check",
    description:
      "Weekly money truth pass. Review balances, log net cash flow, name the biggest leak, and queue one money move. Success = balances reviewed, leak named, next move decided.",
  },
  {
    template_key: "career_weekly_proof_v1",
    name: "Career weekly proof move",
    domain: "Career",
    task_type: resolveTaskType("Career"),
    cadence: "weekly",
    estimated_minutes: 35,
    daily_role: "Should Do",
    priority: "medium",
    consequence_level: "medium",
    energy_required: 5,
    resistance_level: 5,
    preferred_weekdays: [5],
    title: "Career: 35-minute proof move",
    description:
      "Weekly career proof block. Ship one visible artifact, update the resume or portfolio, or send one high-leverage outreach. Success = one proof item shipped or one outreach sent.",
  },
  {
    template_key: "health_daily_check_v1",
    name: "Health daily check",
    domain: "Health",
    task_type: resolveTaskType("Health"),
    cadence: "daily",
    estimated_minutes: 3,
    daily_role: "Maintenance",
    priority: "medium",
    consequence_level: "high",
    energy_required: 2,
    resistance_level: 2,
    title: "Health: 3-minute pain and recovery check",
    description:
      "Quick health check-in. Log pain score, trend, and any red flag. Success = today's pain and recovery state recorded in under three minutes.",
  },
  {
    template_key: "health_weekly_review_v1",
    name: "Health weekly review",
    domain: "Health",
    task_type: resolveTaskType("Health"),
    cadence: "weekly",
    estimated_minutes: 15,
    daily_role: "Should Do",
    priority: "medium",
    consequence_level: "high",
    energy_required: 4,
    resistance_level: 3,
    preferred_weekdays: [0],
    title: "Health: 15-minute weekly review",
    description:
      "Weekly health review. Scan the week's pain logs, decide whether to modify training or escalate, and book any needed appointment. Success = trend named and one decision made.",
  },
  {
    template_key: "sleep_shutdown_v1",
    name: "Sleep shutdown",
    domain: "Sleep",
    task_type: resolveTaskType("Personal"),
    cadence: "daily",
    estimated_minutes: 15,
    daily_role: "Maintenance",
    priority: "high",
    consequence_level: "high",
    energy_required: 2,
    resistance_level: 3,
    title: "Sleep: 15-minute shutdown",
    description:
      "Nightly shutdown. Close loops, set tomorrow's first move, dim screens, and start wind-down. Success = first move written and lights-out target hit.",
  },
  {
    template_key: "nutrition_daily_fuel_v1",
    name: "Nutrition daily fuel log",
    domain: "Nutrition",
    task_type: resolveTaskType("Nutrition"),
    cadence: "daily",
    estimated_minutes: 5,
    daily_role: "Maintenance",
    priority: "medium",
    consequence_level: "medium",
    energy_required: 2,
    resistance_level: 2,
    title: "Nutrition: 5-minute fuel log",
    description:
      "Quick fuel log. Record meals, hydration, and one signal (energy, hunger, or recovery). Success = day's intake captured in five minutes.",
  },
  {
    template_key: "workout_weekly_plan_v1",
    name: "Workout weekly plan",
    domain: "Workout",
    task_type: resolveTaskType("Workout"),
    cadence: "weekly",
    estimated_minutes: 15,
    daily_role: "Should Do",
    priority: "medium",
    consequence_level: "medium",
    energy_required: 4,
    resistance_level: 4,
    preferred_weekdays: [0],
    optional: true,
    title: "Plan training week",
    description:
      "Weekly training planning only. Pick the training days for the week based on readiness, pain, and recovery; do not auto-schedule fixed sessions. Success = the week's training days chosen with a readiness note.",
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

function addDays(dateKey: string, days: number) {
  return formatDateKey(new Date(parseDateKey(dateKey).getTime() + days * DAY_MS));
}

function weekdayOf(dateKey: string) {
  return parseDateKey(dateKey).getUTCDay(); // 0=Sun..6=Sat
}

function localTodayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function startOfMondayWeek(dateKey: string) {
  const date = parseDateKey(dateKey);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return formatDateKey(new Date(date.getTime() + diff * DAY_MS));
}

function statusForDueDate(dueDate: string, today: string): CanonicalTaskStatus {
  if (dueDate === today) return "today";
  if (startOfMondayWeek(dueDate) === startOfMondayWeek(today)) return "this_week";
  return "scheduled";
}

function maxDateKey(a: string, b: string) {
  return a > b ? a : b;
}

function resolveHorizonDays(template: RoutineTemplate, options?: { horizonDays?: number }) {
  if (typeof options?.horizonDays === "number") return options.horizonDays;
  if (typeof template.horizon_days === "number") return template.horizon_days;
  if (template.cadence === "weekly") return DEFAULT_WEEKLY_HORIZON_WEEKS * 7;
  return DEFAULT_DAILY_HORIZON_DAYS;
}

function resolvePreferredDays(
  template: RoutineTemplate,
  override?: number[] | null,
): number[] | null {
  if (override && override.length > 0) return override;
  if (template.preferred_weekdays && template.preferred_weekdays.length > 0) {
    return template.preferred_weekdays;
  }
  return null;
}

export function generateRoutineTaskDates(
  template: RoutineTemplate,
  startDate: string,
  options?: { today?: string; horizonDays?: number; preferredDays?: number[] | null },
): string[] {
  const today = options?.today ?? localTodayKey();
  const horizonDays = resolveHorizonDays(template, options);
  const beginDate = maxDateKey(startDate, today);
  const dates: string[] = [];

  if (template.cadence === "weekly") {
    const preferred = resolvePreferredDays(template, options?.preferredDays);
    // Without preferred_weekdays, anchor weekly routines to Sunday (0)
    // deterministically rather than drifting to whatever day the user
    // happened to activate the routine on.
    const weekday = preferred && preferred.length > 0 ? preferred[0] : 0;
    // Step forward across horizon, pick one per ISO-ish week (use Monday-start week boundary).
    const weeksSeen = new Set<string>();
    for (let i = 0; i < horizonDays; i += 1) {
      const dateKey = addDays(beginDate, i);
      if (dateKey < startDate) continue;
      if (weekdayOf(dateKey) !== weekday) continue;
      const weekKey = startOfMondayWeek(dateKey);
      if (weeksSeen.has(weekKey)) continue;
      weeksSeen.add(weekKey);
      dates.push(dateKey);
      if (weeksSeen.size >= DEFAULT_WEEKLY_HORIZON_WEEKS) break;
    }
    return dates;
  }

  // Daily-family cadences
  let allowedDays: Set<number> | null = null;
  if (template.cadence === "weekdays") {
    allowedDays = new Set([1, 2, 3, 4, 5]);
  } else if (template.cadence === "five_x_week") {
    const preferred = resolvePreferredDays(template, options?.preferredDays);
    allowedDays = new Set(preferred ?? [1, 2, 3, 4, 5]);
  } else if (template.cadence === "four_x_week") {
    const preferred = resolvePreferredDays(template, options?.preferredDays);
    allowedDays = new Set(preferred ?? [1, 3, 5, 6]);
  }

  for (let i = 0; i < horizonDays; i += 1) {
    const dateKey = addDays(beginDate, i);
    if (dateKey < startDate) continue;
    if (allowedDays && !allowedDays.has(weekdayOf(dateKey))) continue;
    dates.push(dateKey);
  }
  return dates;
}

export function buildRoutineTaskPayload(
  template: RoutineTemplate,
  dueDate: string,
  occurrenceIndex: number,
  instance?: { id?: string; preferred_time?: string | null },
): RoutineTaskPayload {
  const today = localTodayKey();
  const importance = template.priority === "high" ? 7 : 5;
  const preferredTime = instance?.preferred_time ?? null;

  return {
    title: template.title,
    description: template.description,
    task_type: template.task_type,
    due_date: dueDate,
    fixed_time: preferredTime,
    estimated_minutes: template.estimated_minutes,
    energy_required: template.energy_required,
    resistance_level: template.resistance_level,
    urgency: 5,
    importance,
    consequence_if_delayed: 5,
    trust_impact: 5,
    time_efficiency: 6,
    priority: template.priority,
    consequence_level: template.consequence_level,
    status: statusForDueDate(dueDate, today),
    daily_role: template.daily_role,
    notes: `Routine task generated from ${template.name}. Mark done when completed.`,
    source: ROUTINE_SOURCE,
    template_key: template.template_key,
    template_day_index: occurrenceIndex + 1,
    template_week_index: Math.floor(occurrenceIndex / 7) + 1,
    template_phase: `${template.domain} routine`,
    generated_from: {
      template_key: template.template_key,
      source: ROUTINE_SOURCE,
      domain: template.domain,
      cadence: template.cadence,
      occurrence_index: occurrenceIndex,
      planned_date: dueDate,
      preferred_time: preferredTime,
      routine_instance_id: instance?.id ?? null,
    },
  };
}

export function generateRoutineTasks(
  template: RoutineTemplate,
  startDate: string,
  options?: {
    today?: string;
    horizonDays?: number;
    preferredDays?: number[] | null;
    instance?: { id?: string; preferred_time?: string | null };
  },
): RoutineTaskPayload[] {
  const dates = generateRoutineTaskDates(template, startDate, options);
  return dates.map((dueDate, idx) =>
    buildRoutineTaskPayload(template, dueDate, idx, options?.instance),
  );
}

function isRoutineTaskForTemplate(task: Task, templateKey: string) {
  return task.source === ROUTINE_SOURCE && task.template_key === templateKey;
}

function routineInstanceIdOf(task: Task): string | null {
  const meta = task.generated_from as { routine_instance_id?: unknown } | null | undefined;
  if (meta && typeof meta.routine_instance_id === "string") return meta.routine_instance_id;
  const direct = (task as { routine_instance_id?: unknown }).routine_instance_id;
  return typeof direct === "string" ? direct : null;
}

export function getMissingRoutineTasks(
  template: RoutineTemplate,
  existingTasks: Task[],
  startDate: string,
  options?: {
    today?: string;
    horizonDays?: number;
    preferredDays?: number[] | null;
    instance?: { id?: string; preferred_time?: string | null };
  },
): RoutineTaskPayload[] {
  // Duplicate prevention is instance-aware so a reactivated routine does not
  // collide with leftover tasks from a paused/superseded instance.
  const activeInstanceId = options?.instance?.id ?? null;
  const existingDates = new Set(
    existingTasks
      .filter((t) => isRoutineTaskForTemplate(t, template.template_key))
      .filter((t) => {
        if (!activeInstanceId) return true;
        const id = routineInstanceIdOf(t);
        // Only consider tasks tied to the active instance (or legacy tasks
        // that have no instance id yet) when blocking new generation.
        return id == null || id === activeInstanceId;
      })
      .map((t) => t.due_date)
      .filter((d): d is string => typeof d === "string" && d.length > 0),
  );
  return generateRoutineTasks(template, startDate, options).filter(
    (payload) => !existingDates.has(payload.due_date),
  );
}

export type RoutineSeedStatus = {
  template_key: string;
  domain: RoutineDomain;
  cadence: RoutineCadence;
  generated_count: number;
  expected_count: number;
  missing_count: number;
  completed_count: number;
  next_occurrence_date: string | null;
  horizon_end: string;
};

export function summarizeRoutineSeedStatus(
  template: RoutineTemplate,
  existingTasks: Task[],
  startDate: string,
  options?: { today?: string; horizonDays?: number; preferredDays?: number[] | null },
): RoutineSeedStatus {
  const today = options?.today ?? localTodayKey();
  const horizonDays = resolveHorizonDays(template, options);
  const dates = generateRoutineTaskDates(template, startDate, options);
  const dateSet = new Set(dates);
  const matching = existingTasks.filter(
    (t) =>
      isRoutineTaskForTemplate(t, template.template_key) &&
      typeof t.due_date === "string" &&
      dateSet.has(t.due_date),
  );
  const completedCount = matching.filter((t) => isDoneStatus(t.status)).length;
  const existingDates = new Set(
    matching.map((t) => t.due_date as string),
  );
  const nextOccurrence =
    dates.find((d) => d >= today && !existingDates.has(d)) ??
    dates.find((d) => d >= today) ??
    null;
  const horizonEnd = addDays(maxDateKey(startDate, today), Math.max(0, horizonDays - 1));

  return {
    template_key: template.template_key,
    domain: template.domain,
    cadence: template.cadence,
    generated_count: matching.length,
    expected_count: dates.length,
    missing_count: Math.max(0, dates.length - matching.length),
    completed_count: completedCount,
    next_occurrence_date: nextOccurrence,
    horizon_end: horizonEnd,
  };
}
