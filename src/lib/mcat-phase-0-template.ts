import {
  isDoneStatus,
  type CanonicalTaskStatus,
  type ConsequenceLevel,
  type DailyRole,
  type Task,
  type TaskPriority,
} from "@/lib/task-system";

export const MCAT_PHASE_0_TEMPLATE_KEY = "mcat_phase_0_foundation_v1";
export const MCAT_PHASE_0_SOURCE = "mcat_phase_0_seed";

export type McatPhaseDescriptor = {
  template_key: string;
  phase_name: string;
  short_label: string;
  status: "active" | "future";
  total_days: number;
  total_planned_minutes: number;
};

export const MCAT_PHASE_REGISTRY: McatPhaseDescriptor[] = [
  {
    template_key: MCAT_PHASE_0_TEMPLATE_KEY,
    phase_name: "Phase 0 Foundation",
    short_label: "Phase 0",
    status: "active",
    total_days: 70,
    total_planned_minutes: 4680,
  },
  // Future phases (Phase 1 Content, AAMC, UWorld, full-length, final review)
  // will be added here as additional descriptors with their own template files.
];

export const MCAT_PREP_SYSTEM_TAGLINE =
  "AI tutor first · Khan as syllabus · dashboard always";

export const MCAT_PHASE_0_LEARNING_LOOP = [
  "Pick one topic from Khan",
  "Learn it with ChatGPT Study Mode",
  "Explain it back from memory",
  "Answer tutor questions",
  "Do 5–10 practice questions",
  "Log mistakes in the error log",
  "Make flashcards",
  "Retest in 3–7 days",
  "Update the dashboard",
] as const;

export const MCAT_NOT_YET_LEARNED_SUBJECTS = [
  "Organic Chemistry",
  "Physics",
  "Biochemistry",
  "Advanced Biology",
  "Full Sociology",
  "Advanced MCAT passage reasoning",
] as const;

type WeekdayLabel = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
type McatDailyTaskType =
  | "foundation study"
  | "CARS microdose"
  | "practice questions"
  | "error log"
  | "review / recovery microdose"
  | "diagnostic checkpoint";

type TopicRole =
  | "primary"
  | "cars"
  | "science"
  | "practice"
  | "weak"
  | "mixed"
  | "diagnostic";

export type McatPhase0DayRule = {
  weekday: WeekdayLabel;
  estimated_minutes: number;
  daily_task_type: McatDailyTaskType;
  label: string;
  topic_role: TopicRole;
};

export type McatPhase0WeekPlan = {
  week_index: number;
  start_date: string;
  end_date: string;
  target_minutes: number;
  topics: string[];
  days: Array<McatPhase0DayRule & { due_date: string; template_day_index: number }>;
};

export type McatPhase0SeedSummary = {
  templateKey: string;
  source: string;
  phaseName: string;
  totalTaskCount: number;
  totalPlannedMinutes: number;
  seededTaskCount: number;
  completedTaskCount: number;
  missingTaskCount: number;
  duplicateTemplateDayCount: number;
  remainingPlannedMinutes: number;
  currentWeekIndex: number | null;
  currentWeekTargetMinutes: number | null;
  isFullySeeded: boolean;
  hasPartialSeed: boolean;
  statusLabel: string;
};

