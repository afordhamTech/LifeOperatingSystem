// Lifeee Calendar — fixed anchors + flexible tasks + energy limits + reality.
// Stored in localStorage so the app stays usable without auth.
// Backend table names (calendar_anchors, time_blocks, recurring_loops,
// task_calendar_links, daily_plans) are intentional placeholders for a future
// Supabase migration — nothing here should be assumed to exist server-side yet.

import type { Task, DayPlan } from "@/lib/task-system";

export const ANCHOR_CATEGORIES = [
  "Academic",
  "Connex",
  "Work",
  "Family",
  "Household",
  "Health",
  "Workout",
  "Nutrition",
  "Money",
  "Faith",
  "Relationship",
  "Career",
  "MCAT",
  "Admin",
  "Personal",
  "Recovery",
] as const;
export type AnchorCategory = (typeof ANCHOR_CATEGORIES)[number];

export const PRIVACY_LEVELS = ["Private", "Mentor Shareable", "Public Proof"] as const;
export type PrivacyLevel = (typeof PRIVACY_LEVELS)[number];

export type CalendarAnchor = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  category: AnchorCategory;
  location: string;
  link: string;
  people: string;
  prep: string;
  follow_up: string;
  notes: string;
  privacy: PrivacyLevel;
  recurring: boolean;
  created_at: string;
  updated_at: string;
};

const STORAGE_KEY = "lifeee.calendar.anchors.v1";

function readAll(): CalendarAnchor[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CalendarAnchor[]) : [];
  } catch {
    return [];
  }
}

function writeAll(anchors: CalendarAnchor[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(anchors));
}

export function loadAnchors(): CalendarAnchor[] {
  return readAll();
}

export function saveAnchors(anchors: CalendarAnchor[]) {
  writeAll(anchors);
}

export function makeAnchor(
  partial: Partial<CalendarAnchor> & { title: string; date: string; start_time: string },
): CalendarAnchor {
  const now = new Date().toISOString();
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `a_${Math.random().toString(36).slice(2)}_${Date.now()}`,
    title: partial.title,
    date: partial.date,
    start_time: partial.start_time,
    end_time: partial.end_time ?? addMinutesToTime(partial.start_time, 60),
    category: partial.category ?? "Personal",
    location: partial.location ?? "",
    link: partial.link ?? "",
    people: partial.people ?? "",
    prep: partial.prep ?? "",
    follow_up: partial.follow_up ?? "",
    notes: partial.notes ?? "",
    privacy: partial.privacy ?? "Private",
    recurring: partial.recurring ?? false,
    created_at: now,
    updated_at: now,
  };
}

// ─── Time utilities ─────────────────────────────────────────────────────────

