import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TimeBlock } from "@/lib/calendar-system";
import type { DailyShutdownRow } from "@/lib/lifeee-persistence";
import type { Task } from "@/lib/task-system";
import {
  createBlockResolutionDraft,
  createShutdownRitualDraft,
  MISSED_REASONS,
} from "@/lib/execution-truth";

const baseBlock: TimeBlock = {
  id: "block-1",
  title: "Deep work",
  date: "2026-05-16",
  start_time: "09:00",
  end_time: "10:00",
  block_type: "focus",
  linked_task_id: null,
  linked_anchor_id: null,
  source: "manual",
  import_batch_id: null,
  reason: "",
  status: "planned",
  execution_status: "not_started",
  started_at: null,
  completed_at: null,
  missed_at: null,
  skipped_at: null,
  missed_reason: null,
  actual_minutes: null,
  execution_notes: null,
  rescheduled_from_block_id: null,
  carry_forward_task_id: null,
  notes: "",
  created_at: "2026-05-16T00:00:00.000Z",
  updated_at: "2026-05-16T00:00:00.000Z",
};

const baseTask: Task = {
  id: "task-1",
  task_code: "T-001",
  title: "Submit lab",
  description: "",
  task_type: "Academic",
  due_date: "2026-05-16",
  fixed_time: null,
  scheduled_start: null,
  scheduled_end: null,
  estimated_minutes: 60,
  energy_required: 6,
  resistance_level: 4,
  urgency: 5,
  importance: 5,
  consequence_if_delayed: 5,
  trust_impact: 5,
  time_efficiency: 5,
  priority: "high",
  consequence_level: "high",
  priority_score: null,
  status: "today",
  daily_role: "Must Do",
  recurring: false,
  notes: "",
  source: null,
  template_key: null,
  template_day_index: null,
  template_week_index: null,
  template_phase: null,
  generated_from: null,
  previous_status: null,
  ignored_until: null,
  ignored_count: 0,
  carry_forward_count: 0,
  rescheduled_count: 0,
  parent_task_id: null,
  review_date: null,
  completed_at: null,
  archived_at: null,
  deleted_at: null,
  created_at: "2026-05-16T00:00:00.000Z",
  updated_at: "2026-05-16T00:00:00.000Z",
};

describe("Execution Truth dialog helpers", () => {
  it("requires a reason before a missed block can be saved", () => {
    const draft = createBlockResolutionDraft({
      block: baseBlock,
      nextStatus: "missed",
      linkedTask: null,
    });

    expect(draft.requiresReason).toBe(true);
    expect(draft.missedReason).toBe(MISSED_REASONS[0]);
    expect(draft.canApplyImmediately).toBe(false);
  });

  it("asks whether a linked active task should be completed when its block is done", () => {
    const draft = createBlockResolutionDraft({
      block: { ...baseBlock, linked_task_id: baseTask.id },
      nextStatus: "done",
      linkedTask: baseTask,
    });

    expect(draft.requiresLinkedTaskDecision).toBe(true);
    expect(draft.linkedTaskTitle).toBe("Submit lab");
    expect(draft.canApplyImmediately).toBe(false);
  });

  it("can apply a low-stakes skipped block without opening a reason dialog", () => {
    const draft = createBlockResolutionDraft({
      block: baseBlock,
      nextStatus: "skipped",
      linkedTask: null,
    });

    expect(draft.requiresReason).toBe(false);
    expect(draft.requiresLinkedTaskDecision).toBe(false);
    expect(draft.canApplyImmediately).toBe(true);
  });

  it("prefills the shutdown ritual draft from the saved shutdown row", () => {
    const existing = {
      shutdown_notes: "Plan changed after lab.",
      anti_drift_lesson: "Estimate smaller blocks.",
      tomorrow_first_move: "Open Anki first.",
      tomorrow_shutdown_target: "22:30",
    } as DailyShutdownRow;

    expect(createShutdownRitualDraft(existing)).toEqual({
      notes: "Plan changed after lab.",
      lesson: "Estimate smaller blocks.",
      firstMove: "Open Anki first.",
      target: "22:30",
    });
  });

  it("keeps the execution panel off blocking browser prompts", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../components/ExecutionTruthPanel.tsx"),
      "utf8",
    );

    expect(source).not.toContain("window.prompt");
    expect(source).not.toContain("window.confirm");
  });
});
