import { describe, expect, it } from "vitest";
import {
  MCAT_PHASE_0_SOURCE,
  MCAT_PHASE_0_TEMPLATE_KEY,
  generateMcatPhase0Tasks,
} from "@/lib/mcat-phase-0-template";
import { makeTask } from "@/lib/task-system";
import {
  MCAT_COMMITTED_STUDY_SOURCE,
  buildMcatTodayCommand,
  commitMcatPlanOccurrenceToTask,
  formatMcatAccuracyTrendLabel,
  generateMcatPhase0PlanOccurrences,
  summarizeMcatPlanOccurrenceStatus,
} from "@/lib/mcat-plan-occurrences";

const SEED = "2026-05-14";
const TODAY = "2026-05-14";

describe("MCAT plan occurrence boundary", () => {
  it("generates Phase 0 plan occurrences without creating universal task payloads", () => {
    const occurrences = generateMcatPhase0PlanOccurrences(SEED, {
      planInstanceId: "plan-1",
      today: TODAY,
    });

    expect(occurrences).toHaveLength(70);
    expect(occurrences[0]).toMatchObject({
      plan_instance_id: "plan-1",
      template_key: MCAT_PHASE_0_TEMPLATE_KEY,
      template_day_index: 1,
      template_week_index: 1,
      planned_date: TODAY,
      status: "planned",
      linked_task_id: null,
    });
    expect(occurrences[0]).not.toHaveProperty("task_type");
    expect(occurrences[0]).not.toHaveProperty("due_date");
    expect(occurrences.every((occurrence) => occurrence.estimated_minutes > 0)).toBe(true);
    expect(occurrences.reduce((sum, occurrence) => sum + occurrence.estimated_minutes, 0)).toBe(4680);
  });

  it("summarizes plan days, committed tasks, completion, and remaining minutes separately", () => {
    const occurrences = generateMcatPhase0PlanOccurrences(SEED, {
      planInstanceId: "plan-1",
      today: TODAY,
    }).map((occurrence, index) =>
      index === 0
        ? { ...occurrence, status: "committed" as const, linked_task_id: "task-1" }
        : index === 1
          ? { ...occurrence, status: "completed" as const, linked_task_id: "task-2" }
          : occurrence,
    );

    const summary = summarizeMcatPlanOccurrenceStatus(occurrences, { today: TODAY });

    expect(summary.generatedPlanDayCount).toBe(70);
    expect(summary.committedTaskCount).toBe(1);
    expect(summary.completedCount).toBe(1);
    expect(summary.remainingPlannedMinutes).toBe(4620);
    expect(summary.statusLabel).toBe("Phase 0 plan active");
  });

  it("committing one occurrence creates one committed MCAT universal task", () => {
    const [occurrence] = generateMcatPhase0PlanOccurrences(SEED, {
      planInstanceId: "plan-1",
      today: TODAY,
    });

    const result = commitMcatPlanOccurrenceToTask(occurrence, [], { today: TODAY });

    expect(result.created).toBe(true);
    expect(result.task.source).toBe(MCAT_COMMITTED_STUDY_SOURCE);
    expect(result.task.template_key).toBe(MCAT_PHASE_0_TEMPLATE_KEY);
    expect(result.task.template_day_index).toBe(1);
    expect(result.task.generated_from?.mcat_occurrence_id).toBe(occurrence.id);
    expect(result.occurrence.status).toBe("committed");
    expect(result.occurrence.linked_task_id).toBe(result.task.id);
  });

  it("recommitting the same occurrence does not duplicate the task", () => {
    const [occurrence] = generateMcatPhase0PlanOccurrences(SEED, {
      planInstanceId: "plan-1",
      today: TODAY,
    });
    const first = commitMcatPlanOccurrenceToTask(occurrence, [], { today: TODAY });
    const second = commitMcatPlanOccurrenceToTask(first.occurrence, [first.task], {
      today: TODAY,
    });

    expect(second.created).toBe(false);
    expect(second.task.id).toBe(first.task.id);
    expect(second.occurrence.linked_task_id).toBe(first.task.id);
  });

  it("adopts a matching old Phase 0 seeded task instead of duplicating it", () => {
    const [occurrence] = generateMcatPhase0PlanOccurrences(SEED, {
      planInstanceId: "plan-1",
      today: TODAY,
    });
    const oldSeededTask = makeTask({
      ...generateMcatPhase0Tasks(SEED, { today: TODAY, planInstanceId: "plan-1" })[0],
      id: "old-seeded-task",
      source: MCAT_PHASE_0_SOURCE,
      template_key: MCAT_PHASE_0_TEMPLATE_KEY,
    });

    const result = commitMcatPlanOccurrenceToTask(occurrence, [oldSeededTask], {
      today: TODAY,
    });

    expect(result.created).toBe(false);
    expect(result.task.id).toBe("old-seeded-task");
    expect(result.task.source).toBe(MCAT_COMMITTED_STUDY_SOURCE);
    expect(result.task.generated_from?.adopted_from_source).toBe(MCAT_PHASE_0_SOURCE);
    expect(result.occurrence.linked_task_id).toBe("old-seeded-task");
  });

  it("builds one clear MCAT command from today's occurrence", () => {
    const [occurrence] = generateMcatPhase0PlanOccurrences(SEED, {
      planInstanceId: "plan-1",
      today: TODAY,
    });

    const command = buildMcatTodayCommand({
      occurrence,
      fallbackTitle: "Focused topic session",
      fallbackDetail: "Study one foundation topic.",
      hasActiveSession: false,
      hasLoggedToday: false,
    });

    expect(command.heading).toBe("Today's MCAT Command");
    expect(command.action).toBe(occurrence.title);
    expect(command.estimatedMinutes).toBe(occurrence.estimated_minutes);
    expect(command.why).toContain("Phase 0");
    expect(command.successCondition.length).toBeGreaterThan(10);
    expect(command.disciplineText).toBe("Start today's recommended session first.");
  });

  it("formats accuracy trend without hype or bogus baselines", () => {
    expect(
      formatMcatAccuracyTrendLabel({
        currentAttempted: 0,
        previousAttempted: 0,
        trend: 0,
      }),
    ).toBe("Not enough data yet");
    expect(
      formatMcatAccuracyTrendLabel({
        currentAttempted: 10,
        previousAttempted: 0,
        trend: -93.1,
      }),
    ).toBe("Not enough data yet");
    expect(
      formatMcatAccuracyTrendLabel({
        currentAttempted: 20,
        previousAttempted: 20,
        trend: 5,
      }),
    ).toBe("+5% vs recent average");
  });
});
