import { describe, expect, it } from "vitest";
import {
  buildExportablePlanningSet,
  buildDayPlan,
  buildTaskSmartViews,
  buildTriagePrompt,
  changeTaskStatus,
  completeTask,
  createTask,
  ignoreTaskToday,
  isTaskVisibleInGeneralSurfaces,
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

  it("keeps old planned MCAT seed tasks out of normal task surfaces until active or committed", () => {
    const oldSeeded = task({
      title: "MCAT planned day 1",
      task_code: "TASK-MCAT-OLD",
      task_type: "MCAT",
      status: "today",
      daily_role: "Must Do",
      source: "mcat_phase_0_seed",
      template_key: "mcat_phase_0_foundation_v1",
      template_day_index: 1,
      estimated_minutes: 60,
      priority: "high",
    });
    const committed = task({
      title: "MCAT committed CARS",
      task_code: "TASK-MCAT-NEW",
      task_type: "MCAT",
      status: "today",
      daily_role: "Must Do",
      source: "mcat_committed_study",
      template_key: "mcat_phase_0_foundation_v1",
      template_day_index: 1,
      estimated_minutes: 60,
      priority: "high",
    });
    const active = task({
      title: "MCAT active CARS",
      task_code: "TASK-MCAT-ACTIVE",
      task_type: "MCAT",
      status: "today",
      daily_role: "Must Do",
      source: "mcat_active_study",
      template_key: "mcat_phase_0_foundation_v1",
      template_day_index: 2,
      estimated_minutes: 60,
      priority: "high",
    });
    const manualMcat = task({
      title: "Manual MCAT note review",
      task_code: "TASK-MCAT-MAN",
      task_type: "MCAT",
      status: "today",
      daily_role: "Should Do",
      source: "manual",
      estimated_minutes: 20,
    });
    const views = buildTaskSmartViews([oldSeeded, committed, active, manualMcat], {
      today: TODAY,
      currentEnergy: 7,
    });
    const plan = buildDayPlan([oldSeeded, committed, active, manualMcat], 7, TODAY);
    const prompt = buildTriagePrompt([oldSeeded, committed, active, manualMcat], 7);

    expect(isTaskVisibleInGeneralSurfaces(oldSeeded)).toBe(false);
    expect(isTaskVisibleInGeneralSurfaces(committed)).toBe(true);
    expect(isTaskVisibleInGeneralSurfaces(active)).toBe(true);
    expect(isTaskVisibleInGeneralSurfaces(manualMcat)).toBe(true);
    expect(views.committedToday.map((t) => t.task_code)).toEqual([
      "TASK-MCAT-NEW",
      "TASK-MCAT-ACTIVE",
      "TASK-MCAT-MAN",
    ]);
    expect(views.trustProtectors.map((t) => t.task_code)).not.toContain("TASK-MCAT-OLD");
    expect(buildExportablePlanningSet([oldSeeded, committed, active, manualMcat], { today: TODAY }).map((t) => t.task_code)).toEqual([
      "TASK-MCAT-NEW",
      "TASK-MCAT-ACTIVE",
      "TASK-MCAT-MAN",
    ]);
    expect([...plan.mustDo, ...plan.shouldDo].map((t) => t.task_code)).not.toContain(
      "TASK-MCAT-OLD",
    );
    expect(prompt).not.toContain("TASK-MCAT-OLD");
    expect(prompt).toContain("TASK-MCAT-NEW");
    expect(prompt).toContain("TASK-MCAT-ACTIVE");
  });
});
