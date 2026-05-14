import {
  parseTimeToMinutes,
  type CalendarAnchor,
  type TimeBlock,
} from "@/lib/calendar-system";
import type { Task } from "@/lib/task-system";

export type ScheduleImportBlock = {
  raw: string;
  start: string;
  end: string;
  task_code: string;
  imported_title: string;
  block_type: string;
  reason: string;
};

export type ScheduleImportNote = {
  raw: string;
  task_code: string;
  reason: string;
};

export type ScheduleFirstAction = {
  raw: string;
  task_code: string;
  text: string;
};

export type ScheduleImportUnparsedLine = {
  raw: string;
  section: string;
  reason: string;
};

export type ScheduleImportParsed = {
  schedule: ScheduleImportBlock[];
  unscheduled: ScheduleImportNote[];
  risks: ScheduleImportNote[];
  firstAction: ScheduleFirstAction | null;
  planRealism: {
    score: number | null;
    reason: string | null;
  };
  unparsed: ScheduleImportUnparsedLine[];
};

export type ScheduleImportPreviewStatus =
  | "matched"
  | "task not found"
  | "conflict"
  | "freeform block"
  | "break/recovery block"
  | "invalid line";

export type ScheduleImportPreviewRow = {
  raw: string;
  start: string;
  end: string;
  task_code: string;
  task_id: string | null;
  matched_task_title: string;
  imported_title: string;
  block_type: string;
  reason: string;
  status: ScheduleImportPreviewStatus;
  warnings: string[];
};

export type ScheduleImportPreview = {
  rows: ScheduleImportPreviewRow[];
  unscheduled: ScheduleImportNote[];
  risks: ScheduleImportNote[];
  firstAction: ScheduleFirstAction | null;
  planRealism: ScheduleImportParsed["planRealism"];
  hasBlockingIssues: boolean;
};

const KNOWN_SECTIONS = new Set([
  "SCHEDULE",
  "UNSCHEDULED",
  "RISKS",
  "FIRST_ACTION",
  "PLAN_REALISM",
]);

function stripBullet(line: string) {
  return line.replace(/^\s*[-*]\s*/, "").trim();
}

function normalizeTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parsePipePair(raw: string) {
  const clean = stripBullet(raw);
  const [code, ...rest] = clean.split("|").map((part) => part.trim());
  const reason = rest.join(" | ").trim();
  if (!code || !reason) return null;
  return { task_code: code, reason };
}

export function parseScheduleImport(text: string): ScheduleImportParsed {
  const parsed: ScheduleImportParsed = {
    schedule: [],
    unscheduled: [],
    risks: [],
    firstAction: null,
    planRealism: {
      score: null,
      reason: null,
    },
    unparsed: [],
  };
  let section = "SCHEDULE";

  for (const originalLine of text.split(/\r?\n/)) {
    const line = originalLine.trim();
    if (!line) continue;
    const heading = line.replace(/:$/, "").toUpperCase();
    if (KNOWN_SECTIONS.has(heading)) {
      section = heading;
      continue;
    }

    if (section === "SCHEDULE") {
      const clean = stripBullet(line);
      const parts = clean.split("|").map((part) => part.trim());
      const [timeRange, taskCode, importedTitle, blockType, ...reasonParts] = parts;
      const timeMatch = timeRange?.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
      const start = timeMatch ? normalizeTime(timeMatch[1]) : null;
      const end = timeMatch ? normalizeTime(timeMatch[2]) : null;
      const reason = reasonParts.join(" | ").trim();
      if (!start || !end || !taskCode || !importedTitle || !blockType || !reason) {
        parsed.unparsed.push({
          raw: line,
          section,
          reason: "Could not parse schedule line",
        });
        continue;
      }
      parsed.schedule.push({
        raw: line,
        start,
        end,
        task_code: taskCode,
        imported_title: importedTitle,
        block_type: blockType,
        reason,
      });
      continue;
    }

    if (section === "UNSCHEDULED") {
      const item = parsePipePair(line);
      if (!item) {
        parsed.unparsed.push({ raw: line, section, reason: "Could not parse unscheduled line" });
        continue;
      }
      parsed.unscheduled.push({ raw: line, ...item });
      continue;
    }

    if (section === "RISKS") {
      const item = parsePipePair(line);
      if (!item) {
        parsed.unparsed.push({ raw: line, section, reason: "Could not parse risk line" });
        continue;
      }
      parsed.risks.push({ raw: line, ...item });
      continue;
    }

    if (section === "FIRST_ACTION") {
      const item = parsePipePair(line);
      if (!item) {
        parsed.unparsed.push({ raw: line, section, reason: "Could not parse first action line" });
        continue;
      }
      parsed.firstAction = { raw: line, task_code: item.task_code, text: item.reason };
      continue;
    }

    if (section === "PLAN_REALISM") {
      const clean = stripBullet(line);
      const scoreMatch = clean.match(/^score:\s*(\d+(?:\.\d+)?)/i);
      if (scoreMatch) {
        parsed.planRealism.score = Number(scoreMatch[1]);
        continue;
      }
      const reasonMatch = clean.match(/^reason:\s*(.+)$/i);
      if (reasonMatch) {
        parsed.planRealism.reason = reasonMatch[1].trim();
        continue;
      }
      parsed.unparsed.push({ raw: line, section, reason: "Could not parse plan realism line" });
    }
  }

  return parsed;
}

