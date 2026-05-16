import { describe, expect, it } from "vitest";
import { makeAnchor, makeTimeBlock } from "@/lib/calendar-system";
import { makeTask, type Task } from "@/lib/task-system";
import {
  buildPreviewFromEditableRows,
  buildScheduleImportPreview,
  editableRowsFromParsed,
  makeBlankEditableRow,
  parseScheduleImport,
  resetEditableRow,
  rowMatchesOriginal,
  schedulePreviewRowsToApply,
  serializeEditableRowsToScheduleText,
} from "@/lib/schedule-import";

const TODAY = "2026-05-14";

function task(partial: Partial<Task> & { title: string; task_code: string }) {
  return makeTask({
    task_type: "Academic",
    status: "today",
    daily_role: "Must Do",
    estimated_minutes: 60,
    priority: "high",
    consequence_level: "high",
    ...partial,
  });
}

describe("ChatGPT schedule import parser", () => {
  it("parses the required schedule, unscheduled, risks, first action, and realism format", () => {
    const parsed = parseScheduleImport(`SCHEDULE
- 09:00-10:30 | TASK-20260514-001 | Finish Pickaxe | deep_work | Protecting must do
- 11:00-11:15 | BREAK | Break | recovery | Prevent overload

UNSCHEDULED
- TASK-20260514-002 | Too much for today

RISKS
- TASK-20260514-003 | Overdue risk

FIRST_ACTION
- TASK-20260514-001 | Open the file

PLAN_REALISM
- score: 7
- reason: Tight but doable`);

    expect(parsed.schedule).toEqual([
      {
        raw: "- 09:00-10:30 | TASK-20260514-001 | Finish Pickaxe | deep_work | Protecting must do",
        start: "09:00",
        end: "10:30",
        task_code: "TASK-20260514-001",
        imported_title: "Finish Pickaxe",
        block_type: "deep_work",
        reason: "Protecting must do",
      },
      {
        raw: "- 11:00-11:15 | BREAK | Break | recovery | Prevent overload",
        start: "11:00",
        end: "11:15",
        task_code: "BREAK",
        imported_title: "Break",
        block_type: "recovery",
        reason: "Prevent overload",
      },
    ]);
    expect(parsed.unscheduled).toEqual([
      {
        raw: "- TASK-20260514-002 | Too much for today",
        task_code: "TASK-20260514-002",
        reason: "Too much for today",
      },
    ]);
    expect(parsed.risks).toEqual([
      {
        raw: "- TASK-20260514-003 | Overdue risk",
        task_code: "TASK-20260514-003",
        reason: "Overdue risk",
      },
    ]);
    expect(parsed.firstAction).toEqual({
      raw: "- TASK-20260514-001 | Open the file",
      task_code: "TASK-20260514-001",
      text: "Open the file",
    });
    expect(parsed.planRealism).toEqual({ score: 7, reason: "Tight but doable" });
    expect(parsed.unparsed).toEqual([]);
  });

  it("keeps unparsed lines visible instead of silently dropping them", () => {
    const parsed = parseScheduleImport(`SCHEDULE
- 09:00 TASK-20260514-001 missing pipes`);

    expect(parsed.schedule).toEqual([]);
    expect(parsed.unparsed).toEqual([
      {
        raw: "- 09:00 TASK-20260514-001 missing pipes",
        section: "SCHEDULE",
        reason: "Could not parse schedule line",
      },
    ]);
  });
});

