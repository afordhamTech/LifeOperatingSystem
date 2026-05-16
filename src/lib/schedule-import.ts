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

// ── Editable preview rows ───────────────────────────────────────────────────
// Inline-editable representation of a parsed (or unparsed) row. Every edit
// keeps the original parsed values around for "reset to parsed".

export type EditableScheduleRow = {
  id: string;
  start: string;
  end: string;
  task_code: string;
  imported_title: string;
  block_type: string;
  reason: string;
  raw: string;
  isUnparsed: boolean;
  edited: boolean;
  original: {
    start: string;
    end: string;
    task_code: string;
    imported_title: string;
    block_type: string;
    reason: string;
    raw: string;
    isUnparsed: boolean;
  };
};

function makeRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `row_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function snapshotOriginal(row: Omit<EditableScheduleRow, "id" | "edited" | "original">) {
  return {
    start: row.start,
    end: row.end,
    task_code: row.task_code,
    imported_title: row.imported_title,
    block_type: row.block_type,
    reason: row.reason,
    raw: row.raw,
    isUnparsed: row.isUnparsed,
  };
}

export function editableRowsFromParsed(parsed: ScheduleImportParsed): EditableScheduleRow[] {
  const rows: EditableScheduleRow[] = parsed.schedule.map((block) => {
    const base = {
      start: block.start,
      end: block.end,
      task_code: block.task_code,
      imported_title: block.imported_title,
      block_type: block.block_type,
      reason: block.reason,
      raw: block.raw,
      isUnparsed: false,
    };
    return { id: makeRowId(), ...base, edited: false, original: snapshotOriginal(base) };
  });
  for (const line of parsed.unparsed.filter((u) => u.section === "SCHEDULE")) {
    const base = {
      start: "",
      end: "",
      task_code: "",
      imported_title: "",
      block_type: "",
      reason: line.reason,
      raw: line.raw,
      isUnparsed: true,
    };
    rows.push({ id: makeRowId(), ...base, edited: false, original: snapshotOriginal(base) });
  }
  return rows;
}

export function makeBlankEditableRow(seed?: Partial<EditableScheduleRow>): EditableScheduleRow {
  const base = {
    start: seed?.start ?? "",
    end: seed?.end ?? "",
    task_code: seed?.task_code ?? "",
    imported_title: seed?.imported_title ?? "",
    block_type: seed?.block_type ?? "",
    reason: seed?.reason ?? "",
    raw: seed?.raw ?? "",
    isUnparsed: false,
  };
  return { id: makeRowId(), ...base, edited: true, original: snapshotOriginal(base) };
}

export function rowMatchesOriginal(row: EditableScheduleRow): boolean {
  const o = row.original;
  return (
    row.start === o.start &&
    row.end === o.end &&
    row.task_code === o.task_code &&
    row.imported_title === o.imported_title &&
    row.block_type === o.block_type &&
    row.reason === o.reason &&
    row.isUnparsed === o.isUnparsed
  );
}

export function resetEditableRow(row: EditableScheduleRow): EditableScheduleRow {
  return {
    ...row,
    start: row.original.start,
    end: row.original.end,
    task_code: row.original.task_code,
    imported_title: row.original.imported_title,
    block_type: row.original.block_type,
    reason: row.original.reason,
    raw: row.original.raw,
    isUnparsed: row.original.isUnparsed,
    edited: false,
  };
}

export function serializeEditableRowsToScheduleText(rows: EditableScheduleRow[]): string {
  const lines = ["SCHEDULE"];
  const sorted = [...rows].sort((a, b) => {
    const aMin = a.start ? parseTimeToMinutes(a.start) : Number.POSITIVE_INFINITY;
    const bMin = b.start ? parseTimeToMinutes(b.start) : Number.POSITIVE_INFINITY;
    return aMin - bMin;
  });
  for (const row of sorted) {
    if (row.isUnparsed && !row.start && !row.end) {
      // Preserve unparsed lines verbatim so the user can fix them in-text.
      lines.push(row.raw || `# (unparsed) ${row.reason}`);
      continue;
    }
    const time = row.start && row.end ? `${row.start}-${row.end}` : "??:??-??:??";
    lines.push(
      `- ${time} | ${row.task_code || "FREEFORM"} | ${row.imported_title || ""} | ${
        row.block_type || ""
      } | ${row.reason || ""}`,
    );
  }
  return lines.join("\n");
}

function rowToValidationBlock(row: EditableScheduleRow): ScheduleImportBlock {
  return {
    raw: row.raw,
    start: row.start,
    end: row.end,
    task_code: row.task_code,
    imported_title: row.imported_title,
    block_type: row.block_type,
    reason: row.reason,
  };
}

