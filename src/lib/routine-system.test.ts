import { describe, expect, it } from "vitest";
import { makeTask, type Task } from "@/lib/task-system";
import {
  LIFE_ROUTINE_TEMPLATES,
  ROUTINE_SOURCE,
  generateRoutineTaskDates,
  generateRoutineTasks,
  getMissingRoutineTasks,
  summarizeRoutineSeedStatus,
  type RoutineTemplate,
} from "@/lib/routine-system";

const TODAY = "2026-05-18"; // Monday
const START = TODAY;

function getTemplate(key: string): RoutineTemplate {
  const t = LIFE_ROUTINE_TEMPLATES.find((x) => x.template_key === key);
  if (!t) throw new Error(`missing template ${key}`);
  return t;
}

describe("routine-system", () => {
  it("daily template generates 14 dates for default horizon", () => {
    const tpl = getTemplate("faith_daily_reading_v1");
    const dates = generateRoutineTaskDates(tpl, START, { today: TODAY });
    expect(dates).toHaveLength(14);
    expect(dates[0]).toBe(TODAY);
  });

  it("weekly template generates 8 dates across 8-week horizon on the preferred weekday", () => {
    const tpl = getTemplate("money_weekly_check_v1");
    const dates = generateRoutineTaskDates(tpl, "2026-05-17", { today: "2026-05-17" });
    expect(dates.length).toBe(8);
    // All dates fall on Sunday (UTC weekday 0)
    for (const d of dates) {
      const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
      expect(wd).toBe(0);
    }
  });

  it("four_x_week with default [1,3,5,6] generates 8 dates over 14-day horizon", () => {
    const tpl = getTemplate("depth_learning_v1");
    const dates = generateRoutineTaskDates(tpl, START, { today: TODAY });
    // Mon(1), Wed(3), Fri(5), Sat(6) across 2 weeks => 8
    expect(dates.length).toBe(8);
    for (const d of dates) {
      const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
      expect([1, 3, 5, 6]).toContain(wd);
    }
  });

  it("five_x_week skips weekends", () => {
    const tpl: RoutineTemplate = {
      ...getTemplate("faith_daily_reading_v1"),
      template_key: "test_five_x_v1",
      cadence: "five_x_week",
    };
    const dates = generateRoutineTaskDates(tpl, START, { today: TODAY });
    for (const d of dates) {
      const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
      expect(wd).not.toBe(0);
      expect(wd).not.toBe(6);
    }
    expect(dates.length).toBe(10);
  });

  it("getMissingRoutineTasks skips dates already present in existingTasks", () => {
    const tpl = getTemplate("faith_daily_reading_v1");
    const all = generateRoutineTasks(tpl, START, { today: TODAY });
    expect(all.length).toBe(14);
    const existing: Task[] = [makeTask(all[0]), makeTask(all[3])];
    const missing = getMissingRoutineTasks(tpl, existing, START, { today: TODAY });
    expect(missing.length).toBe(12);
    const missingDates = new Set(missing.map((m) => m.due_date));
    expect(missingDates.has(all[0].due_date)).toBe(false);
    expect(missingDates.has(all[3].due_date)).toBe(false);
  });

  it("payload carries correct source, template_key, and occurrence_index", () => {
    const tpl = getTemplate("faith_daily_reading_v1");
    const all = generateRoutineTasks(tpl, START, { today: TODAY });
    all.forEach((p, idx) => {
      expect(p.source).toBe(ROUTINE_SOURCE);
      expect(p.template_key).toBe(tpl.template_key);
      expect((p.generated_from as Record<string, unknown>).occurrence_index).toBe(idx);
    });
  });

  it("workout templates: exactly one, weekly, optional, no daily workouts", () => {
    const workouts = LIFE_ROUTINE_TEMPLATES.filter((t) => t.domain === "Workout");
    expect(workouts.length).toBe(1);
    expect(workouts[0].cadence).toBe("weekly");
    expect(workouts[0].optional).toBe(true);
    for (const w of workouts) {
      expect(w.cadence).not.toBe("daily");
    }
  });

  it("workout planner produces only weekly planning tasks", () => {
    const tpl = getTemplate("workout_weekly_plan_v1");
    const tasks = generateRoutineTasks(tpl, "2026-05-17", { today: "2026-05-17" });
    expect(tasks.length).toBe(8);
    for (const t of tasks) {
      expect(t.title.toLowerCase()).toContain("plan training week");
    }
  });

  it("summarizeRoutineSeedStatus reports completed/missing/next correctly", () => {
    const tpl = getTemplate("faith_daily_reading_v1");
    const all = generateRoutineTasks(tpl, START, { today: TODAY });
    // existing: first done, second present (not done). 12 missing.
    const existing: Task[] = [
      makeTask({ ...all[0], status: "done", completed_at: "2026-05-18T10:00:00Z" }),
      makeTask(all[1]),
    ];
    const status = summarizeRoutineSeedStatus(tpl, existing, START, { today: TODAY });
    expect(status.expected_count).toBe(14);
    expect(status.generated_count).toBe(2);
    expect(status.missing_count).toBe(12);
    expect(status.completed_count).toBe(1);
    expect(status.next_occurrence_date).toBe(all[2].due_date);
  });
});
