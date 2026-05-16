import { describe, expect, it } from "vitest";
import { makeTask, type Task } from "@/lib/task-system";
import {
  MCAT_PHASE_0_SOURCE,
  MCAT_PHASE_0_TEMPLATE,
  MCAT_PHASE_0_TEMPLATE_KEY,
  generateMcatPhase0Tasks,
  getMcatPhase0TaskForDate,
  getMcatPhase0WeekPlan,
  getMissingMcatPhase0Tasks,
  summarizeMcatPhase0SeedStatus,
} from "@/lib/mcat-phase-0-template";

function materialize(dayIndex: number, patch: Partial<Task> = {}) {
  const payload = generateMcatPhase0Tasks({ today: "2026-05-16" })[dayIndex - 1];
  return makeTask({ ...payload, ...patch });
}

describe("MCAT Phase 0 template generator", () => {
  it("keeps weekly and total planned minutes aligned with the Phase 0 plan", () => {
    const weekTotals = MCAT_PHASE_0_TEMPLATE.weekly_minute_targets.map((_, index) => {
      const plan = getMcatPhase0WeekPlan(index + 1);
      return plan?.days.reduce((sum, day) => sum + day.estimated_minutes, 0) ?? 0;
    });

    expect(weekTotals).toEqual(MCAT_PHASE_0_TEMPLATE.weekly_minute_targets);
    expect(weekTotals.reduce((sum, minutes) => sum + minutes, 0)).toBe(4680);
  });

  it("generates one dated MCAT payload for every day in the date range", () => {
    const tasks = generateMcatPhase0Tasks({ today: "2026-05-16" });

    expect(tasks).toHaveLength(70);
    expect(tasks[0].due_date).toBe("2026-05-04");
    expect(tasks.at(-1)?.due_date).toBe("2026-07-12");
    expect(tasks.reduce((sum, task) => sum + task.estimated_minutes, 0)).toBe(4680);
    expect(tasks.every((task) => task.task_type === "MCAT")).toBe(true);
    expect(tasks.every((task) => task.due_date && task.estimated_minutes > 0)).toBe(true);
  });

  it("adds template metadata to every generated payload", () => {
    const tasks = generateMcatPhase0Tasks({ today: "2026-05-16" });

    expect(tasks.every((task) => task.source === MCAT_PHASE_0_SOURCE)).toBe(true);
    expect(tasks.every((task) => task.template_key === MCAT_PHASE_0_TEMPLATE_KEY)).toBe(true);
    expect(tasks.map((task) => task.template_day_index)).toEqual(
      Array.from({ length: 70 }, (_, index) => index + 1),
    );
    expect(tasks.every((task) => task.template_week_index >= 1 && task.template_week_index <= 10)).toBe(true);
    expect(tasks.every((task) => task.generated_from.template_key === MCAT_PHASE_0_TEMPLATE_KEY)).toBe(true);
  });

  it("keeps Sunday review lighter than main study days", () => {
    for (let weekIndex = 1; weekIndex <= 10; weekIndex += 1) {
      const plan = getMcatPhase0WeekPlan(weekIndex);
      expect(plan?.days.at(-1)?.estimated_minutes).toBeLessThan(
        plan?.days[0].estimated_minutes ?? 0,
      );
    }
  });

  it("includes the Week 10 diagnostic and revision checkpoint work", () => {
    const week10 = generateMcatPhase0Tasks({ today: "2026-05-16" }).filter(
      (task) => task.template_week_index === 10,
    );

    expect(week10.some((task) => task.title.includes("Controlled diagnostic checkpoint"))).toBe(true);
    expect(week10.some((task) => task.title.includes("Revision checkpoint"))).toBe(true);
  });

  it("finds a task by date without changing the template identity", () => {
    const task = getMcatPhase0TaskForDate("2026-05-16", { today: "2026-05-16" });

    expect(task?.template_day_index).toBe(13);
    expect(task?.template_week_index).toBe(2);
    expect(task?.status).toBe("today");
  });

  it("summarizes seeded status and missing tasks without duplicating existing days", () => {
    const day1 = materialize(1);
    const day2Done = materialize(2, { status: "done" });
    const duplicateDay1 = materialize(1, { title: "Duplicate day 1" });
    const existing = [day1, day2Done, duplicateDay1];
    const summary = summarizeMcatPhase0SeedStatus(existing, { today: "2026-05-16" });
    const missing = getMissingMcatPhase0Tasks(existing, { today: "2026-05-16" });

    expect(summary.seededTaskCount).toBe(2);
    expect(summary.completedTaskCount).toBe(1);
    expect(summary.missingTaskCount).toBe(68);
    expect(summary.duplicateTemplateDayCount).toBe(1);
    expect(missing.map((task) => task.template_day_index)).not.toContain(1);
    expect(missing.map((task) => task.template_day_index)).not.toContain(2);
    expect(missing).toHaveLength(68);
  });
});