export function parseTimeToMinutes(time: string): number {
  if (!time) return 0;
  const [hStr = "0", mStr = "0"] = time.split(":");
  const h = Number(hStr) || 0;
  const m = Number(mStr) || 0;
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const safe = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function addMinutesToTime(time: string, delta: number): string {
  return minutesToTime(parseTimeToMinutes(time) + delta);
}

export function anchorDuration(anchor: CalendarAnchor): number {
  return Math.max(0, parseTimeToMinutes(anchor.end_time) - parseTimeToMinutes(anchor.start_time));
}

export const CATEGORY_COLORS: Record<AnchorCategory, { bg: string; text: string; ring: string }> = {
  Academic: { bg: "bg-sky-100", text: "text-sky-800", ring: "ring-sky-200" },
  Connex: { bg: "bg-violet-100", text: "text-violet-800", ring: "ring-violet-200" },
  Work: { bg: "bg-slate-100", text: "text-slate-800", ring: "ring-slate-200" },
  Family: { bg: "bg-amber-100", text: "text-amber-800", ring: "ring-amber-200" },
  Household: { bg: "bg-stone-100", text: "text-stone-800", ring: "ring-stone-200" },
  Health: { bg: "bg-rose-100", text: "text-rose-800", ring: "ring-rose-200" },
  Workout: { bg: "bg-emerald-100", text: "text-emerald-800", ring: "ring-emerald-200" },
  Nutrition: { bg: "bg-lime-100", text: "text-lime-800", ring: "ring-lime-200" },
  Money: { bg: "bg-yellow-100", text: "text-yellow-800", ring: "ring-yellow-200" },
  Faith: { bg: "bg-indigo-100", text: "text-indigo-800", ring: "ring-indigo-200" },
  Relationship: { bg: "bg-pink-100", text: "text-pink-800", ring: "ring-pink-200" },
  Career: { bg: "bg-blue-100", text: "text-blue-800", ring: "ring-blue-200" },
  MCAT: { bg: "bg-cyan-100", text: "text-cyan-800", ring: "ring-cyan-200" },
  Admin: { bg: "bg-zinc-100", text: "text-zinc-800", ring: "ring-zinc-200" },
  Personal: { bg: "bg-neutral-100", text: "text-neutral-800", ring: "ring-neutral-200" },
  Recovery: { bg: "bg-teal-100", text: "text-teal-800", ring: "ring-teal-200" },
};

// ─── Available time + window suggestions ────────────────────────────────────

export type WindowSuggestion = {
  start: string;
  end: string;
  durationMinutes: number;
};

export type AvailableTime = {
  totalOpenMinutes: number;
  largestOpenBlock: WindowSuggestion | null;
  bestDeepWork: WindowSuggestion | null;
  bestWorkout: WindowSuggestion | null;
  bestShutdownTarget: string;
  openBlocks: WindowSuggestion[];
};

export type AvailableTimeOptions = {
  wakeTime?: string; // HH:MM
  sleepTime?: string; // HH:MM
  requiredMaintenanceMinutes?: number; // chores, hygiene, meals
  recoveryBufferMinutes?: number;
  sleepDebtHours?: number;
};

const DEFAULT_OPTS: Required<AvailableTimeOptions> = {
  wakeTime: "07:00",
  sleepTime: "23:00",
  requiredMaintenanceMinutes: 90,
  recoveryBufferMinutes: 60,
  sleepDebtHours: 0,
};

function mergeOpts(opts: AvailableTimeOptions = {}): Required<AvailableTimeOptions> {
  return { ...DEFAULT_OPTS, ...opts };
}

export function calculateAvailableTime(
  anchors: CalendarAnchor[],
  options: AvailableTimeOptions = {},
): AvailableTime {
  const opts = mergeOpts(options);
  const wake = parseTimeToMinutes(opts.wakeTime);
  const sleep = parseTimeToMinutes(opts.sleepTime);
  const dayStart = wake;
  const dayEnd = sleep;

  const sortedAnchors = [...anchors]
    .filter((a) => parseTimeToMinutes(a.end_time) > dayStart && parseTimeToMinutes(a.start_time) < dayEnd)
    .sort((a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time));

  const openBlocks: WindowSuggestion[] = [];
  let cursor = dayStart;
  for (const a of sortedAnchors) {
    const aStart = Math.max(dayStart, parseTimeToMinutes(a.start_time));
    const aEnd = Math.min(dayEnd, parseTimeToMinutes(a.end_time));
    if (aStart > cursor) {
      openBlocks.push({
        start: minutesToTime(cursor),
        end: minutesToTime(aStart),
        durationMinutes: aStart - cursor,
      });
    }
    cursor = Math.max(cursor, aEnd);
  }
  if (cursor < dayEnd) {
    openBlocks.push({
      start: minutesToTime(cursor),
      end: minutesToTime(dayEnd),
      durationMinutes: dayEnd - cursor,
    });
  }

  const filteredOpenBlocks = openBlocks.filter((b) => b.durationMinutes >= 15);

  const totalOpenMinutes = Math.max(
    0,
    filteredOpenBlocks.reduce((sum, b) => sum + b.durationMinutes, 0)
      - opts.requiredMaintenanceMinutes
      - opts.recoveryBufferMinutes,
  );

  const largestOpenBlock = [...filteredOpenBlocks].sort(
    (a, b) => b.durationMinutes - a.durationMinutes,
  )[0] ?? null;

  // Deep work: prefer morning blocks (start before 13:00) of >= 60 min.
  const morningBlocks = filteredOpenBlocks.filter(
    (b) => parseTimeToMinutes(b.start) < 13 * 60 && b.durationMinutes >= 60,
  );
  const bestDeepWork =
    morningBlocks.sort((a, b) => b.durationMinutes - a.durationMinutes)[0] ??
    largestOpenBlock;

  // Workout: prefer afternoon block of >= 45 min that isn't the same as deep work.
  const afternoonBlocks = filteredOpenBlocks.filter(
    (b) =>
      parseTimeToMinutes(b.start) >= 12 * 60 &&
      parseTimeToMinutes(b.start) < 19 * 60 &&
      b.durationMinutes >= 45,
  );
  const bestWorkout =
    afternoonBlocks.find((b) => b !== bestDeepWork) ??
    afternoonBlocks[0] ??
    null;

  // Shutdown target: pull earlier when sleep debt is high.
  const baseShutdown = parseTimeToMinutes(opts.sleepTime) - 30;
  const debtPull = Math.min(90, Math.max(0, opts.sleepDebtHours * 30));
  const shutdownMinutes = Math.max(dayStart + 60, baseShutdown - debtPull);

  return {
    totalOpenMinutes,
    largestOpenBlock,
    bestDeepWork,
    bestWorkout,
    bestShutdownTarget: minutesToTime(shutdownMinutes),
    openBlocks: filteredOpenBlocks,
  };
}

// ─── Conflict detection ─────────────────────────────────────────────────────

export type Conflict = { a: CalendarAnchor; b: CalendarAnchor };

export function detectConflicts(anchors: CalendarAnchor[]): Conflict[] {
  const sorted = [...anchors].sort(
    (a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time),
  );
  const conflicts: Conflict[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (!a) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (!b) continue;
      if (a.date !== b.date) continue;
      const aEnd = parseTimeToMinutes(a.end_time);
      const bStart = parseTimeToMinutes(b.start_time);
      if (bStart < aEnd) conflicts.push({ a, b });
    }
  }
  return conflicts;
}

