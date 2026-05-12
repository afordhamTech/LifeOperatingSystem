import { describe, expect, it } from "vitest";
import { makeTask, type Task } from "@/lib/task-system";
import type { CalendarAnchor } from "@/lib/calendar-system";
import type { DecisionLog } from "@/lib/lifeee-persistence";
import {
  buildWeeklyBottleneckDiagnosis,
  buildWeeklyBottleneckSummary,
  pickNextWeekOneMove,
} from "@/lib/weekly-bottleneck-diagnosis";

const TODAY = "2026-05-13";
const WEEK_START = "2026-05-11";
const WEEK_END = "2026-05-17";

function task(partial: Partial<Task> & { title: string }): Task {
  return makeTask(partial);
}

function anchor(partial: Partial<CalendarAnchor> & { title: string }): CalendarAnchor {
  const now = new Date().toISOString();
  return {
    id: `a_${Math.random().toString(36).slice(2)}`,
    title: partial.title,
    date: partial.date ?? TODAY,
    start_time: partial.start_time ?? "09:00",
    end_time: partial.end_time ?? "10:00",
    category: partial.category ?? "Personal",
    location: partial.location ?? "",
    link: partial.link ?? "",
    people: partial.people ?? "",
    prep: partial.prep ?? "",
    follow_up: partial.follow_up ?? "",
    notes: partial.notes ?? "",
    privacy: partial.privacy ?? "Private",
    recurring: false,
    created_at: now,
    updated_at: now,
  };
}

function makeDecision(partial: Partial<DecisionLog> & { decision: string }): DecisionLog {
  return {
    id: partial.id ?? `d_${Math.random().toString(36).slice(2)}`,
    decision: partial.decision,
    decision_date: partial.decision_date ?? null,
    options_considered: partial.options_considered ?? [],
    reason_chosen: partial.reason_chosen ?? null,
    expected_outcome: partial.expected_outcome ?? null,
    risk: partial.risk ?? null,
    review_date: partial.review_date ?? null,
    result_later: partial.result_later ?? null,
    notes: partial.notes ?? null,
    created_at: partial.created_at,
    updated_at: partial.updated_at,
  };
}

function input(overrides: Partial<Parameters<typeof buildWeeklyBottleneckDiagnosis>[0]>) {
  return {
    tasks: [],
    decisionLogs: [],
    anchors: [],
    weekStart: WEEK_START,
    weekEnd: WEEK_END,
    today: TODAY,
    ...overrides,
  };
}

