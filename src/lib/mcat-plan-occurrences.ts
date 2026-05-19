import {
  MCAT_PHASE_0_SOURCE,
  MCAT_PHASE_0_TEMPLATE,
  MCAT_PHASE_0_TEMPLATE_KEY,
  getMcatPhase0TaskForDate,
  generateMcatPhase0Tasks,
} from "@/lib/mcat-phase-0-template";
import { completeTask, makeTask, updateTask, type Task } from "@/lib/task-system";

export const MCAT_COMMITTED_STUDY_SOURCE = "mcat_committed_study";
export const MCAT_ACTIVE_STUDY_SOURCE = "mcat_active_study";

export const MCAT_PLAN_OCCURRENCE_STATUSES = [
  "planned",
  "available",
  "in_progress",
  "completed",
  "skipped",
  "moved",
] as const;

export type McatPlanOccurrenceStatus = (typeof MCAT_PLAN_OCCURRENCE_STATUSES)[number];

export type McatPlanOccurrence = {
  id: string;
  user_id?: string;
  plan_instance_id: string | null;
  template_key: string;
  template_day_index: number;
  template_week_index: number;
  planned_date: string;
  learning_type: string;
  topic: string | null;
  title: string;
  description: string | null;
  estimated_minutes: number;
  status: McatPlanOccurrenceStatus;
  started_at?: string | null;
  completed_at?: string | null;
  skipped_at?: string | null;
  skipped_reason?: string | null;
  moved_from_date?: string | null;
  linked_task_id: string | null;
  generated_from: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type McatPlanOccurrenceSummary = {
  totalPlanDayCount: number;
  generatedPlanDayCount: number;
  committedTaskCount: number;
  completedCount: number;
  skippedCount: number;
  remainingPlannedMinutes: number;
  currentWeekIndex: number | null;
  currentPlannedDate: string | null;
  statusLabel: string;
};

export type McatTodayCommand = {
  heading: "Today's MCAT Command";
  action: string;
  estimatedMinutes: number;
  why: string;
  successCondition: string;
  disciplineText: string;
  dayLabel: string;
  statusLabel: string;
  occurrence: McatPlanOccurrence | null;
};

function stableOccurrenceId(planInstanceId: string | null | undefined, dayIndex: number) {
  const planPart = planInstanceId?.replace(/[^a-zA-Z0-9-]/g, "") || "local";
  return `mcat-occurrence-${planPart}-${String(dayIndex).padStart(2, "0")}`;
}

function textMeta(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeOccurrenceStatus(value: unknown): McatPlanOccurrenceStatus {
  return typeof value === "string" &&
    MCAT_PLAN_OCCURRENCE_STATUSES.includes(value as McatPlanOccurrenceStatus)
    ? (value as McatPlanOccurrenceStatus)
    : value === "committed"
      ? "in_progress"
    : "planned";
}

export function isOldMcatPhase0SeedTask(task: Task) {
  return task.source === MCAT_PHASE_0_SOURCE && task.template_key === MCAT_PHASE_0_TEMPLATE_KEY;
}

export function isCommittedMcatStudyTask(task: Task) {
  return task.source === MCAT_COMMITTED_STUDY_SOURCE || task.source === MCAT_ACTIVE_STUDY_SOURCE;
}

export function normalizeMcatPlanOccurrence(
  raw: Partial<McatPlanOccurrence> & {
    template_day_index: number;
    template_week_index: number;
    planned_date: string;
    title: string;
    estimated_minutes: number;
  },
): McatPlanOccurrence {
  const templateKey = raw.template_key ?? MCAT_PHASE_0_TEMPLATE_KEY;
  const id = raw.id ?? stableOccurrenceId(raw.plan_instance_id, raw.template_day_index);
  const generatedFrom =
    raw.generated_from && typeof raw.generated_from === "object" && !Array.isArray(raw.generated_from)
      ? (raw.generated_from as Record<string, unknown>)
      : {};
  return {
    id,
    user_id: raw.user_id,
    plan_instance_id: raw.plan_instance_id ?? null,
    template_key: templateKey,
    template_day_index: raw.template_day_index,
    template_week_index: raw.template_week_index,
    planned_date: raw.planned_date,
    learning_type:
      textMeta(raw.learning_type) ??
      textMeta(generatedFrom.learning_type) ??
      textMeta(generatedFrom.daily_task_type) ??
      "foundation study",
    topic: textMeta(raw.topic) ?? textMeta(generatedFrom.topic_focus),
    title: raw.title.trim() || "MCAT study block",
    description: raw.description ?? null,
    estimated_minutes: Math.max(1, Math.floor(raw.estimated_minutes)),
    status: normalizeOccurrenceStatus(raw.status),
    started_at: raw.started_at ?? null,
    completed_at: raw.completed_at ?? null,
    skipped_at: raw.skipped_at ?? null,
    skipped_reason: raw.skipped_reason ?? null,
    moved_from_date: raw.moved_from_date ?? null,
    linked_task_id: raw.linked_task_id ?? null,
    generated_from: generatedFrom,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

export function generateMcatPhase0PlanOccurrences(
  seedStartDate: string,
  options: { today?: string; planInstanceId?: string | null } = {},
): McatPlanOccurrence[] {
  return generateMcatPhase0Tasks(seedStartDate, {
    today: options.today,
    planInstanceId: options.planInstanceId ?? null,
  }).map((task) =>
    normalizeMcatPlanOccurrence({
      id: stableOccurrenceId(options.planInstanceId, task.template_day_index),
      plan_instance_id: options.planInstanceId ?? null,
      template_key: MCAT_PHASE_0_TEMPLATE_KEY,
      template_day_index: task.template_day_index,
      template_week_index: task.template_week_index,
      planned_date: task.due_date,
      learning_type:
        textMeta(task.generated_from?.learning_type) ??
        textMeta(task.generated_from?.daily_task_type) ??
        "foundation study",
      topic: textMeta(task.generated_from?.topic_focus),
      title: task.title,
      description: task.description,
      estimated_minutes: task.estimated_minutes,
      status: "planned",
      started_at: null,
      completed_at: null,
      skipped_at: null,
      skipped_reason: null,
      moved_from_date: null,
      linked_task_id: null,
      generated_from: {
        ...task.generated_from,
        storage: "mcat_plan_occurrences",
      },
    }),
  );
}

export function summarizeMcatPlanOccurrenceStatus(
  occurrences: McatPlanOccurrence[],
  options: { today?: string } = {},
): McatPlanOccurrenceSummary {
  const uniqueByDay = new Map<number, McatPlanOccurrence>();
  for (const occurrence of occurrences) {
    if (!uniqueByDay.has(occurrence.template_day_index)) {
      uniqueByDay.set(occurrence.template_day_index, occurrence);
    }
  }
  const unique = [...uniqueByDay.values()];
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const todayOccurrence =
    unique.find((occurrence) => occurrence.planned_date === today) ??
    unique.find((occurrence) => occurrence.status === "planned") ??
    null;

  return {
    totalPlanDayCount: 70,
    generatedPlanDayCount: unique.length,
    committedTaskCount: unique.filter((occurrence) => Boolean(occurrence.linked_task_id)).length,
    completedCount: unique.filter((occurrence) => occurrence.status === "completed").length,
    skippedCount: unique.filter((occurrence) => occurrence.status === "skipped").length,
    remainingPlannedMinutes:
      unique.length === 0
        ? MCAT_PHASE_0_TEMPLATE.total_planned_minutes
        : unique.reduce(
            (sum, occurrence) =>
              occurrence.status === "completed" || occurrence.status === "skipped"
                ? sum
                : sum + occurrence.estimated_minutes,
            0,
          ),
    currentWeekIndex: todayOccurrence?.template_week_index ?? null,
    currentPlannedDate: todayOccurrence?.planned_date ?? null,
    statusLabel:
      unique.length >= 70
        ? "Phase 0 plan active"
        : unique.length > 0
          ? "Phase 0 plan partial"
          : "Phase 0 plan not started",
  };
}

function occurrenceMatchesTask(occurrence: McatPlanOccurrence, task: Task) {
  const generatedFrom = task.generated_from ?? {};
  return (
    generatedFrom.mcat_occurrence_id === occurrence.id ||
    (task.template_key === occurrence.template_key &&
      task.template_day_index === occurrence.template_day_index &&
      (generatedFrom.plan_instance_id == null ||
        occurrence.plan_instance_id == null ||
        generatedFrom.plan_instance_id === occurrence.plan_instance_id))
  );
}

function findTaskToLink(occurrence: McatPlanOccurrence, existingTasks: Task[]) {
  if (occurrence.linked_task_id) {
    const linked = existingTasks.find((task) => task.id === occurrence.linked_task_id);
    if (linked) return linked;
  }
  return (
    existingTasks.find(
      (task) => isCommittedMcatStudyTask(task) && occurrenceMatchesTask(occurrence, task),
    ) ??
    existingTasks.find((task) => isOldMcatPhase0SeedTask(task) && occurrenceMatchesTask(occurrence, task)) ??
    null
  );
}

function commitStatusForDate(plannedDate: string, today: string) {
  return plannedDate <= today ? "today" : "scheduled";
}

function successConditionForLearningType(learningType: string, topic: string | null) {
  const normalized = learningType.toLowerCase();
  if (normalized.includes("cars")) {
    return "Finish one passage, identify the miss type, and log the result.";
  }
  if (normalized.includes("practice")) {
    return `Complete the question set${topic ? ` for ${topic}` : ""}, review every miss, and log the pattern.`;
  }
  if (normalized.includes("error")) {
    return "Clean up one error-log pattern and queue one retest item.";
  }
  if (normalized.includes("diagnostic")) {
    return "Complete the checkpoint, review misses immediately, and record the score signal.";
  }
  return `Finish the ${topic ?? "foundation"} block and log one clear takeaway.`;
}

function committedGeneratedFrom(occurrence: McatPlanOccurrence, adoptedFromSource?: string | null) {
  return {
    ...occurrence.generated_from,
    source: MCAT_COMMITTED_STUDY_SOURCE,
    template_key: occurrence.template_key,
    plan_instance_id: occurrence.plan_instance_id,
    mcat_occurrence_id: occurrence.id,
    template_day_index: occurrence.template_day_index,
    template_week_index: occurrence.template_week_index,
    learning_type: occurrence.learning_type,
    topic: occurrence.topic,
    ...(adoptedFromSource ? { adopted_from_source: adoptedFromSource } : {}),
  };
}

function taskSourceGeneratedFrom(
  occurrence: McatPlanOccurrence,
  source: typeof MCAT_COMMITTED_STUDY_SOURCE | typeof MCAT_ACTIVE_STUDY_SOURCE,
  adoptedFromSource?: string | null,
) {
  return {
    ...committedGeneratedFrom(occurrence, adoptedFromSource),
    source,
  };
}

function buildTaskFromOccurrence(
  occurrence: McatPlanOccurrence,
  options: {
    today?: string;
    source?: typeof MCAT_COMMITTED_STUDY_SOURCE | typeof MCAT_ACTIVE_STUDY_SOURCE;
  } = {},
): Task {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const source = options.source ?? MCAT_COMMITTED_STUDY_SOURCE;
  const seedStartDate = textMeta(occurrence.generated_from.seed_start_date);
  const templateTask = seedStartDate
    ? getMcatPhase0TaskForDate(seedStartDate, occurrence.planned_date, {
        today,
        planInstanceId: occurrence.plan_instance_id,
      })
    : null;
  return makeTask({
    ...(templateTask ?? {}),
    title: occurrence.title,
    description: occurrence.description ?? templateTask?.description ?? "",
    task_type: "MCAT",
    due_date: occurrence.planned_date,
    estimated_minutes: occurrence.estimated_minutes,
    source,
    template_key: occurrence.template_key,
    template_day_index: occurrence.template_day_index,
    template_week_index: occurrence.template_week_index,
    template_phase: MCAT_PHASE_0_TEMPLATE.phase_name,
    status: source === MCAT_ACTIVE_STUDY_SOURCE ? "today" : commitStatusForDate(occurrence.planned_date, today),
    daily_role: source === MCAT_ACTIVE_STUDY_SOURCE || occurrence.planned_date <= today ? "Must Do" : "Should Do",
    priority: templateTask?.priority ?? "high",
    consequence_level: templateTask?.consequence_level ?? "medium",
    notes: [
      templateTask?.notes,
      `Linked from MCAT plan occurrence ${occurrence.id}.`,
      `Success condition: ${successConditionForLearningType(occurrence.learning_type, occurrence.topic)}`,
    ]
      .filter(Boolean)
      .join(" "),
    generated_from: taskSourceGeneratedFrom(occurrence, source),
  });
}

function buildCommittedTaskFromOccurrence(
  occurrence: McatPlanOccurrence,
  options: { today?: string } = {},
): Task {
  return buildTaskFromOccurrence(occurrence, {
    ...options,
    source: MCAT_COMMITTED_STUDY_SOURCE,
  });
}

export function commitMcatPlanOccurrenceToTask(
  occurrenceInput: McatPlanOccurrence,
  existingTasks: Task[],
  options: { today?: string } = {},
): { occurrence: McatPlanOccurrence; task: Task; created: boolean } {
  const occurrence = normalizeMcatPlanOccurrence(occurrenceInput);
  const existing = findTaskToLink(occurrence, existingTasks);
  if (existing) {
    const wasOldSeed = isOldMcatPhase0SeedTask(existing);
    const task = updateTask(existing, {
      source: MCAT_COMMITTED_STUDY_SOURCE,
      template_key: occurrence.template_key,
      template_day_index: occurrence.template_day_index,
      template_week_index: occurrence.template_week_index,
      template_phase: existing.template_phase ?? MCAT_PHASE_0_TEMPLATE.phase_name,
      due_date: existing.due_date ?? occurrence.planned_date,
      status: commitStatusForDate(occurrence.planned_date, options.today ?? new Date().toISOString().slice(0, 10)),
      daily_role: existing.daily_role ?? "Must Do",
      generated_from: committedGeneratedFrom(occurrence, wasOldSeed ? existing.source : null),
    });
    return {
      occurrence: {
        ...occurrence,
        status: "in_progress",
        linked_task_id: task.id,
      },
      task,
      created: false,
    };
  }

  const task = buildCommittedTaskFromOccurrence(occurrence, options);
  return {
    occurrence: {
      ...occurrence,
      status: "in_progress",
      linked_task_id: task.id,
    },
    task,
    created: true,
  };
}

function isIncompleteQueueOccurrence(occurrence: McatPlanOccurrence) {
  return occurrence.status !== "completed" && occurrence.status !== "skipped";
}

function replaceOccurrence(
  occurrences: McatPlanOccurrence[],
  replacement: McatPlanOccurrence,
) {
  return occurrences
    .map((occurrence) => (occurrence.id === replacement.id ? replacement : occurrence))
    .sort((a, b) => a.template_day_index - b.template_day_index);
}

export function getCurrentMcatQueueOccurrence(occurrences: McatPlanOccurrence[]) {
  const ordered = [...occurrences].sort(
    (a, b) => a.template_day_index - b.template_day_index,
  );
  return (
    ordered.find((occurrence) => occurrence.status === "in_progress") ??
    ordered.find((occurrence) => isIncompleteQueueOccurrence(occurrence)) ??
    null
  );
}

export function getNextMcatQueueOccurrence(
  occurrences: McatPlanOccurrence[],
  afterDayIndex = 0,
) {
  return (
    [...occurrences]
      .sort((a, b) => a.template_day_index - b.template_day_index)
      .find(
        (occurrence) =>
          occurrence.template_day_index > afterDayIndex && isIncompleteQueueOccurrence(occurrence),
      ) ?? null
  );
}

export function startMcatPlanOccurrenceQueue(input: {
  occurrences: McatPlanOccurrence[];
  occurrenceId: string;
  existingTasks: Task[];
  today?: string;
  now?: string;
}): {
  occurrences: McatPlanOccurrence[];
  occurrence: McatPlanOccurrence;
  task: Task;
  created: boolean;
} {
  const now = input.now ?? new Date().toISOString();
  const occurrence = input.occurrences.find((item) => item.id === input.occurrenceId);
  if (!occurrence) throw new Error("MCAT occurrence not found");

  const existing = findTaskToLink(occurrence, input.existingTasks);
  const task = existing
    ? updateTask(existing, {
        source: MCAT_ACTIVE_STUDY_SOURCE,
        status: "today",
        daily_role: "Must Do",
        generated_from: taskSourceGeneratedFrom(
          occurrence,
          MCAT_ACTIVE_STUDY_SOURCE,
          isOldMcatPhase0SeedTask(existing) ? existing.source : null,
        ),
      })
    : buildTaskFromOccurrence(occurrence, {
        today: input.today,
        source: MCAT_ACTIVE_STUDY_SOURCE,
      });
  const nextOccurrence: McatPlanOccurrence = {
    ...normalizeMcatPlanOccurrence(occurrence),
    status: "in_progress",
    started_at: occurrence.started_at ?? now,
    linked_task_id: task.id,
    generated_from: {
      ...occurrence.generated_from,
      active_task_id: task.id,
    },
  };
  const occurrences = input.occurrences
    .map((item) => {
      if (item.id === nextOccurrence.id) return nextOccurrence;
      if (item.status === "in_progress") {
        return {
          ...item,
          status: "available" as const,
        };
      }
      return item;
    })
    .sort((a, b) => a.template_day_index - b.template_day_index);

  return {
    occurrences,
    occurrence: nextOccurrence,
    task,
    created: !existing,
  };
}

export function completeMcatPlanOccurrenceQueue(input: {
  occurrences: McatPlanOccurrence[];
  occurrenceId: string;
  existingTasks: Task[];
  now?: string;
}): {
  occurrences: McatPlanOccurrence[];
  occurrence: McatPlanOccurrence;
  task: Task | null;
  nextOccurrence: McatPlanOccurrence | null;
} {
  const now = input.now ?? new Date().toISOString();
  const occurrence = input.occurrences.find((item) => item.id === input.occurrenceId);
  if (!occurrence) throw new Error("MCAT occurrence not found");
  const taskToComplete = findTaskToLink(occurrence, input.existingTasks);
  const completedOccurrence: McatPlanOccurrence = {
    ...normalizeMcatPlanOccurrence(occurrence),
    status: "completed",
    completed_at: occurrence.completed_at ?? now,
  };
  const occurrences = replaceOccurrence(input.occurrences, completedOccurrence);
  return {
    occurrences,
    occurrence: completedOccurrence,
    task: taskToComplete ? completeTask(taskToComplete) : null,
    nextOccurrence: getNextMcatQueueOccurrence(occurrences, completedOccurrence.template_day_index),
  };
}

export function skipMcatPlanOccurrenceQueue(input: {
  occurrences: McatPlanOccurrence[];
  occurrenceId: string;
  reason: string;
  now?: string;
}): {
  occurrences: McatPlanOccurrence[];
  occurrence: McatPlanOccurrence;
  nextOccurrence: McatPlanOccurrence | null;
} {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Skip reason is required");
  const now = input.now ?? new Date().toISOString();
  const occurrence = input.occurrences.find((item) => item.id === input.occurrenceId);
  if (!occurrence) throw new Error("MCAT occurrence not found");
  const skippedOccurrence: McatPlanOccurrence = {
    ...normalizeMcatPlanOccurrence(occurrence),
    status: "skipped",
    skipped_at: occurrence.skipped_at ?? now,
    skipped_reason: reason,
  };
  const occurrences = replaceOccurrence(input.occurrences, skippedOccurrence);
  return {
    occurrences,
    occurrence: skippedOccurrence,
    nextOccurrence: getNextMcatQueueOccurrence(occurrences, skippedOccurrence.template_day_index),
  };
}

export function moveMcatPlanOccurrenceQueue(input: {
  occurrences: McatPlanOccurrence[];
  occurrenceId: string;
  plannedDate: string;
}): {
  occurrences: McatPlanOccurrence[];
  occurrence: McatPlanOccurrence;
} {
  const occurrence = input.occurrences.find((item) => item.id === input.occurrenceId);
  if (!occurrence) throw new Error("MCAT occurrence not found");
  const movedOccurrence: McatPlanOccurrence = {
    ...normalizeMcatPlanOccurrence(occurrence),
    status: "moved",
    moved_from_date: occurrence.moved_from_date ?? occurrence.planned_date,
    planned_date: input.plannedDate,
  };
  return {
    occurrences: replaceOccurrence(input.occurrences, movedOccurrence),
    occurrence: movedOccurrence,
  };
}

export function pickTodayMcatOccurrence(
  occurrences: McatPlanOccurrence[],
  today = new Date().toISOString().slice(0, 10),
) {
  const current = getCurrentMcatQueueOccurrence(occurrences);
  if (current) return current;
  const ordered = [...occurrences].sort(
    (a, b) => a.template_day_index - b.template_day_index,
  );
  return (
    ordered.find(
      (occurrence) =>
        occurrence.planned_date === today &&
        occurrence.status !== "completed" &&
        occurrence.status !== "skipped",
    ) ??
    ordered.find(
      (occurrence) =>
        occurrence.planned_date < today &&
        occurrence.status !== "completed" &&
        occurrence.status !== "skipped",
    ) ??
    ordered.find(
      (occurrence) =>
        occurrence.planned_date > today &&
        occurrence.status !== "completed" &&
        occurrence.status !== "skipped",
    ) ??
    null
  );
}

export function buildMcatTodayCommand(input: {
  occurrence: McatPlanOccurrence | null;
  fallbackTitle: string;
  fallbackDetail: string;
  hasActiveSession: boolean;
  hasLoggedToday: boolean;
}): McatTodayCommand {
  const action = input.occurrence?.title ?? input.fallbackTitle;
  const estimatedMinutes = input.occurrence?.estimated_minutes ?? 35;
  const topic = input.occurrence?.topic ?? null;
  const successCondition = input.occurrence
    ? successConditionForLearningType(input.occurrence.learning_type, topic)
    : "Finish one focused block and log what happened.";
  const disciplineText = input.hasActiveSession
    ? "Finish and log this session."
    : input.occurrence?.status === "in_progress"
      ? "Current state: Finish the in-progress session."
      : input.occurrence?.status === "completed"
        ? "Done for this item. Preview the next queue item."
    : input.hasLoggedToday
      ? "Review mistakes or stop for today."
      : "Do this first: Start the current MCAT command. Do not browse topics until it is logged.";

  return {
    heading: "Today's MCAT Command",
    action,
    estimatedMinutes,
    why: input.occurrence
      ? `Day ${input.occurrence.template_day_index} of 70 keeps Phase 0 chronological: start it, finish it, then advance.`
      : input.fallbackDetail,
    successCondition,
    disciplineText,
    dayLabel: input.occurrence ? `Day ${input.occurrence.template_day_index} of 70` : "No plan day",
    statusLabel: input.occurrence?.status.replace(/_/g, " ") ?? "not started",
    occurrence: input.occurrence,
  };
}

export function formatMcatAccuracyTrendLabel(input: {
  currentAttempted: number;
  previousAttempted: number;
  trend: number;
}) {
  if (input.currentAttempted <= 0 || input.previousAttempted < 10) {
    return "Not enough data yet";
  }
  if (Math.abs(input.trend) < 0.5) return "vs recent average";
  const rounded = Math.round(input.trend * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}% vs recent average`;
}