function sameDayFromIso(value: string | null | undefined, date: string) {
  if (!value) return false;
  if (value.startsWith(date)) return true;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
    parsed.getDate(),
  ).padStart(2, "0")}` === date;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return parseTimeToMinutes(aStart) < parseTimeToMinutes(bEnd) &&
    parseTimeToMinutes(bStart) < parseTimeToMinutes(aEnd);
}

function statusForBlock(
  block: ScheduleImportBlock,
  task: Task | undefined,
  warnings: string[],
): ScheduleImportPreviewStatus {
  if (parseTimeToMinutes(block.end) <= parseTimeToMinutes(block.start)) return "invalid line";
  if (warnings.length > 0) return "conflict";
  const code = block.task_code.toUpperCase();
  const type = block.block_type.toLowerCase();
  if (code === "BREAK" || type.includes("break") || type.includes("recovery")) {
    return "break/recovery block";
  }
  if (code === "FREEFORM") return "freeform block";
  if (!task) return "task not found";
  return "matched";
}

export function buildScheduleImportPreview(input: {
  date: string;
  parsed: ScheduleImportParsed;
  tasks: Task[];
  anchors: CalendarAnchor[];
  existingTimeBlocks?: TimeBlock[];
}): ScheduleImportPreview {
  const rows: ScheduleImportPreviewRow[] = [];
  const taskByCode = new Map(input.tasks.map((task) => [task.task_code, task]));

  input.parsed.schedule.forEach((block, index) => {
    const warnings: string[] = [];
    const task = taskByCode.get(block.task_code);
    if (parseTimeToMinutes(block.end) <= parseTimeToMinutes(block.start)) {
      warnings.push("End time must be after start time");
    }

    input.parsed.schedule.forEach((other, otherIndex) => {
      if (otherIndex === index) return;
      if (parseTimeToMinutes(other.end) <= parseTimeToMinutes(other.start)) return;
      if (overlaps(block.start, block.end, other.start, other.end)) {
        warnings.push(`Overlaps imported block: ${other.imported_title}`);
      }
    });

    for (const anchor of input.anchors.filter((anchor) => anchor.date === input.date)) {
      if (overlaps(block.start, block.end, anchor.start_time, anchor.end_time)) {
        warnings.push(`Overlaps fixed anchor: ${anchor.title}`);
      }
    }

    for (const existing of (input.existingTimeBlocks ?? []).filter((item) => item.date === input.date)) {
      if (overlaps(block.start, block.end, existing.start_time, existing.end_time)) {
        warnings.push(`Overlaps existing time block: ${existing.title}`);
      }
    }

    if (
      task &&
      task.status === "scheduled" &&
      (sameDayFromIso(task.scheduled_start, input.date) ||
        sameDayFromIso(task.scheduled_end, input.date) ||
        task.due_date === input.date)
    ) {
      warnings.push(`Task already scheduled on ${input.date}`);
    }

    const status = statusForBlock(block, task, warnings);
    rows.push({
      raw: block.raw,
      start: block.start,
      end: block.end,
      task_code: block.task_code,
      task_id: task?.id ?? null,
      matched_task_title: task?.title ?? "",
      imported_title: block.imported_title,
      block_type: block.block_type,
      reason: block.reason,
      status,
      warnings,
    });
  });

  for (const line of input.parsed.unparsed) {
    rows.push({
      raw: line.raw,
      start: "",
      end: "",
      task_code: "",
      task_id: null,
      matched_task_title: "",
      imported_title: "",
      block_type: "",
      reason: line.reason,
      status: "invalid line",
      warnings: [line.reason],
    });
  }

  return {
    rows,
    unscheduled: input.parsed.unscheduled,
    risks: input.parsed.risks,
    firstAction: input.parsed.firstAction,
    planRealism: input.parsed.planRealism,
    hasBlockingIssues: rows.some((row) =>
      row.status === "invalid line" || row.status === "task not found" || row.status === "conflict",
    ),
  };
}

export function schedulePreviewRowsToApply(
  preview: ScheduleImportPreview,
  mode: "non-conflicting" | "include-soft-conflicts" = "non-conflicting",
) {
  return preview.rows.filter((row) => {
    if (row.status === "invalid line" || row.status === "task not found") return false;
    if (row.status === "conflict" && mode === "non-conflicting") return false;
    return row.start && row.end;
  });
}
