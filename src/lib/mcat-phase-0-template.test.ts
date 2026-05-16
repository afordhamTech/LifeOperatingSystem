import { describe, expect, it } from "vitest";
import { makeTask, type Task } from "@/lib/task-system";
import {
  MCAT_PHASE_0_SOURCE,
  MCAT_PHASE_0_TEMPLATE,
  MCAT_PHASE_0_TEMPLATE_KEY,
  MCAT_PHASE_REGISTRY,
  generateMcatPhase0Tasks,
  getMcatPhase0TaskForDate,
  getMcatPhase0WeekPlan,
  getMissingMcatPhase0Tasks,
  summarizeMcatPhase0SeedStatus,
} from "@/lib/mcat-phase-0-template";

const SEED = "2026-05-14";
const TODAY = "2026-05-14";

function materialize(dayIndex: number, patch: Partial<Task> = {}) {
  const payload = generateMcatPhase0Tasks(SEED, { today: TODAY })[dayIndex - 1];
  return makeTask({ ...payload, ...patch });
}

describe("MCAT Phase 0 template generator", () => {
  it("keeps weekly and total planned minutes aligned with the Phase 0 plan", () => {
    const weekTotals = MCAT_PHASE_0_TEMPLATE.weekly_minute_targets.map((_, index) => {
      const plan = getMcatPhase0WeekPlan(SEED, index + 1);
      return plan?.days.reduce((sum, day) => sum + day.estimated_minutes, 0) ?? 0;
    });

    expect(weekTotals).toEqual(MCAT_PHASE_0_TEMPLATE.weekly_minute_targets);
    expect(weekTotals.reduce((sum, minutes) => sum + minutes, 0)).toBe(4680);
  });

  it("generates 70 tasks starting on the seed date", () => {
    const tasks = generateMcatPhase0Tasks(SEED, { today: TODAY });

    expect(tasks).toHaveLength(70);
    expect(tasks[0].due_date).toBe("2026-05-14");
    expect(tasks.at(-1)?.due_date).toBe("2026-07-22");
    expect(tasks.reduce((sum, task) => sum + task.estimated_minutes, 0)).toBe(4680);
    expect(tasks.every((task) => task.task_type === "MCAT")).toBe(true);
    expect(tasks.every((task) => task.due_date && task.estimated_minutes > 0)).toBe(true);
  });

  it("rolls the range when seeded on a later date", () => {
    const tasks = generateMcatPhase0Tasks("2026-06-01", { today: "2026-06-01" });
    expect(tasks[0].due_date).toBe("2026-06-01");
    expect(tasks.at(-1)?.due_date).toBe("2026-08-09");
  });

  it("anchors day 1 to the seed date and day 70 to seed + 69 days", () => {
    const tasks = generateMcatPhase0Tasks(SEED, { today: TODAY });
    expect(tasks[0].due_date).toBe(SEED);
    expect(tasks[69].due_date).toBe("2026-07-22");
  });

  it("adds template metadata and seed_start_date to every generated payload", () => {
    const tasks = generateMcatPhase0Tasks(SEED, { today: TODAY });

    expect(tasks.every((task) => task.source === MCAT_PHASE_0_SOURCE)).toBe(true);
    expect(tasks.every((task) => task.template_key === MCAT_PHASE_0_TEMPLATE_KEY)).toBe(true);
    expect(tasks.map((task) => task.template_day_index)).toEqual(
      Array.from({ length: 70 }, (_, index) => index + 1),
    );
    expect(tasks.every((task) => task.template_week_index >= 1 && task.template_week_index <= 10)).toBe(true);
    expect(tasks.every((task) => task.generated_from.template_key === MCAT_PHASE_0_TEMPLATE_KEY)).toBe(true);
    expect(tasks.every((task) => task.generated_from.seed_start_date === SEED)).toBe(true);
    expect(tasks.every((task) => task.generated_from.seed_end_date === "2026-07-22")).toBe(true);
  });

  it("keeps Sunday review lighter than main study days", () => {
    for (let weekIndex = 1; weekIndex <= 10; weekIndex += 1) {
      const plan = getMcatPhase0WeekPlan(SEED, weekIndex);
      expect(plan?.days.at(-1)?.estimated_minutes).toBeLessThan(
        plan?.days[0].estimated_minutes ?? 0,
      );
    }
  });

  it("includes the Week 10 diagnostic and revision checkpoint work", () => {
    const week10 = generateMcatPhase0Tasks(SEED, { today: TODAY }).filter(
      (task) => task.template_week_index === 10,
    );

    expect(week10.some((task) => task.title.includes("Controlled diagnostic checkpoint"))).toBe(true);
    expect(week10.some((task) => task.title.includes("Revision checkpoint"))).toBe(true);
  });

  it("finds a task by date without changing the template identity", () => {
    const task = getMcatPhase0TaskForDate(SEED, "2026-05-16", { today: "2026-05-16" });

    expect(task?.template_day_index).toBe(3);
    expect(task?.template_week_index).toBe(1);
    expect(task?.status).toBe("today");
  });

  it("resolves the current week from today relative to the seed date", () => {
    const plan = getMcatPhase0WeekPlan("2026-05-14", "2026-05-21");
    expect(plan?.week_index).toBe(2);
  });

  it("summarizes seeded status and missing tasks without duplicating existing days", () => {
    const day1 = materialize(1);
    const day2Done = materialize(2, { status: "done" });
    const duplicateDay1 = materialize(1, { title: "Duplicate day 1" });
    const existing = [day1, day2Done, duplicateDay1];
    const summary = summarizeMcatPhase0SeedStatus(existing, SEED, { today: TODAY });
    const missing = getMissingMcatPhase0Tasks(existing, SEED, { today: TODAY });

    expect(summary.seededTaskCount).toBe(2);
    expect(summary.completedTaskCount).toBe(1);
    expect(summary.missingTaskCount).toBe(68);
    expect(summary.duplicateTemplateDayCount).toBe(1);
    expect(missing.map((task) => task.template_day_index)).not.toContain(1);
    expect(missing.map((task) => task.template_day_index)).not.toContain(2);
    expect(missing).toHaveLength(68);
  });

  it("schedules 1–2 CARS microdoses per week", () => {
    const tasks = generateMcatPhase0Tasks(SEED, { today: TODAY });
    const byWeek = new Map<number, number>();
    for (const task of tasks) {
      if (task.generated_from.learning_type === "CARS microdose") {
        byWeek.set(task.template_week_index, (byWeek.get(task.template_week_index) ?? 0) + 1);
      }
    }
    for (let week = 1; week <= 10; week += 1) {
      const count = byWeek.get(week) ?? 0;
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it("propagates plan_instance_id into generated_from", () => {
    const tasks = generateMcatPhase0Tasks(SEED, {
      today: TODAY,
      planInstanceId: "abc-123",
    });
    expect(tasks[0].generated_from.plan_instance_id).toBe("abc-123");
    expect(tasks.every((task) => task.generated_from.plan_instance_id === "abc-123")).toBe(true);
  });

  it("aliases learning_type to daily_task_type for backwards compatibility", () => {
    const tasks = generateMcatPhase0Tasks(SEED, { today: TODAY });
    expect(tasks[0].generated_from.learning_type).toBe(tasks[0].generated_from.daily_task_type);
  });

  it("surfaces the not-yet-learned subjects vocabulary", () => {
    const tasks = generateMcatPhase0Tasks(SEED, { today: TODAY });
    const subjects = tasks[0].generated_from.not_yet_learned_subjects as readonly string[];
    expect(subjects).toContain("Organic Chemistry");
    expect(subjects).toContain("Physics");
  });

  it("registers exactly one active phase pointing at Phase 0", () => {
    const active = MCAT_PHASE_REGISTRY.filter((phase) => phase.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0].template_key).toBe(MCAT_PHASE_0_TEMPLATE_KEY);
  });

  it("includes the controlled diagnostic and revision/next-phase planning in Week 10", () => {
    const week10 = generateMcatPhase0Tasks(SEED, { today: TODAY }).filter(
      (task) => task.template_week_index === 10,
    );
    expect(
      week10.some(
        (task) =>
          task.title.includes("Controlled diagnostic checkpoint") ||
          task.generated_from.topic_focus === "controlled diagnostic",
      ),
    ).toBe(true);
    expect(
      week10.some(
        (task) =>
          task.title.includes("Revision checkpoint") ||
          task.generated_from.topic_focus === "revision checkpoint",
      ),
    ).toBe(true);
  });

  it("reports fully seeded when all 70 days are present", () => {
    const existing = Array.from({ length: 70 }, (_, index) => materialize(index + 1));
    const summary = summarizeMcatPhase0SeedStatus(existing, SEED, { today: TODAY });
    expect(summary.isFullySeeded).toBe(true);
    expect(summary.missingTaskCount).toBe(0);
    expect(summary.seededTaskCount).toBe(70);
  });
});
