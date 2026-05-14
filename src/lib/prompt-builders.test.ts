import { describe, expect, it } from "vitest";
import { buildLifeeePrompt, type PromptBuilderContext } from "@/lib/prompt-builders";
import { normalizeTask, type Task } from "@/lib/task-system";
import { summarizeTaskCandidates } from "@/lib/today-decision-loop";

// Canonical task that mirrors the QA report: status today, Must Do, critical.
const canonicalTask: Task = normalizeTask({
  id: "task-a56",
  task_code: "TASK-20260514-A56",
  title: "Finish Pickaxe demo path",
  task_type: "Connex / Project",
  status: "today",
  daily_role: "Must Do",
  estimated_minutes: 30,
  priority: "critical",
  consequence_level: "high",
  due_date: "2026-05-14",
});

function contextWithCanonicalTask(): PromptBuilderContext {
  return {
    date: "2026-05-14",
    sourcePage: "calendar",
    taskSummary: summarizeTaskCandidates([canonicalTask]),
    calendarSummary: "- 09:00–10:00 Standup (Connex)",
    timelineSummary: "- 09:00–10:00 Standup (Connex)",
  };
}

describe("AI Prompt Drawer exports", () => {
  it("Task Triage export includes the canonical task code and metadata", () => {
    const prompt = buildLifeeePrompt("task-triage", contextWithCanonicalTask());
    expect(prompt).toContain("TASK-20260514-A56");
    expect(prompt).toContain("Finish Pickaxe demo path");
    expect(prompt).not.toContain("Tasks: Not supplied");
  });

  it("Calendar Planning export includes the task code and never says Tasks: none", () => {
    const prompt = buildLifeeePrompt("calendar-planning", contextWithCanonicalTask());
    expect(prompt).toContain("TASK-20260514-A56");
    expect(prompt).not.toContain("Tasks: none");
    expect(prompt).not.toContain("Tasks: Not supplied");
  });

  it("Full Lifeee Context Export includes the canonical task code", () => {
    const prompt = buildLifeeePrompt("full-context", contextWithCanonicalTask());
    expect(prompt).toContain("TASK-20260514-A56");
  });

  it("says Not supplied only when the context is actually empty", () => {
    const prompt = buildLifeeePrompt("task-triage", { date: "2026-05-14" });
    expect(prompt).toContain("Tasks: Not supplied in this export.");

    const withTasks = buildLifeeePrompt("task-triage", contextWithCanonicalTask());
    expect(withTasks).not.toContain("Tasks: Not supplied in this export.");
  });

  it("summarizeTaskCandidates emits canonical task metadata, not a 'none' placeholder", () => {
    const summary = summarizeTaskCandidates([canonicalTask]);
    expect(summary).not.toBe("- none");
    expect(summary).toContain("TASK-20260514-A56");
  });
});
