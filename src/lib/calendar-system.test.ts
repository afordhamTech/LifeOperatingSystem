import { describe, expect, it } from "vitest";
import {
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
      anchors,
      available: calculateAvailableTime(anchors),
      plan: buildDayPlan(tasks, 7, TODAY),
      currentEnergy: 7,
      mood: "steady",
      sleepReadiness: 6,
      academicPressure: 8,
      workoutReadiness: 5,
      mcatNextMove: "Review amino acids",
    });

    expect(prompt).toContain("Date: 2026-05-14");
    expect(prompt).toContain("Current time: 2026-05-14 08:30");
    expect(prompt).toContain("Shutdown target:");
    expect(prompt).toContain("Fixed anchors:");
    expect(prompt).toContain("Open windows:");
    expect(prompt).toContain("TASK-0001 | Submit lab report | Academic | 90 min | high | critical | due 2026-05-14");
    expect(prompt).toContain("TASK-0002 | Dishes reset | Household | Estimate missing | Priority unset | Consequence unset");
    expect(prompt).not.toContain("TASK-0003 | Parking lot idea");
    expect(prompt).not.toContain("TASK-0004 | Done task");
    expect(prompt).toContain("schedule table with time, task ID, task title, and reason");
    expect(prompt).toContain("plan realism score from 1 to 10");
  });
});
