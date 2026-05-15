import { describe, expect, it } from "vitest";
import { makeAnchor, makeTimeBlock } from "@/lib/calendar-system";
import { makeTask, type Task } from "@/lib/task-system";
import {
  buildScheduleImportPreview,
  parseScheduleImport,
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
