import {
  EXECUTION_STATUSES,
  type CalendarAnchor,
  type ExecutionStatus,
  type TimeBlock,
} from "@/lib/calendar-system";
import type {
  AcademicTaskRow,
  NutritionLogRow,
  SleepLogRow,
  WeeklyReviewRow,
  WorkoutLogRow,
} from "@/lib/supabase-types";
import {
  calcFaithScore,
  calcInjuryRisk,
  calcProofScore,
  calcSubstanceScore,
} from "@/lib/calculations";
import {
  calcTaskPriority,
  normalizeTask,
  type DayPlan,
  type Task,
} from "@/lib/task-system";
import { supabase } from "@/lib/supabase-client";

export type LifeeeSyncStatus =
  | "loading"
  | "saving"
  | "saved"
  | "local"
  | "waiting"
  | "error"
  | "placeholder";

export type UniversalTaskRow = {
  id: string;
  user_id: string;
  task_code?: string | null;
  title: string;
  description?: string | null;
  domain?: string | null;
  task_type: string | null;
  due_date: string | null;
  fixed_time?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  estimated_minutes: number | null;
  energy_required: number | null;
  resistance_level?: number | null;
  urgency: number | null;
  importance: number | null;
  consequence_if_delayed: number | null;
  consequence_level?: string | null;
  trust_impact: number | null;
  time_efficiency: number | null;
  priority?: string | null;
  priority_score: number | null;
  status: string | null;
  daily_role: string | null;
  recurring: boolean | null;
  notes: string | null;
  source?: string | null;
  template_key?: string | null;
  template_day_index?: number | null;
  template_week_index?: number | null;
  template_phase?: string | null;
  generated_from?: Record<string, unknown> | null;
  previous_status?: string | null;
  ignored_until?: string | null;
  ignored_count?: number | null;
  carry_forward_count?: number | null;
  rescheduled_count?: number | null;
  parent_task_id?: string | null;
  review_date?: string | null;
  completed_at?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
  next_physical_action: string | null;
  friction_type: string | null;
  privacy_layer: string | null;
  linked_anchor_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CalendarAnchorRow = {
  id: string;
  user_id: string;
  title: string;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  category: string | null;
  location: string | null;
  link: string | null;
  people_involved: string | null;
  preparation_needed: string | null;
  follow_up_needed: string | null;
  notes: string | null;
  privacy_layer: string | null;
  created_at: string;
  updated_at: string;
};

export type TimeBlockRow = {
  id: string;
  user_id: string;
  title: string;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  block_type: string | null;
  linked_task_id?: string | null;
  linked_anchor_id?: string | null;
  source?: string | null;
  import_batch_id?: string | null;
  reason?: string | null;
  energy_required?: number | null;
  notes: string | null;
  status?: string | null;
  missed_reason?: string | null;
  completed_at?: string | null;
  execution_status?: string | null;
  started_at?: string | null;
  missed_at?: string | null;
  skipped_at?: string | null;
  actual_minutes?: number | null;
  execution_notes?: string | null;
  rescheduled_from_block_id?: string | null;
  carry_forward_task_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleImportRow = {
  id: string;
  user_id: string;
  date: string;
  raw_text: string;
  parsed_json: unknown;
  applied: boolean;
  plan_realism_score: number | null;
  risks: unknown;
  unscheduled: unknown;
  created_at: string;
  updated_at: string;
};

export type DailyPlanRow = {
  id: string;
  user_id: string;
  date: string;
  operating_mode: string | null;
  must_do_task_id: string | null;
  should_do_1_task_id: string | null;
  should_do_2_task_id: string | null;
  maintenance_task_id: string | null;
  quick_win_task_id: string | null;
  ignore_today: unknown;
  reality_score: number | null;
  main_bottleneck: string | null;
  shutdown_target: string | null;
  generated_from?: unknown;
  locked_at?: string | null;
  unlocked_at?: string | null;
  lock_status?: string | null;
  lock_reason?: string | null;
  plan_change_count?: number | null;
  plan_change_reasons?: unknown;
  shutdown_completed_at?: string | null;
  shutdown_notes?: string | null;
  tomorrow_first_move?: string | null;
  missed_summary?: unknown;
  carry_forward_summary?: unknown;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DailyPlanPayload = {
  date: string;
  operating_mode?: string | null;
  must_do_task_id?: string | null;
  should_do_1_task_id?: string | null;
  should_do_2_task_id?: string | null;
  maintenance_task_id?: string | null;
  quick_win_task_id?: string | null;
  ignore_today?: unknown[];
  reality_score?: number | null;
  main_bottleneck?: string | null;
  shutdown_target?: string | null;
  generated_from?: unknown;
  locked_at?: string | null;
  unlocked_at?: string | null;
  lock_status?: string | null;
  lock_reason?: string | null;
  plan_change_count?: number | null;
  plan_change_reasons?: unknown;
  shutdown_completed_at?: string | null;
  shutdown_notes?: string | null;
  tomorrow_first_move?: string | null;
  missed_summary?: unknown;
  carry_forward_summary?: unknown;
  notes?: string | null;
};

export type ProofItem = {
  id: string;
  projectName: string;
  artifactType: string;
  hoursWorked: number;
  visibility: number;
  difficulty: number;
  relevance: number;
  completion: number;
  proofScore: number;
  githubUpdated: boolean;
  linkedinUpdated: boolean;
  resumeBulletAdded: boolean;
  applicationSubmitted: boolean;
  mentorContact: string;
  skillPracticed: string;
  privacyLayer: string;
  leverageChecklist?: Record<string, boolean>;
  leverageDrafts?: Record<string, string>;
  created_at?: string;
  updated_at?: string;
};

export type FaithEntry = {
  id?: string;
  date: string;
  prayerDone: boolean;
  bibleReading: string;
  chapterStudied: string;
  mainLesson: string;
  question: string;
  actionStep: string;
  temptation: string;
  gratitude: string;
  churchInvolvement: boolean;
  faithScore?: number;
};

export type RelationshipEntry = {
  id: string;
  personName: string;
  lastContact: string | null;
  conversationQuality: number;
  unresolvedIssue: string;
  followUpNeeded: boolean;
  notes: string;
  created_at?: string;
};

export type SubscriptionItem = {
  id: string;
  name: string;
  monthlyCost: number;
  category?: string;
  active?: boolean;
};

export type MoneyEntry = {
  id?: string;
  date: string;
  income: number;
  spending: number;
  savings: number;
  debt: number;
  subscriptions: number;
  upcomingExpenses: number;
  biggestLeak: string;
  notes: string;
  subscriptionItems: SubscriptionItem[];
};

export type HealthEntry = {
  id?: string;
  date: string;
  painArea: string;
  painScore: number;
  painType: string;
  painTrigger: string;
  painReliever: string;
  trainingDone: string;
  sleep: number;
  hydration: number;
  mobilityDone: boolean;
  medicationTaken: string;
  doctorVisitNeeded: boolean;
  painTrend: string;
};

export type SubstanceEntry = {
  id?: string;
  date: string;
  readingDone: string;
  topicStudied: string;
  notesTaken: string;
  flashcardsMade: number;
  conversationPractice: boolean;
  newConcept: string;
  whyItMatters?: string;
  example?: string;
  myOpinion?: string;
  conversationAngle?: string;
  connectionToAnotherField?: string;
  questionOfDay: string;
  writingPractice: boolean;
  speakingPractice: boolean;
  substanceScore?: number;
};

export function getSyncLabel(status: LifeeeSyncStatus) {
  if (status === "loading") return "Loading Supabase";
  if (status === "saving") return "Saving";
  if (status === "saved") return "Saved";
  if (status === "waiting") return "Draft only";
  if (status === "error") return "Sync failed";
  if (status === "placeholder") return "Placeholder only";
  return "Draft only";
}

export function getSyncTone(status: LifeeeSyncStatus) {
  if (status === "saved") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700";
  if (status === "saving" || status === "loading") return "border-primary/25 bg-primary/10 text-primary";
  if (status === "error") return "border-destructive/25 bg-destructive/10 text-destructive";
  if (status === "placeholder") return "border-slate-500/25 bg-slate-500/10 text-slate-700";
  return "border-border bg-muted/40 text-muted-foreground";
}

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  return supabase;
}

function makeLocalDateTime(date: string | null, time: string | null) {
  if (!date) return null;
  const safeTime = time && /^\d{2}:\d{2}$/.test(time) ? time : "00:00";
  return new Date(`${date}T${safeTime}:00`).toISOString();
}

function dateKeyFromTimestamp(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function timeFromTimestamp(value: string | null, fallback: string | null = null) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export type SleepLogPayload = Omit<
  Partial<SleepLogRow>,
  "id" | "user_id" | "created_at" | "updated_at"
> & {
  date: string;
};

export type AcademicTaskPayload = Omit<
  Partial<AcademicTaskRow>,
  "user_id" | "created_at" | "updated_at"
> & {
  class_name: string;
  task_name: string;
  due_date: string;
  status: string;
};

export type WorkoutLogPayload = Omit<
  Partial<WorkoutLogRow>,
  "id" | "user_id" | "created_at" | "updated_at"
> & {
  date: string;
};

export type NutritionLogPayload = Omit<
  Partial<NutritionLogRow>,
  "id" | "user_id" | "created_at" | "updated_at"
> & {
  date: string;
};

export type WeeklyReviewPayload = Omit<
  Partial<WeeklyReviewRow>,
  "id" | "user_id" | "created_at" | "updated_at"
> & {
  week_start: string;
};

export type DecisionLogPayload = {
  id?: string;
  decision: string;
  decision_date?: string | null;
  options_considered?: unknown[];
  reason_chosen?: string | null;
  expected_outcome?: string | null;
  actual_outcome?: string | null;
  lesson_learned?: string | null;
  risk?: string | null;
  review_date?: string | null;
  result_later?: string | null;
  notes?: string | null;
};

export type DecisionLog = Required<Pick<DecisionLogPayload, "id" | "decision">> &
  Omit<DecisionLogPayload, "id" | "decision"> & {
    created_at?: string;
    updated_at?: string;
  };

export type AiPromptExportPayload = {
  prompt_type: string;
  prompt_text: string;
  source_page?: string | null;
};

export type TaskEventType =
  | "created"
  | "edited"
  | "status_changed"
  | "moved_today"
  | "ignored_today"
  | "completed"
  | "archived"
  | "trashed"
  | "restored"
  | "scheduled"
  | "rescheduled"
  | "carried_forward"
  | "plan_locked"
  | "plan_unlocked"
  | "block_started"
  | "block_completed"
  | "block_partial"
  | "block_missed"
  | "block_skipped"
  | "block_rescheduled"
  | "task_carried_forward"
  | "task_archived"
  | "task_trashed"
  | "shutdown_completed";

export type TaskEventPayload = {
  task_id: string;
  event_type: TaskEventType;
  old_value?: unknown;
  new_value?: unknown;
  reason?: string | null;
};

export type ScheduleImportPayload = {
  id?: string;
  date: string;
  raw_text: string;
  parsed_json: unknown;
  applied?: boolean;
  plan_realism_score?: number | null;
  risks?: unknown;
  unscheduled?: unknown;
};

export async function fetchSleepLog(userId: string, date: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("sleep_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();

  if (error) throw error;
  return data as SleepLogRow | null;
}

export async function fetchSleepLogs(userId: string, startDate: string, endDate: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("sleep_logs")
    .select("*")
    .eq("user_id", userId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

  if (error) throw error;
  return (data ?? []) as SleepLogRow[];
}

export async function upsertSleepLog(userId: string, payload: SleepLogPayload) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("sleep_logs")
    .upsert({ ...payload, user_id: userId }, { onConflict: "user_id,date" })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data as SleepLogRow | null;
}

export async function fetchAcademicTasks(userId: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("academic_tasks")
    .select("*")
    .eq("user_id", userId)
    .order("priority_score", { ascending: false });

  if (error) throw error;
  return (data ?? []) as AcademicTaskRow[];
}

export async function upsertAcademicTask(userId: string, payload: AcademicTaskPayload) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("academic_tasks")
    .upsert(
      {
        ...payload,
        id: payload.id ?? createLifeeeId(),
        user_id: userId,
      },
      { onConflict: "id" },
    )
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data as AcademicTaskRow | null;
}

export async function deleteAcademicTask(userId: string, id: string) {
  const client = requireSupabase();
  const { error } = await client
    .from("academic_tasks")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function fetchWorkoutLog(userId: string, date: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("workout_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();

  if (error) throw error;
  return data as WorkoutLogRow | null;
}

export async function fetchWorkoutLogs(userId: string, startDate: string, endDate: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("workout_logs")
    .select("*")
    .eq("user_id", userId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

  if (error) throw error;
  return (data ?? []) as WorkoutLogRow[];
}

export async function upsertWorkoutLog(userId: string, payload: WorkoutLogPayload) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("workout_logs")
    .upsert({ ...payload, user_id: userId }, { onConflict: "user_id,date" })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data as WorkoutLogRow | null;
}

export async function fetchNutritionLog(userId: string, date: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("nutrition_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();

  if (error) throw error;
  return data as NutritionLogRow | null;
}

export async function fetchNutritionLogs(userId: string, startDate: string, endDate: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("nutrition_logs")
    .select("*")
    .eq("user_id", userId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

  if (error) throw error;
  return (data ?? []) as NutritionLogRow[];
}

export async function upsertNutritionLog(userId: string, payload: NutritionLogPayload) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("nutrition_logs")
    .upsert({ ...payload, user_id: userId }, { onConflict: "user_id,date" })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data as NutritionLogRow | null;
}

export async function fetchWeeklyReview(userId: string, weekStart: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("weekly_reviews")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (error) throw error;
  return data as WeeklyReviewRow | null;
}

export async function fetchRecentWeeklyReviews(
  userId: string,
  weekStarts: string[],
) {
  if (weekStarts.length === 0) return [] as WeeklyReviewRow[];
  const client = requireSupabase();
  const { data, error } = await client
    .from("weekly_reviews")
    .select("*")
    .eq("user_id", userId)
    .in("week_start", weekStarts)
    .order("week_start", { ascending: false });

  if (error) throw error;
  return (data ?? []) as WeeklyReviewRow[];
}

export async function upsertWeeklyReview(userId: string, payload: WeeklyReviewPayload) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("weekly_reviews")
    .upsert({ ...payload, user_id: userId }, { onConflict: "user_id,week_start" })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data as WeeklyReviewRow | null;
}

export async function upsertDecisionLog(userId: string, payload: DecisionLogPayload) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("decision_logs")
    .upsert(
      {
        ...payload,
        id: payload.id ?? createLifeeeId(),
        user_id: userId,
        options_considered: payload.options_considered ?? [],
      },
      { onConflict: "id" },
    )
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function fetchDecisionLogs(userId: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("decision_logs")
    .select("*")
    .eq("user_id", userId)
    .order("decision_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as DecisionLog[];
}

export async function deleteDecisionLog(userId: string, id: string) {
  const client = requireSupabase();
  const { error } = await client
    .from("decision_logs")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function insertAiPromptExport(userId: string, payload: AiPromptExportPayload) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("ai_prompt_exports")
    .insert({ ...payload, user_id: userId })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data;
}

export function taskToRow(userId: string, task: Task, currentEnergy: number) {
  return {
    id: task.id,
    user_id: userId,
    task_code: task.task_code,
    title: task.title,
    description: task.description,
    domain: task.task_type,
    task_type: task.task_type,
    due_date: makeLocalDateTime(task.due_date, task.fixed_time),
    fixed_time: task.fixed_time,
    scheduled_start: task.scheduled_start,
    scheduled_end: task.scheduled_end,
    estimated_minutes: task.estimated_minutes,
    energy_required: task.energy_required,
    resistance_level: task.resistance_level,
    urgency: task.urgency,
    importance: task.importance,
    consequence_if_delayed: task.consequence_if_delayed,
    consequence_level: task.consequence_level,
    trust_impact: task.trust_impact,
    time_efficiency: task.time_efficiency,
    priority: task.priority,
    priority_score: calcTaskPriority(task, currentEnergy),
    status: task.status === "completed" ? "done" : task.status,
    daily_role: task.daily_role,
    recurring: task.recurring,
    notes: task.notes,
    source: task.source,
    template_key: task.template_key,
    template_day_index: task.template_day_index,
    template_week_index: task.template_week_index,
    template_phase: task.template_phase,
    generated_from: task.generated_from,
    previous_status: task.previous_status,
    ignored_until: task.ignored_until,
    ignored_count: task.ignored_count,
    carry_forward_count: task.carry_forward_count,
    rescheduled_count: task.rescheduled_count,
    parent_task_id: task.parent_task_id,
    review_date: task.review_date,
    completed_at: task.completed_at,
    archived_at: task.archived_at,
    deleted_at: task.deleted_at,
    linked_anchor_id: task.linked_anchor_id ?? null,
  };
}

export function rowToTask(row: UniversalTaskRow): Task {
  const dueDate = dateKeyFromTimestamp(row.due_date);
  const localTime = timeFromTimestamp(row.due_date);
  const fixedTime = row.fixed_time ?? (localTime && localTime !== "00:00" ? localTime : null);

  return normalizeTask({
    id: row.id,
    task_code: row.task_code ?? undefined,
    title: row.title,
    description: row.description ?? "",
    task_type: (row.task_type ?? "Personal") as Task["task_type"],
    due_date: dueDate,
    fixed_time: fixedTime,
    scheduled_start: row.scheduled_start ?? null,
    scheduled_end: row.scheduled_end ?? null,
    estimated_minutes: row.estimated_minutes,
    energy_required: row.energy_required,
    resistance_level: row.resistance_level ?? null,
    urgency: row.urgency ?? 5,
    importance: row.importance ?? 5,
    consequence_if_delayed: row.consequence_if_delayed ?? 5,
    consequence_level: row.consequence_level as Task["consequence_level"],
    trust_impact: row.trust_impact ?? 5,
    time_efficiency: row.time_efficiency ?? 5,
    priority: row.priority as Task["priority"],
    priority_score: row.priority_score,
    status: (row.status ?? "inbox") as Task["status"],
    daily_role: (row.daily_role as Task["daily_role"]) ?? null,
    recurring: row.recurring ?? false,
    notes: row.notes ?? "",
    source: row.source ?? "manual",
    template_key: row.template_key ?? null,
    template_day_index: row.template_day_index ?? null,
    template_week_index: row.template_week_index ?? null,
    template_phase: row.template_phase ?? null,
    generated_from: row.generated_from ?? null,
    previous_status: row.previous_status as Task["previous_status"],
    ignored_until: row.ignored_until ?? null,
    ignored_count: row.ignored_count ?? 0,
    carry_forward_count: row.carry_forward_count ?? 0,
    rescheduled_count: row.rescheduled_count ?? 0,
    parent_task_id: row.parent_task_id ?? null,
    review_date: row.review_date ?? null,
    completed_at: row.completed_at ?? null,
    archived_at: row.archived_at ?? null,
    deleted_at: row.deleted_at ?? null,
    linked_anchor_id: row.linked_anchor_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

export async function fetchUniversalTasks(userId: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("universal_tasks")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as UniversalTaskRow[]).map(rowToTask);
}

export async function fetchUniversalTasksByTemplate(input: {
  userId: string;
  source: string;
  templateKey: string;
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("universal_tasks")
    .select("*")
    .eq("user_id", input.userId)
    .eq("source", input.source)
    .eq("template_key", input.templateKey)
    .order("template_day_index", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as UniversalTaskRow[]).map(rowToTask);
}

export async function upsertUniversalTask(userId: string, task: Task, currentEnergy: number) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("universal_tasks")
    .upsert(taskToRow(userId, task, currentEnergy), { onConflict: "id" })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? rowToTask(data as UniversalTaskRow) : task;
}

export async function deleteUniversalTask(userId: string, id: string) {
  const client = requireSupabase();
  const { error } = await client
    .from("universal_tasks")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function hardDeleteUniversalTask(userId: string, task: Task, confirmed: boolean) {
  if (!confirmed || task.status !== "trashed") {
    throw new Error("Hard delete requires confirmation and a trashed task.");
  }
  await deleteUniversalTask(userId, task.id);
}

export async function insertTaskEvent(userId: string, payload: TaskEventPayload) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("task_events")
    .insert({
      task_id: payload.task_id,
      user_id: userId,
      event_type: payload.event_type,
      old_value: payload.old_value ?? null,
      new_value: payload.new_value ?? null,
      reason: payload.reason ?? null,
    })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data;
}

export function anchorToRow(userId: string, anchor: CalendarAnchor) {
  return {
    id: anchor.id,
    user_id: userId,
    title: anchor.title,
    date: anchor.date,
    start_time: makeLocalDateTime(anchor.date, anchor.start_time),
    end_time: makeLocalDateTime(anchor.date, anchor.end_time),
    category: anchor.category,
    location: anchor.location,
    link: anchor.link,
    people_involved: anchor.people,
    preparation_needed: anchor.prep,
    follow_up_needed: anchor.follow_up,
    notes: anchor.notes,
    privacy_layer: anchor.privacy,
  };
}

export function rowToAnchor(row: CalendarAnchorRow): CalendarAnchor {
  const date = row.date ?? dateKeyFromTimestamp(row.start_time) ?? new Date().toISOString().slice(0, 10);
  return {
    id: row.id,
    title: row.title,
    date,
    start_time: timeFromTimestamp(row.start_time, "09:00") ?? "09:00",
    end_time: timeFromTimestamp(row.end_time, "10:00") ?? "10:00",
    category: (row.category ?? "Personal") as CalendarAnchor["category"],
    location: row.location ?? "",
    link: row.link ?? "",
    people: row.people_involved ?? "",
    prep: row.preparation_needed ?? "",
    follow_up: row.follow_up_needed ?? "",
    notes: row.notes ?? "",
    privacy: (row.privacy_layer ?? "Private") as CalendarAnchor["privacy"],
    recurring: false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function fetchCalendarAnchors(userId: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("calendar_anchors")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as CalendarAnchorRow[]).map(rowToAnchor);
}

export async function upsertCalendarAnchor(userId: string, anchor: CalendarAnchor) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("calendar_anchors")
    .upsert(anchorToRow(userId, anchor), { onConflict: "id" })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? rowToAnchor(data as CalendarAnchorRow) : anchor;
}

export async function deleteCalendarAnchor(userId: string, id: string) {
  const client = requireSupabase();
  const { error } = await client
    .from("calendar_anchors")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
}

export function timeBlockToRow(userId: string, block: TimeBlock) {
  return {
    id: block.id,
    user_id: userId,
    title: block.title,
    date: block.date,
    start_time: makeLocalDateTime(block.date, block.start_time),
    end_time: makeLocalDateTime(block.date, block.end_time),
    block_type: block.block_type,
    linked_task_id: block.linked_task_id,
    linked_anchor_id: block.linked_anchor_id,
    source: block.source,
    import_batch_id: block.import_batch_id,
    reason: block.reason,
    notes: block.notes,
    status: block.status,
    missed_reason: block.missed_reason,
    completed_at: block.completed_at,
    execution_status: block.execution_status,
    started_at: block.started_at,
    missed_at: block.missed_at,
    skipped_at: block.skipped_at,
    actual_minutes: block.actual_minutes,
    execution_notes: block.execution_notes,
    rescheduled_from_block_id: block.rescheduled_from_block_id,
    carry_forward_task_id: block.carry_forward_task_id,
  };
}

export function rowToTimeBlock(row: TimeBlockRow): TimeBlock {
  const date = row.date ?? dateKeyFromTimestamp(row.start_time) ?? new Date().toISOString().slice(0, 10);
  return {
    id: row.id,
    title: row.title,
    date,
    start_time: timeFromTimestamp(row.start_time, "09:00") ?? "09:00",
    end_time: timeFromTimestamp(row.end_time, "09:30") ?? "09:30",
    block_type: row.block_type ?? "focus",
    linked_task_id: row.linked_task_id ?? null,
    linked_anchor_id: row.linked_anchor_id ?? null,
    source: row.source ?? "manual",
    import_batch_id: row.import_batch_id ?? null,
    reason: row.reason ?? "",
    notes: row.notes ?? "",
    status:
      row.status === "complete" || row.status === "missed" || row.status === "planned"
        ? row.status
        : "planned",
    missed_reason: row.missed_reason ?? null,
    completed_at: row.completed_at ?? null,
    execution_status: normalizeExecutionStatus(row.execution_status),
    started_at: row.started_at ?? null,
    missed_at: row.missed_at ?? null,
    skipped_at: row.skipped_at ?? null,
    actual_minutes: row.actual_minutes ?? null,
    execution_notes: row.execution_notes ?? null,
    rescheduled_from_block_id: row.rescheduled_from_block_id ?? null,
    carry_forward_task_id: row.carry_forward_task_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeExecutionStatus(value: string | null | undefined): ExecutionStatus {
  return EXECUTION_STATUSES.includes(value as ExecutionStatus)
    ? (value as ExecutionStatus)
    : "not_started";
}

export async function fetchTimeBlocks(userId: string, startDate?: string, endDate?: string) {
  const client = requireSupabase();
  let query = client
    .from("time_blocks")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (startDate) query = query.gte("date", startDate);
  if (endDate) query = query.lte("date", endDate);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as TimeBlockRow[]).map(rowToTimeBlock);
}

export async function fetchTimeBlocksForDate(userId: string, date: string) {
  return fetchTimeBlocks(userId, date, date);
}

export async function upsertTimeBlock(userId: string, block: TimeBlock) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("time_blocks")
    .upsert(timeBlockToRow(userId, block), { onConflict: "id" })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? rowToTimeBlock(data as TimeBlockRow) : block;
}

export async function deleteTimeBlock(userId: string, id: string) {
  const client = requireSupabase();
  const { error } = await client
    .from("time_blocks")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function deleteImportedTimeBlocksForDate(userId: string, date: string) {
  const client = requireSupabase();
  const { error } = await client
    .from("time_blocks")
    .delete()
    .eq("user_id", userId)
    .eq("date", date)
    .eq("source", "chatgpt_import");

  if (error) throw error;
}

export async function insertScheduleImport(userId: string, payload: ScheduleImportPayload) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("schedule_imports")
    .insert({
      id: payload.id ?? createLifeeeId(),
      user_id: userId,
      date: payload.date,
      raw_text: payload.raw_text,
      parsed_json: payload.parsed_json ?? {},
      applied: payload.applied ?? false,
      plan_realism_score: payload.plan_realism_score ?? null,
      risks: payload.risks ?? [],
      unscheduled: payload.unscheduled ?? [],
    })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data as ScheduleImportRow | null;
}

export async function markScheduleImportApplied(userId: string, id: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("schedule_imports")
    .update({ applied: true })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data as ScheduleImportRow | null;
}

export function buildDailyPlanPayload(input: {
  date: string;
  plan: DayPlan;
  realityScore?: number | null;
  mainBottleneck?: string | null;
  shutdownTime?: string | null;
}) {
  return {
    date: input.date,
    operating_mode: "Daily OS",
    must_do_task_id: input.plan.mustDo[0]?.id ?? null,
    should_do_1_task_id: input.plan.shouldDo[0]?.id ?? null,
    should_do_2_task_id: input.plan.shouldDo[1]?.id ?? null,
    maintenance_task_id: input.plan.maintenance[0]?.id ?? null,
    quick_win_task_id: input.plan.quickWins[0]?.id ?? null,
    ignore_today: input.plan.ignoreToday.map((task) => ({
      id: task.id,
      task_code: task.task_code,
      title: task.title,
      reason: task.daily_role ?? "Ignore Today",
    })),
    reality_score: input.realityScore ?? null,
    main_bottleneck: input.mainBottleneck ?? null,
    shutdown_target: input.shutdownTime
      ? makeLocalDateTime(input.date, input.shutdownTime)
      : null,
  } satisfies DailyPlanPayload;
}

export async function fetchDailyPlan(userId: string, date: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("daily_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();

  if (error) throw error;
  return data as DailyPlanRow | null;
}

export async function fetchDailyPlans(userId: string, startDate: string, endDate: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("daily_plans")
    .select("*")
    .eq("user_id", userId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

  if (error) throw error;
  return (data ?? []) as DailyPlanRow[];
}

export async function upsertDailyPlan(userId: string, payload: DailyPlanPayload) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("daily_plans")
    .upsert({ ...payload, user_id: userId }, { onConflict: "user_id,date" })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data as DailyPlanRow | null;
}

// ── Phase 1C: Plan Lock ─────────────────────────────────────────────────────
export type PlanLockUpdate = {
  date: string;
  lock_status: "locked" | "unlocked";
  lock_reason?: string | null;
  changeReason?: string | null;
};

export async function updateDailyPlanLock(userId: string, update: PlanLockUpdate) {
  const client = requireSupabase();
  const existing = await fetchDailyPlan(userId, update.date);
  const now = new Date().toISOString();
  const priorReasons = Array.isArray(existing?.plan_change_reasons)
    ? (existing!.plan_change_reasons as unknown[])
    : [];
  const nextReasons = update.changeReason
    ? [...priorReasons, { at: now, reason: update.changeReason, action: update.lock_status }]
    : priorReasons;
  const priorCount = existing?.plan_change_count ?? 0;
  const payload: DailyPlanPayload = {
    date: update.date,
    lock_status: update.lock_status,
    lock_reason: update.lock_reason ?? existing?.lock_reason ?? null,
    locked_at: update.lock_status === "locked" ? now : existing?.locked_at ?? null,
    unlocked_at: update.lock_status === "unlocked" ? now : existing?.unlocked_at ?? null,
    plan_change_count: update.changeReason ? priorCount + 1 : priorCount,
    plan_change_reasons: nextReasons,
  };
  const { data, error } = await client
    .from("daily_plans")
    .upsert({ ...payload, user_id: userId }, { onConflict: "user_id,date" })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data as DailyPlanRow | null;
}

// ── Phase 1C: Time Block Execution ──────────────────────────────────────────
export type BlockExecutionUpdate = {
  execution_status: ExecutionStatus;
  started_at?: string | null;
  completed_at?: string | null;
  missed_at?: string | null;
  skipped_at?: string | null;
  actual_minutes?: number | null;
  execution_notes?: string | null;
  missed_reason?: string | null;
  carry_forward_task_id?: string | null;
  rescheduled_from_block_id?: string | null;
};

export async function updateTimeBlockExecution(
  userId: string,
  blockId: string,
  update: BlockExecutionUpdate,
) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("time_blocks")
    .update(update)
    .eq("id", blockId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? rowToTimeBlock(data as TimeBlockRow) : null;
}

// ── Phase 1C: Daily Shutdowns ───────────────────────────────────────────────
export type DailyShutdownRow = {
  id: string;
  user_id: string;
  date: string;
  completed_at: string | null;
  shutdown_notes: string | null;
  anti_drift_lesson: string | null;
  tomorrow_first_move: string | null;
  tomorrow_shutdown_target: string | null;
  missed_summary: unknown;
  carry_forward_summary: unknown;
  created_at: string;
  updated_at: string;
};

export type DailyShutdownPayload = {
  date: string;
  completed_at?: string | null;
  shutdown_notes?: string | null;
  anti_drift_lesson?: string | null;
  tomorrow_first_move?: string | null;
  tomorrow_shutdown_target?: string | null;
  missed_summary?: unknown;
  carry_forward_summary?: unknown;
};

export async function fetchDailyShutdown(userId: string, date: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("daily_shutdowns")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();

  if (error) throw error;
  return data as DailyShutdownRow | null;
}

export async function fetchDailyShutdowns(
  userId: string,
  startDate: string,
  endDate: string,
) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("daily_shutdowns")
    .select("*")
    .eq("user_id", userId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

  if (error) throw error;
  return (data ?? []) as DailyShutdownRow[];
}

export async function upsertDailyShutdown(userId: string, payload: DailyShutdownPayload) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("daily_shutdowns")
    .upsert(
      {
        ...payload,
        user_id: userId,
        missed_summary: payload.missed_summary ?? [],
        carry_forward_summary: payload.carry_forward_summary ?? [],
      },
      { onConflict: "user_id,date" },
    )
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data as DailyShutdownRow | null;
}

export function createLifeeeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `lifeee_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function numberOrDefault(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function calcRelationshipPriority(entry: RelationshipEntry) {
  const importance = 7;
  const daysSince = entry.lastContact
    ? Math.ceil((Date.now() - new Date(entry.lastContact).getTime()) / (1000 * 60 * 60 * 24))
    : 7;
  const unresolvedTension = entry.unresolvedIssue ? 7 : 2;
  const opportunity = entry.followUpNeeded ? 8 : 4;
  return Math.round(
    (importance * 0.35 + Math.min(10, daysSince) * 0.25 + unresolvedTension * 0.25 + opportunity * 0.15) *
      100,
  ) / 100;
}

function calcRedFlags(painScore: number, painTrend: string, painType?: string) {
  const flags: string[] = [];
  if (painScore > 7) flags.push("Pain above 7 - no hard training");
  if (painTrend === "increasing") flags.push("Pain increasing - reduce load");
  if (painType === "sharp") flags.push("Sharp pain during movement - stop that movement");
  return flags;
}

export function getHealthRecommendations(entry: HealthEntry) {
  const recommendations: string[] = [];
  if (entry.painScore > 7) recommendations.push("No hard training today");
  if (entry.painScore > 4) recommendations.push("Modify: reduce impact work");
  if (entry.painTrend === "increasing") recommendations.push("Seek medical evaluation");
  if (!entry.mobilityDone) recommendations.push("Do mobility work");
  return recommendations;
}

export async function fetchProofItems(userId: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("proof_items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const visibility = numberOrDefault(row.visibility, 5);
    const difficulty = numberOrDefault(row.difficulty, 5);
    const relevance = numberOrDefault(row.relevance, 5);
    const completion = numberOrDefault(row.completion, 5);
    return {
      id: row.id,
      projectName: row.artifact_name ?? row.project ?? "",
      artifactType: row.artifact_type ?? "code",
      hoursWorked: numberOrDefault(row.hours_worked, 1),
      visibility,
      difficulty,
      relevance,
      completion,
      proofScore: numberOrDefault(row.proof_score, calcProofScore(visibility, difficulty, relevance, completion)),
      githubUpdated: Boolean(row.github_updated),
      linkedinUpdated: Boolean(row.linkedin_updated),
      resumeBulletAdded: Boolean(row.resume_bullet_added),
      applicationSubmitted: Boolean(row.application_submitted),
      mentorContact: row.mentor_contact ?? "",
      skillPracticed: row.skill_used ?? "",
      privacyLayer: row.privacy_layer ?? "Private",
      leverageChecklist:
        row.leverage_checklist && typeof row.leverage_checklist === "object"
          ? (row.leverage_checklist as Record<string, boolean>)
          : undefined,
      leverageDrafts:
        row.leverage_drafts && typeof row.leverage_drafts === "object"
          ? (row.leverage_drafts as Record<string, string>)
          : undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    } satisfies ProofItem;
  });
}

export async function upsertProofItem(userId: string, item: ProofItem) {
  const client = requireSupabase();
  const proofScore = calcProofScore(item.visibility, item.difficulty, item.relevance, item.completion);
  const { data, error } = await client
    .from("proof_items")
    .upsert(
      {
        id: item.id,
        user_id: userId,
        artifact_name: item.projectName,
        artifact_type: item.artifactType,
        project: item.projectName,
        hours_worked: item.hoursWorked,
        visibility: item.visibility,
        difficulty: item.difficulty,
        relevance: item.relevance,
        completion: item.completion,
        proof_score: proofScore,
        github_updated: item.githubUpdated,
        linkedin_updated: item.linkedinUpdated,
        resume_bullet_added: item.resumeBulletAdded,
        application_submitted: item.applicationSubmitted,
        mentor_contact: item.mentorContact,
        skill_used: item.skillPracticed,
        privacy_layer: item.privacyLayer,
        leverage_checklist: item.leverageChecklist ?? {},
        leverage_drafts: item.leverageDrafts ?? {},
      },
      { onConflict: "id" },
    )
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? (await fetchProofItems(userId)).find((proof) => proof.id === data.id) ?? { ...item, proofScore } : item;
}

export async function deleteProofItem(userId: string, id: string) {
  const client = requireSupabase();
  const { error } = await client.from("proof_items").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

export async function fetchFaithEntry(userId: string, date: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("faith_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    date: data.date,
    prayerDone: Boolean(data.prayer_done),
    bibleReading: data.bible_reading ?? data.passage ?? "",
    chapterStudied: data.chapter_studied ?? "",
    mainLesson: data.main_lesson ?? "",
    question: data.question ?? "",
    actionStep: data.action_step ?? "",
    temptation: data.temptation ?? data.struggle ?? "",
    gratitude: data.gratitude ?? "",
    churchInvolvement: Boolean(data.church_involvement),
    faithScore: numberOrDefault(data.faith_score, 0),
  } satisfies FaithEntry;
}

export async function fetchFaithWeek(userId: string, startDate: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("faith_logs")
    .select("*")
    .eq("user_id", userId)
    .gte("date", startDate)
    .order("date", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    date: row.date,
    score: numberOrDefault(row.faith_score, 0),
  }));
}

export async function upsertFaithEntry(userId: string, entry: FaithEntry) {
  const client = requireSupabase();
  const faithScore = calcFaithScore(entry.prayerDone, entry.bibleReading, entry.mainLesson, entry.actionStep);
  const { data, error } = await client
    .from("faith_logs")
    .upsert(
      {
        id: entry.id,
        user_id: userId,
        date: entry.date,
        prayer_done: entry.prayerDone,
        bible_reading: entry.bibleReading,
        passage: entry.bibleReading,
        chapter_studied: entry.chapterStudied,
        prayer_focus: entry.prayerDone ? "Prayer completed" : "",
        main_lesson: entry.mainLesson,
        question: entry.question,
        action_step: entry.actionStep,
        temptation: entry.temptation,
        struggle: entry.temptation,
        gratitude: entry.gratitude,
        church_involvement: entry.churchInvolvement,
        faith_score: faithScore,
      },
      { onConflict: "user_id,date" },
    )
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? { ...entry, id: data.id, faithScore } : { ...entry, faithScore };
}

export async function fetchRelationshipEntries(userId: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("relationship_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    personName: row.person_name ?? "",
    lastContact: row.last_contact ?? row.date ?? null,
    conversationQuality: numberOrDefault(row.conversation_quality, 7),
    unresolvedIssue: row.unresolved_issue ?? row.unresolved_tension ?? "",
    followUpNeeded: Boolean(row.follow_up_needed),
    notes: row.notes ?? "",
    created_at: row.created_at,
  } satisfies RelationshipEntry));
}

export async function upsertRelationshipEntry(userId: string, entry: RelationshipEntry) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("relationship_logs")
    .upsert(
      {
        id: entry.id,
        user_id: userId,
        person_name: entry.personName,
        date: entry.lastContact,
        last_contact: entry.lastContact,
        conversation_quality: entry.conversationQuality,
        unresolved_issue: entry.unresolvedIssue,
        unresolved_tension: entry.unresolvedIssue,
        follow_up_needed: entry.followUpNeeded,
        relationship_priority: calcRelationshipPriority(entry),
        notes: entry.notes,
      },
      { onConflict: "id" },
    )
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? (await fetchRelationshipEntries(userId)).find((item) => item.id === data.id) ?? entry : entry;
}

export async function fetchMoneyLog(userId: string, date: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("money_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    date: data.date,
    income: numberOrDefault(data.income),
    spending: numberOrDefault(data.spending),
    savings: numberOrDefault(data.savings),
    debt: numberOrDefault(data.debt),
    subscriptions: numberOrDefault(data.subscriptions),
    upcomingExpenses: numberOrDefault(data.upcoming_expenses),
    biggestLeak: data.biggest_leak ?? "",
    notes: data.notes ?? "",
    subscriptionItems: Array.isArray(data.subscription_items) ? (data.subscription_items as SubscriptionItem[]) : [],
  } satisfies MoneyEntry;
}

export async function fetchMoneyMonth(userId: string, monthStart: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("money_logs")
    .select("*")
    .eq("user_id", userId)
    .gte("date", monthStart)
    .order("date", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    date: row.date,
    income: numberOrDefault(row.income),
    spending: numberOrDefault(row.spending),
    savings: numberOrDefault(row.savings),
    debt: numberOrDefault(row.debt),
    subscriptions: numberOrDefault(row.subscriptions),
    upcomingExpenses: numberOrDefault(row.upcoming_expenses),
    biggestLeak: row.biggest_leak ?? "",
    notes: row.notes ?? "",
    subscriptionItems: Array.isArray(row.subscription_items) ? (row.subscription_items as SubscriptionItem[]) : [],
  } satisfies MoneyEntry));
}

export async function upsertMoneyLog(userId: string, entry: MoneyEntry) {
  const client = requireSupabase();
  const subscriptions = entry.subscriptionItems.reduce((sum, item) => sum + item.monthlyCost, 0);
  const netCashFlow = entry.income - entry.spending;
  const savingsRate = entry.income > 0 ? Math.round((entry.savings / entry.income) * 10000) / 100 : 0;
  const { data, error } = await client
    .from("money_logs")
    .upsert(
      {
        id: entry.id,
        user_id: userId,
        date: entry.date,
        income: entry.income,
        spending: entry.spending,
        savings: entry.savings,
        debt: entry.debt,
        subscriptions,
        upcoming_expenses: entry.upcomingExpenses,
        biggest_leak: entry.biggestLeak,
        notes: entry.notes,
        subscription_items: entry.subscriptionItems,
        net_cash_flow: netCashFlow,
        savings_rate: savingsRate,
      },
      { onConflict: "user_id,date" },
    )
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? fetchMoneyLog(userId, entry.date) : { ...entry, subscriptions };
}

export async function fetchHealthEntry(userId: string, date: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("health_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    date: data.date,
    painArea: data.pain_area ?? "",
    painScore: numberOrDefault(data.pain_score),
    painType: data.pain_type ?? "dull",
    painTrigger: data.pain_trigger ?? "",
    painReliever: data.pain_reliever ?? "",
    trainingDone: data.training_done ?? "",
    sleep: numberOrDefault(data.sleep, 7),
    hydration: numberOrDefault(data.hydration, 7),
    mobilityDone: Boolean(data.mobility_done),
    medicationTaken: data.medication_taken ?? "",
    doctorVisitNeeded: Boolean(data.doctor_visit_needed),
    painTrend: data.pain_trend ?? "stable",
  } satisfies HealthEntry;
}

export async function upsertHealthEntry(userId: string, entry: HealthEntry) {
  const client = requireSupabase();
  const injuryRisk = calcInjuryRisk(entry.painScore, entry.painTrend);
  const redFlags = calcRedFlags(entry.painScore, entry.painTrend, entry.painType);
  const { data, error } = await client
    .from("health_logs")
    .upsert(
      {
        id: entry.id,
        user_id: userId,
        date: entry.date,
        pain_area: entry.painArea,
        pain_score: entry.painScore,
        pain_type: entry.painType,
        pain_trigger: entry.painTrigger,
        pain_reliever: entry.painReliever,
        training_done: entry.trainingDone,
        training_load: 5,
        recovery_deficit: 3,
        sleep: entry.sleep,
        hydration: entry.hydration,
        mobility_done: entry.mobilityDone,
        medication_taken: entry.medicationTaken,
        doctor_visit_needed: entry.doctorVisitNeeded,
        pain_trend: entry.painTrend,
        injury_risk: injuryRisk,
        red_flags: redFlags,
        action_recommendation: getHealthRecommendations(entry).join("; "),
      },
      { onConflict: "user_id,date" },
    )
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? fetchHealthEntry(userId, entry.date) : entry;
}

export async function fetchSubstanceEntry(userId: string, date: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("substance_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    date: data.date,
    readingDone: data.reading ?? "",
    topicStudied: data.topic_studied ?? "",
    notesTaken: data.notes_taken ?? data.notes ?? "",
    flashcardsMade: numberOrDefault(data.flashcards_made),
    conversationPractice: Boolean(data.conversation_practice),
    newConcept: data.concept_learned ?? "",
    whyItMatters: data.why_it_matters ?? "",
    example: data.example ?? "",
    myOpinion: data.my_opinion ?? "",
    conversationAngle: data.conversation_angle ?? "",
    connectionToAnotherField: data.connection_to_another_field ?? "",
    questionOfDay: data.question_of_day ?? data.question ?? "",
    writingPractice: Boolean(data.writing_practice),
    speakingPractice: Boolean(data.speaking_practice_done),
    substanceScore: numberOrDefault(data.substance_score),
  } satisfies SubstanceEntry;
}

export async function fetchSubstanceWeek(userId: string, startDate: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("substance_logs")
    .select("*")
    .eq("user_id", userId)
    .gte("date", startDate)
    .order("date", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    date: row.date,
    score: numberOrDefault(row.substance_score),
  }));
}

export async function upsertSubstanceEntry(userId: string, entry: SubstanceEntry) {
  const client = requireSupabase();
  const substanceScore =
    entry.substanceScore ??
    calcSubstanceScore(
      entry.readingDone,
      entry.notesTaken,
      entry.writingPractice,
      entry.speakingPractice,
      entry.newConcept,
    );

  const payload = {
    user_id: userId,
    date: entry.date,
    reading: entry.readingDone,
    topic_studied: entry.topicStudied,
    notes_taken: entry.notesTaken,
    notes: entry.notesTaken,
    flashcards_made: entry.flashcardsMade,
    conversation_practice: entry.conversationPractice,
    conversation_topic: entry.topicStudied,
    concept_learned: entry.newConcept,
    why_it_matters: entry.whyItMatters ?? "",
    example: entry.example ?? "",
    my_opinion: entry.myOpinion ?? "",
    conversation_angle: entry.conversationAngle ?? "",
    connection_to_another_field: entry.connectionToAnotherField ?? "",
    question: entry.questionOfDay,
    question_of_day: entry.questionOfDay,
    writing: entry.writingPractice ? "Completed" : "",
    writing_practice: entry.writingPractice,
    speaking_practice: entry.speakingPractice ? "Completed" : "",
    speaking_practice_done: entry.speakingPractice,
    substance_score: substanceScore,
  };

  const findExistingId = async () => {
    const { data: existingRows, error: lookupError } = await client
      .from("substance_logs")
      .select("id")
      .eq("user_id", userId)
      .eq("date", entry.date)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (lookupError) throw lookupError;
    return existingRows?.[0]?.id as string | undefined;
  };

  let targetId = entry.id ?? (await findExistingId());

  if (targetId) {
    let { data, error } = await client
      .from("substance_logs")
      .update(payload)
      .eq("id", targetId)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (data) return { ...entry, id: data.id, substanceScore };

    targetId = await findExistingId();
    if (targetId) {
      ({ data, error } = await client
        .from("substance_logs")
        .update(payload)
        .eq("id", targetId)
        .eq("user_id", userId)
        .select("*")
        .maybeSingle());

      if (error) throw error;
      if (data) return { ...entry, id: data.id, substanceScore };
    }
  }

  const { data, error } = await client
    .from("substance_logs")
    .insert({ ...payload, id: entry.id ?? createLifeeeId() })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? { ...entry, id: data.id, substanceScore } : { ...entry, substanceScore };
}