// ─── Plan reality score ─────────────────────────────────────────────────────

export type RealityInputs = {
  available: AvailableTime;
  plan: DayPlan;
  currentEnergy: number; // 1-10
  sleepReadiness: number; // 1-10
  academicPressure: number; // 1-10
  workoutReadiness: number; // 1-10
};

export type RealityScore = {
  score: number; // 0-10
  available_time_fit: number; // 0-10
  energy_fit: number; // 0-10
  priority_focus: number; // 0-10
  recovery_protection: number; // 0-10
  recommendations: string[];
};

function clamp(v: number, lo = 0, hi = 10) {
  return Math.max(lo, Math.min(hi, v));
}

function totalEstimatedMinutes(tasks: Task[]): number {
  return tasks.reduce((sum, t) => sum + (t.estimated_minutes || 0), 0);
}

export function calculateRealityScore(input: RealityInputs): RealityScore {
  const { available, plan, currentEnergy, sleepReadiness, workoutReadiness } = input;

  const requested =
    totalEstimatedMinutes(plan.mustDo) +
    totalEstimatedMinutes(plan.shouldDo) +
    totalEstimatedMinutes(plan.maintenance) +
    totalEstimatedMinutes(plan.quickWins);
  const open = Math.max(1, available.totalOpenMinutes);
  const ratio = requested / open;
  // 1.0 ratio = 7/10. Lower is better, but very low also wastes time.
  const fit = ratio <= 0.6 ? 9 : ratio <= 1.0 ? 7.5 - (ratio - 0.6) * 6 : Math.max(0, 7.5 - (ratio - 1.0) * 12);
  const available_time_fit = clamp(fit);

  const avgEnergyRequired = plan.mustDo.concat(plan.shouldDo).reduce(
    (sum, t, _, arr) => sum + t.energy_required / Math.max(1, arr.length),
    0,
  ) || 5;
  const energyDiff = avgEnergyRequired - currentEnergy;
  const energy_fit = clamp(10 - Math.max(0, energyDiff) * 1.5);

  const priority_focus = plan.mustDo.length === 0
    ? 4
    : plan.mustDo.length <= 2
      ? 9
      : plan.mustDo.length <= 4
        ? 6
        : 3;

  const recoveryRatio = (sleepReadiness + workoutReadiness) / 2;
  const recovery_protection = clamp(recoveryRatio);

  const score = clamp(
    available_time_fit * 0.35 +
      energy_fit * 0.25 +
      priority_focus * 0.25 +
      recovery_protection * 0.15,
  );

  const recommendations: string[] = [];
  if (ratio > 1.1) recommendations.push("This plan is overloaded — cut one Should Do or move it to tomorrow.");
  if (plan.mustDo.length > 3) recommendations.push("Too many Must Dos. Pick the one that has to happen and protect it.");
  if (plan.mustDo.length === 0) recommendations.push("No Must Do set. Pick the decisive task before everything else.");
  if (currentEnergy < 4 && avgEnergyRequired > 6) recommendations.push("High-energy tasks while energy is low — front-load with a quick win or a recovery block.");
  if (sleepReadiness > 0 && sleepReadiness < 5) recommendations.push("Sleep readiness is low. Skip the heavy workout or shorten it.");
  if (recommendations.length === 0) recommendations.push("Plan looks realistic. Keep only anchors, must do, maintenance, and recovery if it slips.");

  return {
    score,
    available_time_fit,
    energy_fit,
    priority_focus,
    recovery_protection,
    recommendations,
  };
}

