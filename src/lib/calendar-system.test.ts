import { describe, expect, it } from "vitest";
import {
  buildPlanningExportValidation,
  buildCalendarPlanningPrompt,
  calculateAvailableTime,
  type CalendarAnchor,
} from "@/lib/calendar-system";
import { buildDayPlan, makeTask, type Task } from "@/lib/task-system";

const TODAY = "2026-05-14";

function task(partial: Partial<Task> & { title: string }): Task {
  return makeTask({
    task_code: `TASK-${partial.title.replace(/\W+/g, "").slice(0, 4)}`,
    ...partial,
  });
}

function anchor(partial: Partial<CalendarAnchor> & { title: string }): CalendarAnchor {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? "anchor-1",
    title: partial.title,
    date: partial.date ?? TODAY,
    start_time: partial.start_time ?? "09:00",
    end_time: partial.end_time ?? "10:00",
    category: partial.category ?? "Academic",
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

describe("calendar planning export contract", () => {
  it("exports structured task metadata with validation warnings and ChatGPT output rules", () => {
    const tasks = [
      task({
        title: "Submit lab report",
        task_code: "TASK-0001",
        task_type: "Academic",
        status: "today",
        daily_role: "Must Do",
        estimated_minutes: 90,
        priority: "high",
        consequence_level: "critical",
        due_date: TODAY,
        energy_required: 8,
        carry_forward_count: 2,
      }),
      task({
        title: "Dishes reset",
        task_code: "TASK-0002",
        task_type: "Household",
        status: "today",
        daily_role: "Quick Win",
        estimated_minutes: null,
        priority: null,
        consequence_level: null,
        energy_required: 2,
      }),
      task({
        title: "Parking lot idea",
        task_code: "TASK-0003",
        status: "parking_lot",
        daily_role: "Ignore Today",
      }),
      task({
        title: "Done task",
        task_code: "TASK-0004",
        status: "done",
      }),
    ];
    const anchors = [anchor({ title: "Class", start_time: "10:00", end_time: "11:15" })];
    const prompt = buildCalendarPlanningPrompt({
      date: TODAY,
      currentTime: "2026-05-14 08:30",
      operatingMode: "Protect Must Do",
      anchors,
      available: calculateAvailableTime(anchors),
      plan: buildDayPlan(tasks, 7, TODAY),
      currentEnergy: 7,
      mood: "steady",
      planRealityScore: 7.4,
      sleepReadiness: 6,
      academicPressure: 8,
      workoutReadiness: 5,
      mcatNextMove: "Review amino acids",
    });

    expect(prompt).toContain("Date: 2026-05-14");
    expect(prompt).toContain("Current time: 2026-05-14 08:30");
    expect(prompt).toContain("Shutdown target:");
    expect(prompt).toContain("Plan reality score: 7.4/10");
    expect(prompt).toContain("Daily operating mode: Protect Must Do");
    expect(prompt).toContain("Fixed anchors:");
    expect(prompt).toContain("- 10:00-11:15 | Class | Academic");
    expect(prompt).toContain("Open windows:");
    expect(prompt).toContain("TASK-0001 | id ");
    expect(prompt).toContain("TASK-0001 |");
    expect(prompt).toContain("title Submit lab report");
    expect(prompt).toContain("domain Academic");
    expect(prompt).toContain("status today");
    expect(prompt).toContain("daily_role Must Do");
    expect(prompt).toContain("estimated_minutes 90");
    expect(prompt).toContain("priority high");
    expect(prompt).toContain("consequence_level critical");
    expect(prompt).toContain("energy_required 8/10");
    expect(prompt).toContain("trust_impact 5/10");
    expect(prompt).toContain("carry_forward_count 2");
    expect(prompt).toContain("TASK-0002");
    expect(prompt).toContain("estimated_minutes Estimate missing");
    expect(prompt).toContain("priority Priority unset");
    expect(prompt).toContain("consequence_level Consequence unset");
    expect(prompt).not.toContain("TASK-0003 | Parking lot idea");
    expect(prompt).not.toContain("TASK-0004 | Done task");
    expect(prompt).toContain("SCHEDULE");
    expect(prompt).toContain("- 09:00-10:30 | TASK-20260514-001 | Finish Pickaxe | deep_work | reason");
    expect(prompt).toContain("- 10:30-10:45 | BREAK | Break | recovery | reason");
    expect(prompt).toContain("UNSCHEDULED");
    expect(prompt).toContain("FIRST_ACTION");
    expect(prompt).toContain("PLAN_REALISM");
    expect(prompt).toContain("- score: 1-10");
    expect(prompt).toContain("preserve task codes exactly");
  });

  it("builds a validation summary with blocking missing-code checks and non-blocking metadata warnings", () => {
    const tasks = [
      {
        ...task({
          title: "Missing code task",
          task_code: "TASK-MISSING",
          status: "today",
          daily_role: "Should Do",
          estimated_minutes: null,
          priority: null,
          consequence_level: null,
        }),
        task_code: "",
      },
    ];

    const validation = buildPlanningExportValidation({
      tasks,
      mustDo: [],
      availableMinutes: 30,
      ignoredExcludedCount: 1,
      parkingLotExcludedCount: 2,
      terminalExcludedCount: 3,
      openWindowCount: 0,
    });

    expect(validation.canExport).toBe(false);
    expect(validation.blockers).toEqual(["1 exported task(s) are missing task codes."]);
    expect(validation.warnings).toContain("Must Do missing.");
    expect(validation.warnings).toContain("No open windows detected.");
    expect(validation.warnings).toContain("1 task(s) marked Estimate missing.");
    expect(validation.warnings).toContain("1 task(s) marked Priority unset.");
    expect(validation.warnings).toContain("1 task(s) marked Consequence unset.");
    expect(validation.warnings).toContain("1 ignored item(s) excluded.");
    expect(validation.warnings).toContain("2 parking lot item(s) excluded.");
    expect(validation.warnings).toContain("3 done/archived/trashed item(s) excluded.");
  });
});