function validateEditableRow(
  row: EditableScheduleRow,
  index: number,
  allRows: EditableScheduleRow[],
  ctx: {
    date: string;
    taskByCode: Map<string, Task>;
    anchors: CalendarAnchor[];
    existingTimeBlocks: TimeBlock[];
  },
): ScheduleImportPreviewRow {
  if (row.isUnparsed && !row.start && !row.end) {
    return {
      raw: row.raw,
      start: "",
      end: "",
      task_code: "",
      task_id: null,
      matched_task_title: "",
      imported_title: "",
      block_type: "",
      reason: row.reason,
      status: "invalid line",
      warnings: [row.reason || "Could not parse schedule line"],
    };
  }

  const warnings: string[] = [];
  const task = ctx.taskByCode.get(row.task_code);
  if (
    !row.start ||
    !row.end ||
    parseTimeToMinutes(row.end) <= parseTimeToMinutes(row.start)
  ) {
    warnings.push("End time must be after start time");
  } else {
    allRows.forEach((other, otherIndex) => {
      if (otherIndex === index) return;
      if (!other.start || !other.end) return;
      if (parseTimeToMinutes(other.end) <= parseTimeToMinutes(other.start)) return;
      if (overlaps(row.start, row.end, other.start, other.end)) {
        warnings.push(`Overlaps imported block: ${other.imported_title || other.task_code}`);
      }
    });

    for (const anchor of ctx.anchors.filter((anchor) => anchor.date === ctx.date)) {
      if (overlaps(row.start, row.end, anchor.start_time, anchor.end_time)) {
        warnings.push(`Overlaps fixed anchor: ${anchor.title}`);
      }
    }

    for (const existing of ctx.existingTimeBlocks.filter((item) => item.date === ctx.date)) {
      if (overlaps(row.start, row.end, existing.start_time, existing.end_time)) {
        warnings.push(`Overlaps existing time block: ${existing.title}`);
      }
    }
  }

  if (
    task &&
    task.status === "scheduled" &&
    (sameDayFromIso(task.scheduled_start, ctx.date) ||
      sameDayFromIso(task.scheduled_end, ctx.date) ||
      task.due_date === ctx.date)
  ) {
    warnings.push(`Task already scheduled on ${ctx.date}`);
  }

  const status = statusForBlock(rowToValidationBlock(row), task, warnings);
  return {
    raw: row.raw,
    start: row.start,
    end: row.end,
    task_code: row.task_code,
    task_id: task?.id ?? null,
    matched_task_title: task?.title ?? "",
    imported_title: row.imported_title,
    block_type: row.block_type,
    reason: row.reason,
    status,
    warnings,
  };
}

export function buildPreviewFromEditableRows(input: {
  date: string;
  rows: EditableScheduleRow[];
  tasks: Task[];
  anchors: CalendarAnchor[];
  existingTimeBlocks?: TimeBlock[];
  unscheduled?: ScheduleImportNote[];
  risks?: ScheduleImportNote[];
  firstAction?: ScheduleFirstAction | null;
  planRealism?: ScheduleImportParsed["planRealism"];
}): ScheduleImportPreview {
  const ctx = {
    date: input.date,
    taskByCode: new Map(input.tasks.map((task) => [task.task_code, task])),
    anchors: input.anchors,
    existingTimeBlocks: input.existingTimeBlocks ?? [],
  };
  const rows = input.rows.map((row, index) => validateEditableRow(row, index, input.rows, ctx));
  return {
    rows,
    unscheduled: input.unscheduled ?? [],
    risks: input.risks ?? [],
    firstAction: input.firstAction ?? null,
    planRealism: input.planRealism ?? { score: null, reason: null },
    hasBlockingIssues: rows.some(
      (row) =>
        row.status === "invalid line" ||
        row.status === "task not found" ||
        row.status === "conflict",
    ),
  };
}

export function buildScheduleImportPreview(input: {
  date: string;
  parsed: ScheduleImportParsed;
  tasks: Task[];
  anchors: CalendarAnchor[];
  existingTimeBlocks?: TimeBlock[];
}): ScheduleImportPreview {
  const rows = editableRowsFromParsed(input.parsed);
  return buildPreviewFromEditableRows({
    date: input.date,
    rows,
    tasks: input.tasks,
    anchors: input.anchors,
    existingTimeBlocks: input.existingTimeBlocks,
    unscheduled: input.parsed.unscheduled,
    risks: input.parsed.risks,
    firstAction: input.parsed.firstAction,
    planRealism: input.parsed.planRealism,
  });
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

export const SCHEDULE_BLOCK_TYPES = [
  "deep_work",
  "shallow",
  "meeting",
  "workout",
  "break",
  "recovery",
  "freeform",
  "admin",
  "focus",
] as const;