// ─── Recurring life loops (scaffold) ────────────────────────────────────────

export type RecurringLoop = {
  id: string;
  title: string;
  trigger: string;
  cadence: string;
  steps: string[];
  expected_output: string;
  next_occurrence: string;
};

export function listRecurringLoops(today = new Date()): RecurringLoop[] {
  const day = today.getDay();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() + ((7 - day) % 7 || 7));
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return [
    {
      id: "morning-launch",
      title: "Morning Launch",
      trigger: "Wake-up",
      cadence: "Daily",
      steps: ["Hydrate", "Read top 3 priorities", "Pick the Must Do", "Set energy + mood"],
      expected_output: "Day plan locked before 10 AM",
      next_occurrence: "Tomorrow morning",
    },
    {
      id: "night-shutdown",
      title: "Night Shutdown",
      trigger: "End of day",
      cadence: "Daily",
      steps: ["Close laptop", "Clear inbox to zero", "Review tomorrow's anchors", "Lights out target"],
      expected_output: "Sleep window protected",
      next_occurrence: "Tonight",
    },
    {
      id: "weekly-review",
      title: "Weekly Review",
      trigger: "Sunday afternoon",
      cadence: "Weekly",
      steps: ["Score the week", "Capture biggest win", "Capture biggest leak", "Set next week's anchors"],
      expected_output: "Weekly Life Score saved",
      next_occurrence: fmt(sunday),
    },
    {
      id: "monthly-reset",
      title: "Monthly Reset",
      trigger: "Last weekend of the month",
      cadence: "Monthly",
      steps: ["Archive completed tasks", "Refresh roles", "Re-pick the one big bet"],
      expected_output: "Clean board for next month",
      next_occurrence: fmt(monthEnd),
    },
    {
      id: "semester-review",
      title: "Semester Review",
      trigger: "End of semester",
      cadence: "Per term",
      steps: ["GPA pull", "Class debrief", "Decide what to keep and what to cut"],
      expected_output: "Semester verdict saved",
      next_occurrence: "End of term",
    },
    {
      id: "mcat-retest-loop",
      title: "MCAT Retest Loop",
      trigger: "After each practice block",
      cadence: "Per block",
      steps: ["Score block", "Mark weak topics", "Schedule a single retest before moving on"],
      expected_output: "Foundation gaps closed",
      next_occurrence: "After next MCAT block",
    },
    {
      id: "workout-progression",
      title: "Workout Progression Loop",
      trigger: "Every 4 weeks",
      cadence: "Mesocycle",
      steps: ["Review training log", "Bump weights or volume", "Plan next deload"],
      expected_output: "Progressive overload signal",
      next_occurrence: "Next deload window",
    },
    {
      id: "project-review",
      title: "Project Review",
      trigger: "Friday wrap",
      cadence: "Weekly",
      steps: ["Update project status", "Send notes", "Identify the next concrete move"],
      expected_output: "Projects unblocked into Monday",
      next_occurrence: fmt(sunday),
    },
  ];
}