describe("schedule import preview", () => {
  it("matches task codes, classifies taskless blocks, and detects conflicts", () => {
    const tasks = [
      task({ id: "task-1", task_code: "TASK-20260514-001", title: "Finish Pickaxe" }),
      task({
        id: "task-2",
        task_code: "TASK-20260514-002",
        title: "Already scheduled",
        status: "scheduled",
        scheduled_start: "2026-05-14T14:00:00.000Z",
        scheduled_end: "2026-05-14T15:00:00.000Z",
      }),
    ];
    const anchors = [
      makeAnchor({
        id: "anchor-1",
        title: "Class",
        date: TODAY,
        start_time: "10:00",
        end_time: "11:00",
      }),
    ];
    const existingTimeBlocks = [
      makeTimeBlock({
        id: "block-1",
        title: "Existing imported block",
        date: TODAY,
        start_time: "13:00",
        end_time: "13:30",
        block_type: "deep_work",
        source: "chatgpt_import",
      }),
    ];
    const parsed = parseScheduleImport(`SCHEDULE
- 09:00-10:30 | TASK-20260514-001 | Finish Pickaxe | deep_work | Protecting must do
- 11:00-11:15 | BREAK | Break | recovery | Prevent overload
- 11:30-12:00 | TASK-NOTFOUND | Missing | admin | Bad code
- 13:15-14:00 | FREEFORM | Email sweep | admin | Freeform cleanup
- 14:00-14:30 | TASK-20260514-002 | Already scheduled | deep_work | Duplicate schedule
- 15:00-14:30 | TASK-20260514-001 | Impossible | deep_work | End before start
- unparseable line`);

    const preview = buildScheduleImportPreview({
      date: TODAY,
      parsed,
      tasks,
      anchors,
      existingTimeBlocks,
    });

    expect(preview.rows.map((row) => row.status)).toEqual([
      "conflict",
      "break/recovery block",
      "task not found",
      "conflict",
      "conflict",
      "invalid line",
      "invalid line",
    ]);
    expect(preview.rows[0]?.matched_task_title).toBe("Finish Pickaxe");
    expect(preview.rows[0]?.warnings).toContain("Overlaps fixed anchor: Class");
    expect(preview.rows[3]?.warnings).toContain("Overlaps existing time block: Existing imported block");
    expect(preview.rows[4]?.warnings).toContain("Task already scheduled on 2026-05-14");
    expect(preview.rows[5]?.warnings).toContain("End time must be after start time");
    expect(preview.rows[6]?.raw).toBe("- unparseable line");
    expect(preview.hasBlockingIssues).toBe(true);
  });
});

