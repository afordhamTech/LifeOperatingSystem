import { describe, expect, it } from "vitest";
import {
  buildExportablePlanningSet,
  buildTaskSmartViews,
  changeTaskStatus,
  completeTask,
  createTask,
  ignoreTaskToday,
  makeTask,
  restoreTask,
  trashTask,
  updateTask,
  type Task,
} from "@/lib/task-system";

const TODAY = "2026-05-14";

function task(partial: Partial<Task> & { title: string }): Task {
  return makeTask({ task_code: `TASK-${partial.title.replace(/\W+/g, "").slice(0, 4)}`, ...partial });
}

describe("task system Phase 1A contract", () => {
  it("creates stable task codes that do not change when task titles change", () => {
    const created = createTask({
      title: "Submit lab report",
      task_type: "Academic",
      estimated_minutes: 45,
      priority: "high",
    });

    expect(created.id).toMatch(/[a-zA-Z0-9_-]+/);
    expect(created.task_code).toMatch(/^TASK-\d{8}-\d{3}$/);

    const renamed = updateTask(created, { title: "Submit final lab report" });

    expect(renamed.title).toBe("Submit final lab report");
    expect(renamed.task_code).toBe(created.task_code);
  });

  it("moves through ignore, done, trash, and restore without losing previous status", () => {
    const original = task({ title: "Pay tuition", status: "today" });
    const ignored = ignoreTaskToday(original, TODAY);

    expect(ignored.status).toBe("ignored_today");
    expect(ignored.previous_status).toBe("today");
    expect(ignored.ignored_until).toBe(TODAY);
    expect(ignored.ignored_count).toBe(1);

    const done = completeTask(ignored);
    expect(done.status).toBe("done");
    expect(done.completed_at).toBeTruthy();

    const trashed = trashTask(done);
    expect(trashed.status).toBe("trashed");
    expect(trashed.deleted_at).toBeTruthy();

    const restored = restoreTask(trashed);
    expect(restored.status).toBe("inbox");
    expect(restored.deleted_at).toBeNull();
    expect(restored.archived_at).toBeNull();
  });

  it("builds non-duplicating smart views from canonical tasks", () => {
    const inbox = task({ title: "Inbox only", status: "inbox" });
    const today = task({ title: "Today only", status: "today", priority: "high" });
    const scheduledToday = task({
      title: "Scheduled today",
      status: "scheduled",
      scheduled_start: `${TODAY}T15:00:00.000Z`,
    });
    const ignored = task({
      title: "Ignore this",
      status: "ignored_today",
      ignored_until: TODAY,
    });
    const parking = task({ title: "Someday", status: "parking_lot" });
    const drift = task({ title: "Keeps slipping", status: "this_week", carry_forward_count: 2 });
    const done = task({ title: "Already done", status: "done" });
    const views = buildTaskSmartViews(
      [inbox, today, scheduledToday, ignored, parking, drift, done],
      {
        today: TODAY,
        currentEnergy: 6,
      },
    );

    expect(views.inboxCandidates.map((t) => t.id)).toEqual([inbox.id]);
    expect(views.committedToday.map((t) => t.id)).toEqual([today.id, scheduledToday.id]);
    expect(views.ignoreToday.map((t) => t.id)).toEqual([ignored.id]);
    expect(views.parkingLot.map((t) => t.id)).toEqual([parking.id]);
    expect(views.driftRisk.map((t) => t.id)).toEqual([drift.id]);
    expect(views.exportablePlanningSet.map((t) => t.id)).not.toContain(done.id);
  });

  it("exports active planning tasks and excludes inactive lifecycle states", () => {
    const mustDo = task({
      title: "Finish FAFSA",
      status: "today",
      daily_role: "Must Do",
      task_code: "TASK-0001",
      estimated_minutes: null,
      priority: null,
      consequence_level: null,
    });
    const thisWeek = task({ title: "Outline essay", status: "this_week", task_code: "TASK-0002" });
    const parking = task({ title: "Future idea", status: "parking_lot", task_code: "TASK-0003" });
    const archived = task({ title: "Old task", status: "archived", task_code: "TASK-0004" });
    const trashed = task({ title: "Deleted task", status: "trashed", task_code: "TASK-0005" });

    const exportable = buildExportablePlanningSet(
      [mustDo, thisWeek, parking, archived, trashed],
      { today: TODAY, currentEnergy: 7 },
    );

    expect(exportable.map((t) => t.task_code)).toEqual(["TASK-0001", "TASK-0002"]);
    expect(changeTaskStatus(thisWeek, "waiting").previous_status).toBe("this_week");
  });
});