// ─── Today timeline ─────────────────────────────────────────────────────────

export type TimelineSlot = {
  start: string;
  end: string;
  label: string;
  detail?: string;
  kind: "anchor" | "deep-work" | "workout" | "maintenance" | "shutdown" | "open";
  category?: AnchorCategory;
  durationMinutes: number;
};

export function buildTodayTimeline(
  anchors: CalendarAnchor[],
  available: AvailableTime,
  options: AvailableTimeOptions = {},
): TimelineSlot[] {
  const opts = mergeOpts(options);
  const slots: TimelineSlot[] = [];

  for (const a of anchors) {
    slots.push({
      start: a.start_time,
      end: a.end_time,
      label: a.title,
      detail: a.location || a.link || a.people || undefined,
      kind: "anchor",
      category: a.category,
      durationMinutes: anchorDuration(a),
    });
  }

  if (available.bestDeepWork) {
    slots.push({
      start: available.bestDeepWork.start,
      end: available.bestDeepWork.end,
      label: "Suggested deep work",
      detail: "Hardest work — phone away",
      kind: "deep-work",
      durationMinutes: available.bestDeepWork.durationMinutes,
    });
  }

  if (available.bestWorkout) {
    slots.push({
      start: available.bestWorkout.start,
      end: available.bestWorkout.end,
      label: "Suggested workout",
      detail: "Train if readiness is OK",
      kind: "workout",
      durationMinutes: available.bestWorkout.durationMinutes,
    });
  }

  // Light maintenance suggestion if there is space late afternoon.
  const lateAfternoon = available.openBlocks.find(
    (b) =>
      parseTimeToMinutes(b.start) >= 16 * 60 &&
      parseTimeToMinutes(b.start) < 20 * 60 &&
      b.durationMinutes >= 20,
  );
  if (lateAfternoon) {
    const end = addMinutesToTime(lateAfternoon.start, Math.min(20, lateAfternoon.durationMinutes));
    slots.push({
      start: lateAfternoon.start,
      end,
      label: "Maintenance + reset",
      detail: "Quick wins, dishes, errands",
      kind: "maintenance",
      durationMinutes: parseTimeToMinutes(end) - parseTimeToMinutes(lateAfternoon.start),
    });
  }

  slots.push({
    start: available.bestShutdownTarget,
    end: opts.sleepTime,
    label: "Shutdown",
    detail: "Phone down, lights out",
    kind: "shutdown",
    durationMinutes: Math.max(
      0,
      parseTimeToMinutes(opts.sleepTime) - parseTimeToMinutes(available.bestShutdownTarget),
    ),
  });

  return slots.sort((a, b) => parseTimeToMinutes(a.start) - parseTimeToMinutes(b.start));
}

// ─── Prompts ────────────────────────────────────────────────────────────────

export type CalendarPromptContext = {
  date: string;
  anchors: CalendarAnchor[];
  available: AvailableTime;
  plan: DayPlan;
  currentEnergy: number;
  sleepReadiness: number;
  academicPressure: number;
  workoutReadiness: number;
  mcatNextMove: string;
};

function listAnchors(anchors: CalendarAnchor[]): string {
  if (anchors.length === 0) return "- none";
  return anchors
    .map(
      (a) =>
        `- ${a.start_time}–${a.end_time} ${a.title} (${a.category}${a.location ? `, ${a.location}` : ""})`,
    )
    .join("\n");
}