describe("editable schedule rows", () => {
  const text = `SCHEDULE
- 09:00-10:00 | TASK-A | Title A | deep_work | reason A
- 10:00-11:00 | TASK-B | Title B | shallow | reason B
- broken line that wont parse`;

  function setup() {
    const parsed = parseScheduleImport(text);
    const rows = editableRowsFromParsed(parsed);
    const tasks = [
      task({ task_code: "TASK-A", title: "Real A" }),
      task({ task_code: "TASK-B", title: "Real B" }),
      task({ task_code: "TASK-C", title: "Real C" }),
    ];
    return { parsed, rows, tasks };
  }

  function previewFor(rows: ReturnType<typeof editableRowsFromParsed>, tasks: ReturnType<typeof setup>["tasks"]) {
    return buildPreviewFromEditableRows({
      date: TODAY,
      rows,
      tasks,
      anchors: [],
      existingTimeBlocks: [],
    });
  }

  it("editableRowsFromParsed gives unique ids and marks unparsed rows", () => {
    const { rows } = setup();
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.id)).size).toBe(3);
    expect(rows[2].isUnparsed).toBe(true);
    expect(rows[0].edited).toBe(false);
  });

  it("editing start/end time flips warnings and marks row edited", () => {
    const { rows, tasks } = setup();
    // Make row[1] overlap row[0] by moving start earlier.
    rows[1].start = "09:30";
    rows[1].edited = !rowMatchesOriginal(rows[1]);
    const preview = previewFor(rows, tasks);
    expect(rows[1].edited).toBe(true);
    expect(preview.rows[0].warnings.join(" ")).toMatch(/Overlaps imported block/);
    expect(preview.rows[1].warnings.join(" ")).toMatch(/Overlaps imported block/);
  });

  it("changing task_code to a known task rematches matched_task_title", () => {
    const { rows, tasks } = setup();
    rows[0].task_code = "TASK-C";
    rows[0].edited = !rowMatchesOriginal(rows[0]);
    const preview = previewFor(rows, tasks);
    expect(preview.rows[0].matched_task_title).toBe("Real C");
    expect(preview.rows[0].status).toBe("matched");
  });

  it("apply payload uses edited values, not original parse", () => {
    const { rows, tasks } = setup();
    rows[0].start = "08:00";
    rows[0].end = "08:45";
    rows[0].imported_title = "Edited title";
    rows[0].edited = !rowMatchesOriginal(rows[0]);
    const preview = previewFor(rows, tasks);
    const applyRows = schedulePreviewRowsToApply(preview, "non-conflicting");
    const applied = applyRows.find((r) => r.task_code === "TASK-A");
    expect(applied?.start).toBe("08:00");
    expect(applied?.end).toBe("08:45");
    expect(applied?.imported_title).toBe("Edited title");
  });

  it("deleting a row removes it from the apply payload", () => {
    const { rows, tasks } = setup();
    const remaining = rows.filter((r) => r.task_code !== "TASK-B");
    const preview = previewFor(remaining, tasks);
    const applyRows = schedulePreviewRowsToApply(preview, "non-conflicting");
    expect(applyRows.find((r) => r.task_code === "TASK-B")).toBeUndefined();
    expect(applyRows.some((r) => r.task_code === "TASK-A")).toBe(true);
  });

  it("duplicate produces a separate editable row with a fresh id", () => {
    const { rows } = setup();
    const copy = makeBlankEditableRow({
      start: rows[0].start,
      end: rows[0].end,
      task_code: rows[0].task_code,
      imported_title: rows[0].imported_title,
      block_type: rows[0].block_type,
      reason: rows[0].reason,
    });
    expect(copy.id).not.toBe(rows[0].id);
    expect(copy.start).toBe(rows[0].start);
    expect(copy.task_code).toBe(rows[0].task_code);
  });

  it("reset restores original parsed values and clears edited flag", () => {
    const { rows } = setup();
    rows[0].start = "06:00";
    rows[0].imported_title = "Mangled";
    rows[0].edited = !rowMatchesOriginal(rows[0]);
    const restored = resetEditableRow(rows[0]);
    expect(restored.start).toBe("09:00");
    expect(restored.imported_title).toBe("Title A");
    expect(restored.edited).toBe(false);
  });

  it("serializeEditableRowsToScheduleText round-trips edits back into parseable text", () => {
    const { rows, tasks } = setup();
    rows[0].start = "08:30";
    rows[0].end = "09:15";
    rows[0].imported_title = "Updated title";
    rows[0].edited = !rowMatchesOriginal(rows[0]);
    // Drop the unparsed row to keep the serialized text clean.
    const cleanRows = rows.filter((r) => !r.isUnparsed);
    const text2 = serializeEditableRowsToScheduleText(cleanRows);
    expect(text2).toContain("- 08:30-09:15 | TASK-A | Updated title | deep_work | reason A");
    const reparsed = parseScheduleImport(text2);
    expect(reparsed.schedule[0].start).toBe("08:30");
    expect(reparsed.schedule[0].imported_title).toBe("Updated title");
    const preview = buildPreviewFromEditableRows({
      date: TODAY,
      rows: editableRowsFromParsed(reparsed),
      tasks,
      anchors: [],
      existingTimeBlocks: [],
    });
    expect(preview.rows[0].start).toBe("08:30");
    expect(preview.rows[0].status).toBe("matched");
  });

  it("serializeEditableRowsToScheduleText preserves non-schedule sections when given parsed", () => {
    const { rows } = setup();
    const cleanRows = rows.filter((r) => !r.isUnparsed);
    const parsed = parseScheduleImport(
      [
        "SCHEDULE",
        "- 09:00-10:00 | TASK-A | Title A | deep_work | reason A",
        "",
        "UNSCHEDULED",
        "- TASK-Z | bumped due to overload",
        "",
        "RISKS",
        "- TASK-Y | might run long",
        "",
        "FIRST_ACTION",
        "- TASK-A | open the doc",
        "",
        "PLAN_REALISM",
        "- score: 7",
        "- reason: tight evening",
      ].join("\n"),
    );
    const text = serializeEditableRowsToScheduleText(cleanRows, parsed);
    expect(text).toContain("UNSCHEDULED");
    expect(text).toContain("- TASK-Z | bumped due to overload");
    expect(text).toContain("RISKS");
    expect(text).toContain("FIRST_ACTION");
    expect(text).toContain("PLAN_REALISM");
    expect(text).toContain("- score: 7");
    expect(text).toContain("- reason: tight evening");
    // Re-parse should preserve those sections too.
    const reparsed = parseScheduleImport(text);
    expect(reparsed.unscheduled).toHaveLength(1);
    expect(reparsed.risks).toHaveLength(1);
    expect(reparsed.firstAction?.task_code).toBe("TASK-A");
    expect(reparsed.planRealism.score).toBe(7);
  });

  it("raw text parse path still works (no editing required)", () => {
    const preview = buildScheduleImportPreview({
      date: TODAY,
      parsed: parseScheduleImport(text),
      tasks: [task({ task_code: "TASK-A", title: "Real A" })],
      anchors: [],
      existingTimeBlocks: [],
    });
    expect(preview.rows[0].task_code).toBe("TASK-A");
    expect(preview.rows[0].matched_task_title).toBe("Real A");
  });
});
