import { describe, expect, it } from "vitest";
import {
  MCAT_PHASE_0_SOURCE,
  MCAT_PHASE_0_TEMPLATE_KEY,
  generateMcatPhase0Tasks,
} from "@/lib/mcat-phase-0-template";
import { makeTask } from "@/lib/task-system";
import {
  MCAT_ACTIVE_STUDY_SOURCE,
  MCAT_COMMITTED_STUDY_SOURCE,
  buildMcatTodayCommand,
  completeMcatPlanOccurrenceQueue,
  commitMcatPlanOccurrenceToTask,
  formatMcatAccuracyTrendLabel,
  generateMcatPhase0PlanOccurrences,
  getCurrentMcatQueueOccurrence,
  skipMcatPlanOccurrenceQueue,
  startMcatPlanOccurrenceQueue,
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
    expect(occurrences.map((occurrence) => occurrence.template_day_index)).toEqual(
      Array.from({ length: 70 }, (_, index) => index + 1),
    );
    expect(occurrences.map((occurrence) => occurrence.planned_date)).toEqual(
      [...occurrences.map((occurrence) => occurrence.planned_date)].sort(),
    );
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

  it("chooses one current chronological queue item at a time", () => {
    const occurrences = generateMcatPhase0PlanOccurrences(SEED, {
      planInstanceId: "plan-1",
      today: TODAY,
    }).map((occurrence, index) =>
      index === 0
        ? { ...occurrence, status: "completed" as const }
        : index === 4
          ? { ...occurrence, status: "in_progress" as const }
          : occurrence,
    );

    expect(getCurrentMcatQueueOccurrence(occurrences)?.template_day_index).toBe(5);

    const withoutInProgress = occurrences.map((occurrence) =>
      occurrence.status === "in_progress" ? { ...occurrence, status: "available" as const } : occurrence,
    );

    expect(getCurrentMcatQueueOccurrence(withoutInProgress)?.template_day_index).toBe(2);
  });

  it("Start Now marks the current item in_progress and creates one active MCAT task", () => {
    const occurrences = generateMcatPhase0PlanOccurrences(SEED, {
      planInstanceId: "plan-1",
      today: TODAY,
    });
    const now = "2026-05-14T12:00:00.000Z";

    const result = startMcatPlanOccurrenceQueue({
      occurrences,
      occurrenceId: occurrences[0].id,
      existingTasks: [],
      today: TODAY,
      now,
    });

    expect(result.created).toBe(true);
    expect(result.task.source).toBe(MCAT_ACTIVE_STUDY_SOURCE);
    expect(result.task.generated_from?.mcat_occurrence_id).toBe(occurrences[0].id);
    expect(result.occurrence.status).toBe("in_progress");
    expect(result.occurrence.started_at).toBe(now);
    expect(result.occurrences.filter((occurrence) => occurrence.status === "in_progress")).toHaveLength(1);
  });

  it("restarting the same item links the active task without duplication", () => {
    const occurrences = generateMcatPhase0PlanOccurrences(SEED, {
      planInstanceId: "plan-1",
      today: TODAY,
    });
    const first = startMcatPlanOccurrenceQueue({
      occurrences,
      occurrenceId: occurrences[0].id,
      existingTasks: [],
      today: TODAY,
      now: "2026-05-14T12:00:00.000Z",
    });
    const second = startMcatPlanOccurrenceQueue({
      occurrences: first.occurrences,
      occurrenceId: first.occurrence.id,
      existingTasks: [first.task],
      today: TODAY,
      now: "2026-05-14T12:10:00.000Z",
    });

    expect(second.created).toBe(false);
    expect(second.task.id).toBe(first.task.id);
    expect(second.occurrence.linked_task_id).toBe(first.task.id);
    expect(second.occurrences.filter((occurrence) => occurrence.status === "in_progress")).toHaveLength(1);
  });

  it("Done completes the active item, marks the linked task done, and advances to the next item", () => {
    const occurrences = generateMcatPhase0PlanOccurrences(SEED, {
      planInstanceId: "plan-1",
      today: TODAY,
    });
    const started = startMcatPlanOccurrenceQueue({
      occurrences,
      occurrenceId: occurrences[0].id,
      existingTasks: [],
      today: TODAY,
      now: "2026-05-14T12:00:00.000Z",
    });
    const completed = completeMcatPlanOccurrenceQueue({
      occurrences: started.occurrences,
      occurrenceId: started.occurrence.id,
      existingTasks: [started.task],
      now: "2026-05-14T13:00:00.000Z",
    });

    expect(completed.occurrence.status).toBe("completed");
    expect(completed.occurrence.completed_at).toBe("2026-05-14T13:00:00.000Z");
    expect(completed.task?.status).toBe("done");
    expect(completed.task?.completed_at).toBeTruthy();
    expect(completed.nextOccurrence?.template_day_index).toBe(2);
  });

  it("Skip requires a reason and advances the queue", () => {
    const occurrences = generateMcatPhase0PlanOccurrences(SEED, {
      planInstanceId: "plan-1",
      today: TODAY,
    });

    expect(() =>
      skipMcatPlanOccurrenceQueue({
        occurrences,
        occurrenceId: occurrences[0].id,
        reason: " ",
        now: "2026-05-14T13:00:00.000Z",
      }),
    ).toThrow("Skip reason is required");

    const skipped = skipMcatPlanOccurrenceQueue({
      occurrences,
      occurrenceId: occurrences[0].id,
      reason: "Full-length exam took priority.",
      now: "2026-05-14T13:00:00.000Z",
    });

    expect(skipped.occurrence.status).toBe("skipped");
    expect(skipped.occurrence.skipped_reason).toBe("Full-length exam took priority.");
    expect(skipped.nextOccurrence?.template_day_index).toBe(2);
  });

  it("summarizes plan days, linked tasks, completion, and remaining minutes separately", () => {
    const occurrences = generateMcatPhase0PlanOccurrences(SEED, {
      planInstanceId: "plan-1",
      today: TODAY,
    }).map((occurrence, index) =>
      index === 0
        ? { ...occurrence, status: "in_progress" as const, linked_task_id: "task-1" }
        : index === 1
          ? { ...occurrence, status: "completed" as const, linked_task_id: "task-2" }
          : occurrence,
    );

    const summary = summarizeMcatPlanOccurrenceStatus(occurrences, { today: TODAY });

    expect(summary.generatedPlanDayCount).toBe(70);
    expect(summary.committedTaskCount).toBe(2);
    expect(summary.completedCount).toBe(1);
    expect(summary.remainingPlannedMinutes).toBe(4620);
    expect(summary.statusLabel).toBe("Phase 0 plan active");
  });

  it("linking one occurrence creates one MCAT universal task without changing queue chronology", () => {
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
    expect(result.occurrence.status).toBe("in_progress");
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
    expect(command.why).toContain("Day 1 of 70");
    expect(command.successCondition.length).toBeGreaterThan(10);
    expect(command.dayLabel).toBe("Day 1 of 70");
    expect(command.statusLabel).toBe("planned");
    expect(command.disciplineText).toContain("Start the current MCAT command");
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