export type McatPhase0TaskPayload = Partial<Task> & {
  title: string;
  description: string;
  task_type: "MCAT";
  due_date: string;
  estimated_minutes: number;
  source: typeof MCAT_PHASE_0_SOURCE;
  template_key: typeof MCAT_PHASE_0_TEMPLATE_KEY;
  template_day_index: number;
  template_week_index: number;
  template_phase: string;
  generated_from: Record<string, unknown>;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const TOTAL_DAYS = 70;

const sixHourWeek: McatPhase0DayRule[] = [
  { weekday: "Mon", estimated_minutes: 60, daily_task_type: "foundation study", label: "foundation", topic_role: "primary" },
  { weekday: "Tue", estimated_minutes: 60, daily_task_type: "CARS microdose", label: "CARS + review", topic_role: "cars" },
  { weekday: "Wed", estimated_minutes: 60, daily_task_type: "foundation study", label: "science foundation", topic_role: "science" },
  { weekday: "Thu", estimated_minutes: 60, daily_task_type: "practice questions", label: "practice questions", topic_role: "practice" },
  { weekday: "Fri", estimated_minutes: 60, daily_task_type: "error log", label: "error log / weak topic", topic_role: "weak" },
  { weekday: "Sat", estimated_minutes: 45, daily_task_type: "review / recovery microdose", label: "mixed review", topic_role: "mixed" },
  { weekday: "Sun", estimated_minutes: 15, daily_task_type: "review / recovery microdose", label: "light review / plan next week", topic_role: "mixed" },
];

const eightHourWeek: McatPhase0DayRule[] = [
  { weekday: "Mon", estimated_minutes: 75, daily_task_type: "foundation study", label: "foundation", topic_role: "primary" },
  { weekday: "Tue", estimated_minutes: 75, daily_task_type: "CARS microdose", label: "CARS + review", topic_role: "cars" },
  { weekday: "Wed", estimated_minutes: 75, daily_task_type: "foundation study", label: "science foundation", topic_role: "science" },
  { weekday: "Thu", estimated_minutes: 75, daily_task_type: "practice questions", label: "practice questions", topic_role: "practice" },
  { weekday: "Fri", estimated_minutes: 75, daily_task_type: "error log", label: "weak topic", topic_role: "weak" },
  { weekday: "Sat", estimated_minutes: 75, daily_task_type: "review / recovery microdose", label: "mixed review", topic_role: "mixed" },
  { weekday: "Sun", estimated_minutes: 30, daily_task_type: "error log", label: "error log / plan next week", topic_role: "mixed" },
];

const tenHourWeek: McatPhase0DayRule[] = [
  { weekday: "Mon", estimated_minutes: 90, daily_task_type: "foundation study", label: "foundation", topic_role: "primary" },
  { weekday: "Tue", estimated_minutes: 90, daily_task_type: "CARS microdose", label: "CARS + review", topic_role: "cars" },
  { weekday: "Wed", estimated_minutes: 90, daily_task_type: "foundation study", label: "science foundation", topic_role: "science" },
  { weekday: "Thu", estimated_minutes: 90, daily_task_type: "practice questions", label: "practice questions", topic_role: "practice" },
  { weekday: "Fri", estimated_minutes: 90, daily_task_type: "error log", label: "weak topic", topic_role: "weak" },
  { weekday: "Sat", estimated_minutes: 90, daily_task_type: "practice questions", label: "mixed block", topic_role: "mixed" },
  { weekday: "Sun", estimated_minutes: 60, daily_task_type: "diagnostic checkpoint", label: "diagnostic/error review", topic_role: "diagnostic" },
];

export const MCAT_PHASE_0_TEMPLATE = {
  template_key: MCAT_PHASE_0_TEMPLATE_KEY,
  source: MCAT_PHASE_0_SOURCE,
  phase_name: "Phase 0 Foundation",
  total_planned_minutes: 4680,
  weekly_minute_targets: [360, 360, 360, 480, 480, 480, 480, 480, 600, 600],
  daily_distribution_rules: {
    360: sixHourWeek,
    480: eightHourWeek,
    600: tenHourWeek,
  },
  topic_rotation: [
    ["orientation", "MCAT structure", "CARS baseline", "Gen Chem baseline", "error log setup"],
    ["acid-base chemistry", "CARS main idea", "chemistry questions", "error log"],
    ["buffers", "CARS reasoning", "biology passage basics"],
    ["titrations", "equilibrium", "cell membranes"],
    ["stoichiometry", "redox", "organelles / cell signaling"],
    ["psychology attention/consciousness", "passage skills", "graph interpretation"],
    ["amino acids", "protein structure", "CARS tone/evidence"],
    ["fluids/waves overview", "practice passage stamina"],
    ["simulated blocks", "weak-topic review", "error-log tightening"],
    ["controlled diagnostic", "revision checkpoint", "next-phase planning"],
  ],
  task_metadata_defaults: {
    task_type: "MCAT",
    status: "scheduled",
    source: MCAT_PHASE_0_SOURCE,
    template_key: MCAT_PHASE_0_TEMPLATE_KEY,
    template_phase: "Phase 0 Foundation",
    recurring: false,
  },
} as const;

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

function daysBetween(startDate: string, endDate: string) {
  return Math.round((parseDateKey(endDate).getTime() - parseDateKey(startDate).getTime()) / DAY_MS);
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

function getSeedEndDate(seedStartDate: string) {
  return addDays(seedStartDate, TOTAL_DAYS - 1);
}

function getWeekIndexForDate(seedStartDate: string, dateKey: string) {
  const seedEndDate = getSeedEndDate(seedStartDate);
  if (dateKey < seedStartDate || dateKey > seedEndDate) return null;
  const idx = Math.floor(daysBetween(seedStartDate, dateKey) / 7) + 1;
  if (idx < 1 || idx > 10) return null;
  return idx;
}

function getDayIndexForDate(seedStartDate: string, dateKey: string) {
  const seedEndDate = getSeedEndDate(seedStartDate);
  if (dateKey < seedStartDate || dateKey > seedEndDate) return null;
  return daysBetween(seedStartDate, dateKey) + 1;
}

function titleCaseTopic(topic: string) {
  return topic
    .split(/([\s/]+)/)
    .map((part) =>
      /^[a-z]/.test(part) ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part,
    )
    .join("");
}

function resolveTopic(rule: McatPhase0DayRule, weekIndex: number, topics: readonly string[]) {
  const carsTopic = topics.find((topic) => topic.toLowerCase().includes("cars"));
  const errorTopic = topics.find((topic) => topic.toLowerCase().includes("error"));
  const diagnosticTopic = topics.find((topic) => topic.toLowerCase().includes("diagnostic"));
  const weakTopic = topics.find((topic) => topic.toLowerCase().includes("weak"));
  const scienceTopic =
    topics.find((topic) => !topic.toLowerCase().includes("cars") && !topic.toLowerCase().includes("error")) ??
    topics[0];

  if (rule.topic_role === "cars") return carsTopic ?? "CARS passage skills";
  if (rule.topic_role === "weak") return weakTopic ?? errorTopic ?? scienceTopic ?? "weak-topic review";
  if (rule.topic_role === "diagnostic") return diagnosticTopic ?? "controlled diagnostic";
  if (rule.topic_role === "mixed") {
    if (weekIndex === 10) return "revision checkpoint";
    return topics[topics.length - 1] ?? "mixed foundation review";
  }
  if (rule.topic_role === "practice") return scienceTopic ?? "foundation practice";
  return scienceTopic ?? "MCAT foundation";
}

function buildTaskTitle(rule: McatPhase0DayRule, topic: string, weekIndex: number) {
  if (weekIndex === 10 && rule.daily_task_type === "diagnostic checkpoint") {
    return "MCAT: Controlled diagnostic checkpoint";
  }
  if (weekIndex === 10 && rule.topic_role === "weak") {
    return "MCAT: Revision checkpoint and weak-topic review";
  }
  if (rule.daily_task_type === "CARS microdose") {
    if (topic.toLowerCase().includes("baseline")) return "MCAT: One untimed CARS passage";
    return `MCAT: ${titleCaseTopic(topic)} microdose`;
  }
  if (rule.daily_task_type === "practice questions") {
    if (weekIndex >= 9) return "MCAT: Simulated mixed foundation block";
    return `MCAT: ${titleCaseTopic(topic)} practice questions`;
  }
  if (rule.daily_task_type === "error log") {
    if (rule.estimated_minutes <= 30) return "MCAT: Weekly error cleanup";
    return `MCAT: ${titleCaseTopic(topic)} weak-topic review`;
  }
  if (rule.daily_task_type === "review / recovery microdose") {
    if (rule.estimated_minutes <= 30) return "MCAT: Light review and next-week plan";
    return "MCAT: Mixed foundation review";
  }
  if (topic.toLowerCase().includes("biology")) return "MCAT: Biology foundation pass";
  if (topic.toLowerCase().includes("psychology")) return "MCAT: Psychology/sociology foundation pass";
  if (topic.toLowerCase().includes("chem")) return `MCAT: ${titleCaseTopic(topic)} foundation session`;
  return `MCAT: ${titleCaseTopic(topic)} foundation session`;
}

function buildTaskDescription(rule: McatPhase0DayRule, topic: string) {
  if (rule.daily_task_type === "diagnostic checkpoint") {
    return "Controlled MCAT checkpoint. Complete a short mixed diagnostic block, review misses immediately, and decide the next-phase revision priorities. Success = one honest score signal, three error patterns logged, and a clear next-phase adjustment.";
  }
  if (rule.daily_task_type === "CARS microdose") {
    return `Foundation-first MCAT CARS block. Work one untimed passage focused on ${topic}, write the main idea before checking answers, and tag any miss by reasoning error. Success = one passage completed and one CARS pattern recorded.`;
  }
  if (rule.daily_task_type === "practice questions") {
    return `Foundation-first MCAT practice block. Use ChatGPT Study Mode as the tutor; Khan Academy is the syllabus and backup; log misses to the error log. Complete a short ${topic} question set, review every miss, and connect each miss to the underlying concept. Success = questions attempted, misses explained, and the error log updated.`;
  }
  if (rule.daily_task_type === "error log") {
    return `Foundation-first MCAT error-log block. Review ${topic}, rewrite the highest-leverage miss in plain English, and choose one retest item. Success = one weak pattern tightened and one follow-up question queued.`;
  }
  if (rule.daily_task_type === "review / recovery microdose") {
    return "Light MCAT recovery review. Skim the week's notes, clean one loose concept, and plan the next study block without turning this into a heavy session. Success = one note clarified and the next action chosen.";
  }
  return `Foundation-first MCAT block. Use ChatGPT Study Mode as the tutor; Khan Academy is the syllabus and backup; log misses to the error log. Review ${topic}, complete a short active-recall pass, and log any missed concept in the error log. Success = one clear concept learned and one error pattern recorded.`;
}

function dailyRoleForRule(rule: McatPhase0DayRule, weekIndex: number): DailyRole {
  if (rule.daily_task_type === "diagnostic checkpoint") return "Must Do";
  if (weekIndex >= 9 && (rule.daily_task_type === "practice questions" || rule.daily_task_type === "error log")) {
    return "Must Do";
  }
  if (rule.daily_task_type === "practice questions" && rule.estimated_minutes >= 75) return "Must Do";
  if (rule.estimated_minutes <= 30 || rule.weekday === "Sun") return "Maintenance";
  return "Should Do";
}

function priorityForRule(rule: McatPhase0DayRule, weekIndex: number): TaskPriority {
  if (rule.daily_task_type === "diagnostic checkpoint" || weekIndex >= 9) return "high";
  if (rule.estimated_minutes <= 30) return "medium";
  if (rule.daily_task_type === "foundation study" || rule.daily_task_type === "practice questions") return "high";
  return "medium";
}

function consequenceForRule(rule: McatPhase0DayRule, weekIndex: number): ConsequenceLevel {
  if (rule.daily_task_type === "diagnostic checkpoint" || weekIndex >= 9) return "high";
  return "medium";
}

function energyForRule(rule: McatPhase0DayRule) {
  if (rule.daily_task_type === "diagnostic checkpoint") return 7;
  if (rule.estimated_minutes <= 30) return 4;
  if (rule.daily_task_type === "CARS microdose" || rule.daily_task_type === "error log") return 5;
  if (rule.daily_task_type === "practice questions") return 6;
  return rule.estimated_minutes >= 75 ? 7 : 6;
}

function resistanceForRule(rule: McatPhase0DayRule) {
  if (rule.daily_task_type === "diagnostic checkpoint") return 6;
  if (rule.estimated_minutes <= 30) return 3;
  if (rule.daily_task_type === "practice questions" || rule.daily_task_type === "error log") return 5;
  return 4;
}

function statusForDueDate(dueDate: string, today: string): CanonicalTaskStatus {
  if (dueDate === today) return "today";
  if (startOfMondayWeek(dueDate) === startOfMondayWeek(today)) return "this_week";
  return "scheduled";
}

function buildWeekPlan(seedStartDate: string, weekIndex: number): McatPhase0WeekPlan | null {
  const target = MCAT_PHASE_0_TEMPLATE.weekly_minute_targets[weekIndex - 1];
  const topics = MCAT_PHASE_0_TEMPLATE.topic_rotation[weekIndex - 1];
  if (!target || !topics) return null;

  const startDate = addDays(seedStartDate, (weekIndex - 1) * 7);
  const rules = MCAT_PHASE_0_TEMPLATE.daily_distribution_rules[target];
  const days = rules.map((rule, dayOffset) => ({
    ...rule,
    due_date: addDays(startDate, dayOffset),
    template_day_index: (weekIndex - 1) * 7 + dayOffset + 1,
  }));

  return {
    week_index: weekIndex,
    start_date: startDate,
    end_date: addDays(startDate, 6),
    target_minutes: target,
    topics: [...topics],
    days,
  };
}

function buildTaskForDay(
  seedStartDate: string,
  dayIndex: number,
  options: { today?: string; planInstanceId?: string | null } = {},
): McatPhase0TaskPayload {
  const weekIndex = Math.floor((dayIndex - 1) / 7) + 1;
  const dayOffset = (dayIndex - 1) % 7;
  const weekPlan = buildWeekPlan(seedStartDate, weekIndex);
  if (!weekPlan) throw new Error(`Invalid MCAT Phase 0 week index: ${weekIndex}`);
  const rule = weekPlan.days[dayOffset];
  const topic = resolveTopic(rule, weekIndex, weekPlan.topics);
  const dueDate = rule.due_date;
  const today = options.today ?? localTodayKey();
  const title = buildTaskTitle(rule, topic, weekIndex);
  const description = buildTaskDescription(rule, topic);
  const seedEndDate = getSeedEndDate(seedStartDate);

  return {
    title,
    description,
    task_type: "MCAT",
    due_date: dueDate,
    estimated_minutes: rule.estimated_minutes,
    energy_required: energyForRule(rule),
    resistance_level: resistanceForRule(rule),
    urgency: weekIndex >= 9 ? 7 : rule.estimated_minutes <= 30 ? 3 : 5,
    importance: weekIndex >= 9 ? 8 : 7,
    consequence_if_delayed: weekIndex >= 9 ? 8 : 5,
    trust_impact: weekIndex >= 9 ? 8 : 6,
    time_efficiency: rule.estimated_minutes <= 30 ? 6 : 7,
    priority: priorityForRule(rule, weekIndex),
    consequence_level: consequenceForRule(rule, weekIndex),
    status: statusForDueDate(dueDate, today),
    daily_role: dailyRoleForRule(rule, weekIndex),
    notes: [
      `${MCAT_PHASE_0_TEMPLATE.phase_name}.`,
      `Template ${MCAT_PHASE_0_TEMPLATE.template_key}; day ${dayIndex} of 70; week ${weekIndex} of 10.`,
      `Week target ${weekPlan.target_minutes} minutes; learning type ${rule.daily_task_type}; topic focus ${topic}.`,
      "Update MCAT review notes or the error log before marking done.",
    ].join(" "),
    source: MCAT_PHASE_0_SOURCE,
    template_key: MCAT_PHASE_0_TEMPLATE_KEY,
    template_day_index: dayIndex,
    template_week_index: weekIndex,
    template_phase: MCAT_PHASE_0_TEMPLATE.phase_name,
    generated_from: {
      template_key: MCAT_PHASE_0_TEMPLATE_KEY,
      source: MCAT_PHASE_0_SOURCE,
      phase_name: MCAT_PHASE_0_TEMPLATE.phase_name,
      version: 1,
      planned_date: dueDate,
      week_target_minutes: weekPlan.target_minutes,
      daily_task_type: rule.daily_task_type,
      learning_type: rule.daily_task_type,
      topic_focus: topic,
      seed_start_date: seedStartDate,
      seed_end_date: seedEndDate,
      plan_instance_id: options.planInstanceId ?? null,
      learning_loop: MCAT_PHASE_0_LEARNING_LOOP,
      not_yet_learned_subjects: MCAT_NOT_YET_LEARNED_SUBJECTS,
    },
  };
}

export function getMcatPhase0WeekPlan(
  seedStartDate: string,
  input: number | string,
): McatPhase0WeekPlan | null {
  const weekIndex =
    typeof input === "number" ? input : getWeekIndexForDate(seedStartDate, input);
  if (weekIndex == null) return null;
  if (weekIndex < 1 || weekIndex > 10) return null;
  return buildWeekPlan(seedStartDate, weekIndex);
}

export function getMcatPhase0TaskForDate(
  seedStartDate: string,
  dateKey: string,
  options: { today?: string; planInstanceId?: string | null } = {},
): McatPhase0TaskPayload | null {
  const dayIndex = getDayIndexForDate(seedStartDate, dateKey);
  return dayIndex == null ? null : buildTaskForDay(seedStartDate, dayIndex, options);
}

export function generateMcatPhase0Tasks(
  seedStartDate: string,
  options: { today?: string; planInstanceId?: string | null } = {},
): McatPhase0TaskPayload[] {
  return Array.from({ length: TOTAL_DAYS }, (_, index) =>
    buildTaskForDay(seedStartDate, index + 1, options),
  );
}

function isMcatPhase0Task(task: Task) {
  return task.source === MCAT_PHASE_0_SOURCE && task.template_key === MCAT_PHASE_0_TEMPLATE_KEY;
}

export function getMissingMcatPhase0Tasks(
  existingTasks: Task[],
  seedStartDate: string,
  options: { today?: string; planInstanceId?: string | null } = {},
) {
  const existingDayIndexes = new Set(
    existingTasks
      .filter(isMcatPhase0Task)
      .map((task) => task.template_day_index)
      .filter((dayIndex): dayIndex is number => Number.isInteger(dayIndex)),
  );
  return generateMcatPhase0Tasks(seedStartDate, options).filter(
    (task) => !existingDayIndexes.has(task.template_day_index ?? -1),
  );
}

export function summarizeMcatPhase0SeedStatus(
  existingTasks: Task[],
  seedStartDate: string,
  options: { today?: string } = {},
): McatPhase0SeedSummary {
  const generatedTasks = generateMcatPhase0Tasks(seedStartDate, options);
  const existingGeneratedTasks = existingTasks.filter(isMcatPhase0Task);
  const existingByDay = new Map<number, Task>();
  let duplicateTemplateDayCount = 0;

  for (const task of existingGeneratedTasks) {
    if (!Number.isInteger(task.template_day_index)) continue;
    const dayIndex = task.template_day_index as number;
    if (existingByDay.has(dayIndex)) duplicateTemplateDayCount += 1;
    else existingByDay.set(dayIndex, task);
  }

  const completedTaskCount = [...existingByDay.values()].filter((task) =>
    isDoneStatus(task.status),
  ).length;
  const remainingPlannedMinutes = generatedTasks.reduce((sum, task) => {
    const dayIndex = task.template_day_index ?? -1;
    const existing = existingByDay.get(dayIndex);
    if (existing && isDoneStatus(existing.status)) return sum;
    return sum + (task.estimated_minutes ?? 0);
  }, 0);
  const missingTaskCount = generatedTasks.length - existingByDay.size;
  const today = options.today ?? localTodayKey();
  const currentWeekPlan = getMcatPhase0WeekPlan(seedStartDate, today);
  const isFullySeeded = missingTaskCount === 0;
  const hasPartialSeed = existingByDay.size > 0 && !isFullySeeded;

  return {
    templateKey: MCAT_PHASE_0_TEMPLATE_KEY,
    source: MCAT_PHASE_0_SOURCE,
    phaseName: MCAT_PHASE_0_TEMPLATE.phase_name,
    totalTaskCount: generatedTasks.length,
    totalPlannedMinutes: MCAT_PHASE_0_TEMPLATE.total_planned_minutes,
    seededTaskCount: existingByDay.size,
    completedTaskCount,
    missingTaskCount,
    duplicateTemplateDayCount,
    remainingPlannedMinutes,
    currentWeekIndex: currentWeekPlan?.week_index ?? null,
    currentWeekTargetMinutes: currentWeekPlan?.target_minutes ?? null,
    isFullySeeded,
    hasPartialSeed,
    statusLabel: isFullySeeded
      ? "Schedule already seeded"
      : hasPartialSeed
        ? "Some generated tasks are missing"
        : "Not seeded",
  };
}
