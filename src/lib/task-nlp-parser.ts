import {
  TASK_PRIORITIES,
  TASK_TYPES,
  type TaskPriority,
  type TaskType,
} from "@/lib/task-system";

export type ParsedTaskInput = {
  cleanedTitle: string;
  taskType?: TaskType;
  priority?: TaskPriority;
  estimatedMinutes?: number;
  dueDate?: string;
  fixedTime?: string;
  hashtags: string[];
};

const weekdayIndex: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function nextWeekday(baseDate: Date, weekday: number, forceNextWeek: boolean) {
  const current = baseDate.getDay();
  let days = (weekday - current + 7) % 7;
  if (days === 0 || forceNextWeek) days += 7;
  return addDays(baseDate, days);
}

function normalizeTaskType(tag: string): TaskType | undefined {
  const clean = tag.replace(/^#/, "").replace(/[-_]/g, " ").toLowerCase();
  return TASK_TYPES.find((type) => {
    const typeName = type.replace(/\/.*/, "").replace(/[-_]/g, " ").toLowerCase();
    return typeName === clean || type.toLowerCase() === clean;
  });
}

function normalizePriority(value: string): TaskPriority | undefined {
  const clean = value.toLowerCase();
  return TASK_PRIORITIES.find((priority) => priority.toLowerCase() === clean);
}

function normalizeClockTime(hourRaw: string, minuteRaw: string | undefined, suffix?: string) {
  let hour = Number(hourRaw);
  const minute = Number(minuteRaw ?? "0");
  const meridian = suffix?.toLowerCase();
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return undefined;
  if (meridian === "pm" && hour < 12) hour += 12;
  if (meridian === "am" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseTaskTitleInput(input: string, baseDate = new Date()): ParsedTaskInput {
  let cleaned = input;
  const hashtags = Array.from(input.matchAll(/#[A-Za-z][\w/-]*/g)).map((match) => match[0]);
  const taskType = hashtags.map(normalizeTaskType).find(Boolean);
  for (const tag of hashtags) cleaned = cleaned.replace(tag, " ");

  let priority: TaskPriority | undefined;
  cleaned = cleaned.replace(/!(critical|high|medium|low)\b/gi, (_token, raw: string) => {
    priority = normalizePriority(raw) ?? priority;
    return " ";
  });

  let estimatedMinutes: number | undefined;
  cleaned = cleaned.replace(
    /\b(?:for\s+)?(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/gi,
    (_token, amountRaw: string, unitRaw: string) => {
      const amount = Number(amountRaw);
      if (Number.isFinite(amount)) {
        estimatedMinutes = unitRaw.toLowerCase().startsWith("h")
          ? Math.round(amount * 60)
          : Math.round(amount);
      }
      return " ";
    },
  );

  let fixedTime: string | undefined;
  cleaned = cleaned.replace(
    /\bat\s+(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/gi,
    (_token, hour: string, minute: string | undefined, suffix: string) => {
      fixedTime = normalizeClockTime(hour, minute, suffix) ?? fixedTime;
      return " ";
    },
  );
  cleaned = cleaned.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (_token, hour: string, minute: string) => {
    fixedTime = normalizeClockTime(hour, minute) ?? fixedTime;
    return " ";
  });

  let dueDate: string | undefined;
  cleaned = cleaned.replace(/\bnext\s+week\b/i, () => {
    dueDate = formatDateKey(addDays(baseDate, 7));
    return " ";
  });
  cleaned = cleaned.replace(/\btomorrow\b/i, () => {
    dueDate = formatDateKey(addDays(baseDate, 1));
    return " ";
  });
  cleaned = cleaned.replace(/\btoday\b/i, () => {
    dueDate = formatDateKey(baseDate);
    return " ";
  });
  cleaned = cleaned.replace(
    /\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi,
    (_token, nextRaw: string | undefined, weekdayRaw: string) => {
      dueDate = formatDateKey(nextWeekday(baseDate, weekdayIndex[weekdayRaw.toLowerCase()], Boolean(nextRaw)));
      return " ";
    },
  );

  return {
    cleanedTitle: cleaned.replace(/\s+/g, " ").trim(),
    taskType,
    priority,
    estimatedMinutes,
    dueDate,
    fixedTime,
    hashtags,
  };
}