describe("buildWeeklyBottleneckDiagnosis", () => {
  it("returns insufficient-evidence with low confidence for empty input", () => {
    const result = buildWeeklyBottleneckDiagnosis(input({}));
    expect(result.bottleneckKind).toBe("insufficient-evidence");
    expect(result.confidence).toBe("low");
    expect(result.suggestedFix).toContain("Log more real inputs");
  });

  it("identifies overdue-tasks bottleneck when overdue tasks dominate", () => {
    const tasks = [
      task({ title: "A", due_date: "2026-05-09", task_type: "Academic" }),
      task({ title: "B", due_date: "2026-05-10", task_type: "Academic" }),
      task({ title: "C", due_date: "2026-05-08", task_type: "Career" }),
    ];
    const result = buildWeeklyBottleneckDiagnosis(input({ tasks }));
    expect(result.bottleneckKind).toBe("overdue-tasks");
    expect(result.primaryBottleneckDomain).toBe("Academic");
    expect(result.counts.overdueTaskCount).toBe(3);
  });

  it("counts ignored today and reflects them in score", () => {
    const tasks = [
      task({ title: "x", daily_role: "Ignore Today", status: "today" }),
      task({ title: "y", daily_role: "Ignore Today", status: "today" }),
    ];
    const result = buildWeeklyBottleneckDiagnosis(input({ tasks }));
    expect(result.counts.ignoredTodayCount).toBe(2);
    expect(result.bottleneckKind).toBe("ignored-today");
  });

  it("counts open decision reviews and reflects them in score", () => {
    const decisionLogs = [
      makeDecision({ decision: "Pay tuition", review_date: "2026-05-09", result_later: null }),
      makeDecision({ decision: "Therapy", review_date: TODAY, result_later: "  " }),
    ];
    const result = buildWeeklyBottleneckDiagnosis(input({ decisionLogs }));
    expect(result.counts.openDecisionReviewCount).toBe(2);
  });

  it("counts calendar prep and follow-up when fields exist", () => {
    const anchors = [
      anchor({ title: "Class", prep: "Read brief", date: "2026-05-12" }),
      anchor({ title: "Standup", prep: "Update notes", date: "2026-05-13" }),
      anchor({ title: "1:1", follow_up: "Send recap", date: "2026-05-14" }),
    ];
    const result = buildWeeklyBottleneckDiagnosis(input({ anchors }));
    expect(result.counts.calendarPrepCount).toBe(2);
    expect(result.counts.calendarFollowUpCount).toBe(1);
  });

  it("chooses the strongest domain when overdue task types differ", () => {
    const tasks = [
      task({ title: "A", due_date: "2026-05-09", task_type: "Academic" }),
      task({ title: "B", due_date: "2026-05-09", task_type: "Academic" }),
      task({ title: "C", due_date: "2026-05-09", task_type: "Career" }),
    ];
    const result = buildWeeklyBottleneckDiagnosis(input({ tasks }));
    expect(result.primaryBottleneckDomain).toBe("Academic");
  });

  it("returns high confidence when score and evidence cross threshold", () => {
    const tasks = [
      task({ title: "A", due_date: "2026-05-09" }),
      task({ title: "B", due_date: "2026-05-08" }),
      task({ title: "C", status: "today" }),
      task({ title: "D", daily_role: "Ignore Today", status: "today" }),
    ];
    const result = buildWeeklyBottleneckDiagnosis(input({ tasks }));
    expect(result.score).toBeGreaterThanOrEqual(8);
    expect(result.evidence.length).toBeGreaterThanOrEqual(3);
    expect(result.confidence).toBe("high");
  });

  it("returns medium confidence for moderate evidence", () => {
    const tasks = [task({ title: "A", due_date: "2026-05-09" })];
    const decisionLogs = [
      makeDecision({ decision: "Old", review_date: "2026-05-09", result_later: null }),
    ];
    const result = buildWeeklyBottleneckDiagnosis(input({ tasks, decisionLogs }));
    expect(result.score).toBeGreaterThanOrEqual(4);
    expect(result.confidence).toBe("medium");
  });

  it("varies suggestedFix by bottleneck kind", () => {
    const overdueFix = buildWeeklyBottleneckDiagnosis(
      input({
        tasks: [
          task({ title: "x", due_date: "2026-05-09", task_type: "Academic" }),
          task({ title: "y", due_date: "2026-05-09", task_type: "Academic" }),
        ],
      }),
    ).suggestedFix;
    expect(overdueFix).toMatch(/Academic|overdue/);

    const ignoreFix = buildWeeklyBottleneckDiagnosis(
      input({
        tasks: [
          task({ title: "a", daily_role: "Ignore Today", status: "today" }),
          task({ title: "b", daily_role: "Ignore Today", status: "today" }),
          task({ title: "c", daily_role: "Ignore Today", status: "today" }),
        ],
      }),
    ).suggestedFix;
    expect(ignoreFix).toMatch(/deferred|drop/i);

    const decisionFix = buildWeeklyBottleneckDiagnosis(
      input({
        decisionLogs: [
          makeDecision({ decision: "x", review_date: "2026-05-09", result_later: null }),
          makeDecision({ decision: "y", review_date: "2026-05-09", result_later: null }),
        ],
      }),
    ).suggestedFix;
    expect(decisionFix).toMatch(/decision review/i);
  });

  it("summary includes bottleneck, confidence, evidence and suggested fix", () => {
    const result = buildWeeklyBottleneckDiagnosis(
      input({
        tasks: [
          task({ title: "A", due_date: "2026-05-09" }),
          task({ title: "B", due_date: "2026-05-08" }),
          task({ title: "C", status: "today" }),
        ],
      }),
    );
    const summary = buildWeeklyBottleneckSummary(result);
    expect(summary).toContain("Overdue");
    expect(summary).toContain("confidence");
    expect(summary).toContain("Evidence");
    expect(summary).toContain("Fix:");
  });

  it("summary returns empty-state sentence for insufficient evidence", () => {
    const summary = buildWeeklyBottleneckSummary(
      buildWeeklyBottleneckDiagnosis(input({})),
    );
    expect(summary).toBe("Not enough weekly evidence to identify a bottleneck yet.");
  });
});

