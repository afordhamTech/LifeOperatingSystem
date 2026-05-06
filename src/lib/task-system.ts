// Lifeee Task Command — universal task model.
// Stored in localStorage so the app is usable without auth.
// Backend (Supabase) connection is intentionally not wired here yet.

export const TASK_TYPES = [
  "Academic",
  "Connex / Project",
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
  "waiting",
  "completed",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export type Task = {
  id: string;
  title: string;
  task_type: TaskType;
  due_date: string | null;
  estimated_minutes: number;
  energy_required: number; // 1-10
  urgency: number; // 1-10
  importance: number; // 1-10
  consequence_if_delayed: number; // 1-10
  trust_impact: number; // 1-10
  time_efficiency: number; // 1-10
  status: TaskStatus;
  daily_role: DailyRole | null;
  recurring: boolean;
  notes: string;
  fixed_time: string | null; // optional ISO time string for Anchor
  created_at: string;
  updated_at: string;
};

const STORAGE_KEY = "lifeee.tasks.v1";

function readAll(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Task[]) : [];
  } catch {
    return [];
  }
}

function writeAll(tasks: Task[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

export function loadTasks(): Task[] {
  return readAll();
}

export function saveTasks(tasks: Task[]) {
  writeAll(tasks);
}

export function makeTask(partial: Partial<Task> & { title: string }): Task {
  const now = new Date().toISOString();
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `t_${Math.random().toString(36).slice(2)}_${Date.now()}`,
    title: partial.title,
    task_type: partial.task_type ?? "Personal",
    due_date: partial.due_date ?? null,
    estimated_minutes: partial.estimated_minutes ?? 15,
    energy_required: partial.energy_required ?? 5,
    urgency: partial.urgency ?? 5,
    importance: partial.importance ?? 5,
    consequence_if_delayed: partial.consequence_if_delayed ?? 5,
    trust_impact: partial.trust_impact ?? 5,
    time_efficiency: partial.time_efficiency ?? 5,
    status: partial.status ?? "inbox",
    daily_role: partial.daily_role ?? null,
    recurring: partial.recurring ?? false,
    notes: partial.notes ?? "",
    fixed_time: partial.fixed_time ?? null,
    created_at: now,
    updated_at: now,
  };
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
  const energyMatch = energyMatchScore(currentEnergy, task.energy_required);
  return (
    task.urgency * 0.25 +
    task.consequence_if_delayed * 0.25 +
    task.importance * 0.2 +
    task.trust_impact * 0.15 +
    energyMatch * 0.1 +
    task.time_efficiency * 0.05
  );
}

// Auto-assign a daily role based on heuristics from the user's spec.
export function assignDailyRole(task: Task, currentEnergy: number): DailyRole {
  if (task.status === "completed") return "Ignore Today";
  if (task.status === "waiting") return "Waiting";

  if (task.fixed_time) return "Anchor";

  const priority = calcTaskPriority(task, currentEnergy);

  // Must Do: high urgency AND high consequence
  if (task.urgency >= 8 && task.consequence_if_delayed >= 8) return "Must Do";

  // Quick Win: short + high trust impact
  if (task.estimated_minutes <= 15 && task.trust_impact >= 6) return "Quick Win";

  // Maintenance: short, recurring, household-ish
  const maintenanceTypes: TaskType[] = [
    "Household",
    "Health",
    "Nutrition",
    "Workout",
    "Admin",
    "Personal",
  ];
  if (
    task.estimated_minutes <= 30 &&
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

export function buildDayPlan(tasks: Task[], currentEnergy: number): DayPlan {
  const live = tasks.filter((t) => t.status !== "completed");
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
  return plan;
}

export function buildTriagePrompt(tasks: Task[], currentEnergy: number): string {
  const live = tasks.filter((t) => t.status !== "completed");
  const lines = (fn: (t: Task) => string) => live.map(fn).join("\n");

  const calendarAnchors = live
    .filter((t) => t.fixed_time)
    .map((t) => `- ${t.title} @ ${t.fixed_time}`)
    .join("\n");

  return `Here is my Lifeee task inbox:

Tasks:
${lines((t) => `- ${t.title}`)}

Due dates:
${lines((t) => `- ${t.title}: ${t.due_date ?? "none"}`)}

Estimated time:
${lines((t) => `- ${t.title}: ${t.estimated_minutes} min`)}

Task types:
${lines((t) => `- ${t.title}: ${t.task_type}`)}

Urgency:
${lines((t) => `- ${t.title}: ${t.urgency}/10`)}

Importance:
${lines((t) => `- ${t.title}: ${t.importance}/10`)}

Consequence:
${lines((t) => `- ${t.title}: ${t.consequence_if_delayed}/10`)}

Trust impact:
${lines((t) => `- ${t.title}: ${t.trust_impact}/10`)}

Energy required:
${lines((t) => `- ${t.title}: ${t.energy_required}/10`)}

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