function listBlocks(blocks: WindowSuggestion[]): string {
  if (blocks.length === 0) return "- none";
  return blocks.map((b) => `- ${b.start}–${b.end} (${b.durationMinutes} min)`).join("\n");
}

function listTasks(tasks: Task[]): string {
  if (tasks.length === 0) return "- none";
  return tasks
    .map(
      (t) =>
        `- ${t.title} · ${t.task_type} · ~${t.estimated_minutes}m · u${t.urgency}/i${t.importance}`,
    )
    .join("\n");
}

export function buildCalendarPlanningPrompt(ctx: CalendarPromptContext): string {
  const trustTasks = ctx.plan.quickWins
    .concat(ctx.plan.maintenance)
    .filter((t) => t.trust_impact >= 6);
  const recovery = ctx.plan.maintenance.filter(
    (t) => t.task_type === "Health" || t.task_type === "Personal",
  );

  return `Here is my Lifeee calendar and task context:

Date: ${ctx.date}

Fixed anchors:
${listAnchors(ctx.anchors)}

Open time blocks:
${listBlocks(ctx.available.openBlocks)}

Tasks:
Must Do:
${listTasks(ctx.plan.mustDo)}
Should Do:
${listTasks(ctx.plan.shouldDo)}
Maintenance:
${listTasks(ctx.plan.maintenance)}
Quick Wins:
${listTasks(ctx.plan.quickWins)}

Deadlines:
${listTasks(
  [...ctx.plan.mustDo, ...ctx.plan.shouldDo].filter((t) => t.due_date),
)}

Energy: ${ctx.currentEnergy}/10
Sleep readiness: ${ctx.sleepReadiness}/10
Academic pressure: ${ctx.academicPressure}/10
Workout readiness: ${ctx.workoutReadiness}/10

MCAT next move: ${ctx.mcatNextMove}

Trust tasks:
${listTasks(trustTasks)}

Recovery needs:
${listTasks(recovery)}

Build me a realistic day schedule.
Sort items into anchors, must do, should do, maintenance, quick wins, and ignore today.
Find the best study block, best workout block, and shutdown time.
Tell me what is overloaded and what to move.`;
}

export type WeeklyReviewContext = {
  weekStart: string;
  anchors: CalendarAnchor[];
  completedTasks: Task[];
  missedTasks: Task[];
  overloadedDays: string[];
  bestWorkBlocks: string[];
  worstWorkBlocks: string[];
  sleepEnergyPattern: string;
  meetings: CalendarAnchor[];
  prepFailures: string[];
  followUpFailures: string[];
  movedTasks: Task[];
};

export function buildWeeklyCalendarReviewPrompt(ctx: WeeklyReviewContext): string {
  return `Here is my Lifeee weekly calendar review:

Week of: ${ctx.weekStart}

Fixed anchors:
${listAnchors(ctx.anchors)}

Completed tasks:
${listTasks(ctx.completedTasks)}

Missed tasks:
${listTasks(ctx.missedTasks)}

Overloaded days:
${ctx.overloadedDays.length ? ctx.overloadedDays.map((d) => `- ${d}`).join("\n") : "- none"}

Best work blocks:
${ctx.bestWorkBlocks.length ? ctx.bestWorkBlocks.map((b) => `- ${b}`).join("\n") : "- none captured"}

Worst work blocks:
${ctx.worstWorkBlocks.length ? ctx.worstWorkBlocks.map((b) => `- ${b}`).join("\n") : "- none captured"}

Sleep and energy patterns:
${ctx.sleepEnergyPattern || "- not captured"}

Meetings:
${listAnchors(ctx.meetings)}

Prep failures:
${ctx.prepFailures.length ? ctx.prepFailures.map((p) => `- ${p}`).join("\n") : "- none"}

Follow up failures:
${ctx.followUpFailures.length ? ctx.followUpFailures.map((p) => `- ${p}`).join("\n") : "- none"}

Tasks moved repeatedly:
${listTasks(ctx.movedTasks)}

Analyze my week.
Find my real scheduling bottleneck.
Tell me what to change next week.
Create a realistic weekly structure.`;
}