describe("pickNextWeekOneMove", () => {
  const empty = buildWeeklyBottleneckDiagnosis(input({}));
  it("returns empty suggestion with log-more rationale for insufficient evidence", () => {
    const move = pickNextWeekOneMove(empty);
    expect(move.suggestion).toBe("");
    expect(move.rationale).toBe("Log more weekly inputs before committing.");
  });

  it("returns a concrete overdue-task move with Academic domain", () => {
    const diagnosis = buildWeeklyBottleneckDiagnosis(
      input({
        tasks: [
          task({ title: "A", due_date: "2026-05-09", task_type: "Academic" }),
          task({ title: "B", due_date: "2026-05-08", task_type: "Academic" }),
        ],
      }),
    );
    const move = pickNextWeekOneMove(diagnosis);
    expect(move.suggestion).toMatch(/Academic|overdue/);
    expect(move.suggestion.length).toBeGreaterThan(0);
    expect(move.suggestion.length).toBeLessThan(200);
    expect(move.rationale.toLowerCase()).toContain("overdue");
  });

  it("returns a daily-cap move for incomplete-today bottleneck", () => {
    const diagnosis = buildWeeklyBottleneckDiagnosis(
      input({
        tasks: [
          task({ title: "x", status: "today" }),
          task({ title: "y", status: "today" }),
          task({ title: "z", status: "today" }),
        ],
      }),
    );
    const move = pickNextWeekOneMove(diagnosis);
    expect(move.suggestion).toMatch(/must-do|cap|supports/i);
  });

  it("returns a triage move for ignored-today bottleneck", () => {
    const diagnosis = buildWeeklyBottleneckDiagnosis(
      input({
        tasks: [
          task({ title: "a", daily_role: "Ignore Today", status: "today" }),
          task({ title: "b", daily_role: "Ignore Today", status: "today" }),
          task({ title: "c", daily_role: "Ignore Today", status: "today" }),
        ],
      }),
    );
    const move = pickNextWeekOneMove(diagnosis);
    expect(move.suggestion).toMatch(/triag|deferred|drop/i);
  });

  it("returns a close-one-decision move for open-decision-reviews bottleneck", () => {
    const diagnosis = buildWeeklyBottleneckDiagnosis(
      input({
        decisionLogs: [
          makeDecision({ decision: "x", review_date: "2026-05-09", result_later: null }),
          makeDecision({ decision: "y", review_date: "2026-05-09", result_later: null }),
        ],
      }),
    );
    const move = pickNextWeekOneMove(diagnosis);
    expect(move.suggestion).toMatch(/close|decision review/i);
  });

  it("returns a prep-block move for calendar-prep bottleneck", () => {
    const diagnosis = buildWeeklyBottleneckDiagnosis(
      input({
        anchors: [
          anchor({ title: "Class", prep: "Read brief", date: "2026-05-12" }),
          anchor({ title: "Standup", prep: "Update notes", date: "2026-05-13" }),
        ],
      }),
    );
    const move = pickNextWeekOneMove(diagnosis);
    expect(move.suggestion).toMatch(/prep block/i);
  });

  it("returns a follow-up-block move for calendar-follow-up bottleneck", () => {
    const diagnosis = buildWeeklyBottleneckDiagnosis(
      input({
        anchors: [
          anchor({ title: "1:1 A", follow_up: "Send recap", date: "2026-05-12" }),
          anchor({ title: "1:1 B", follow_up: "Send recap", date: "2026-05-13" }),
        ],
      }),
    );
    const move = pickNextWeekOneMove(diagnosis);
    expect(move.suggestion).toMatch(/follow-up/i);
  });

  it("rationale references evidence when present", () => {
    const diagnosis = buildWeeklyBottleneckDiagnosis(
      input({
        tasks: [task({ title: "A", due_date: "2026-05-09" })],
      }),
    );
    const move = pickNextWeekOneMove(diagnosis);
    expect(move.rationale).toMatch(/overdue/i);
    expect(move.rationale).toMatch(/1|2|3|\d/);
  });

  it("suggestion stays short and actionable", () => {
    const diagnosis = buildWeeklyBottleneckDiagnosis(
      input({
        tasks: [task({ title: "A", due_date: "2026-05-09" })],
      }),
    );
    const move = pickNextWeekOneMove(diagnosis);
    expect(move.suggestion.length).toBeLessThan(160);
  });
});
