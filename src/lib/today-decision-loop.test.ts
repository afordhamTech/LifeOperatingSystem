import { describe, expect, it } from "vitest";
import { makeTask, type Task } from "@/lib/task-system";
import type { CalendarAnchor } from "@/lib/calendar-system";
import {
  buildDecisionLoopSummary,
  pickIgnoredToday,
  pickInboxCandidates,
  pickTrustProtectors,
  summarizeAntiDrift,
} from "@/lib/today-decision-loop";

const TODAY = "2026-05-11";

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

describe("today decision loop", () => {
  it("classifies overdue and due-today tasks as trust protectors", () => {
    const tasks = [
      task({ title: "Yesterday's homework", due_date: "2026-05-10", status: "today" }),
      task({ title: "Lab today", due_date: TODAY, status: "today" }),
      task({ title: "High consequence", consequence_if_delayed: 9, trust_impact: 8 }),
      task({ title: "Low stakes", consequence_if_delayed: 3, trust_impact: 3 }),
      task({ title: "Already done", status: "completed", due_date: "2026-05-10" }),
    ];

    const protectors = pickTrustProtectors(tasks, [], TODAY);
    const titles = protectors.map((p) => p.title);
    expect(titles).toContain("Yesterday's homework");
    expect(titles).toContain("Lab today");
    expect(titles).toContain("High consequence");
    expect(titles).not.toContain("Low stakes");
    expect(titles).not.toContain("Already done");
  });

  it("surfaces calendar prep and follow-up needs", () => {
    const anchors = [
      anchor({ title: "Connex Zoom", prep: "Read brief" }),
      anchor({ title: "Therapy", follow_up: "Send notes" }),
      anchor({ title: "Drive home", date: "2026-05-12" }),
    ];

    const protectors = pickTrustProtectors([], anchors, TODAY);
    expect(protectors.find((p) => p.title.startsWith("Prep:"))).toBeDefined();
    expect(protectors.find((p) => p.title.startsWith("Follow up:"))).toBeDefined();
    expect(protectors.find((p) => p.title.includes("Drive home"))).toBeUndefined();
  });

  it("treats Ignore Today role as an intentional bucket and excludes from candidates", () => {
    const tasks = [
      task({ title: "Open inbox", status: "inbox" }),
      task({ title: "Ignored", status: "inbox", daily_role: "Ignore Today" }),
    ];

    const candidates = pickInboxCandidates(tasks, 6);
    const ignored = pickIgnoredToday(tasks);
    expect(candidates.map((t) => t.title)).toEqual(["Open inbox"]);
    expect(ignored.map((t) => t.title)).toEqual(["Ignored"]);
  });

  it("builds a connected decision-loop summary across tasks and anchors", () => {
    const tasks = [
      task({ title: "Capture this", status: "inbox" }),
      task({
        title: "Pay tuition",
        status: "today",
        due_date: TODAY,
        consequence_if_delayed: 9,
        trust_impact: 9,
      }),
      task({ title: "Skip today", status: "inbox", daily_role: "Ignore Today" }),
    ];
    const anchors = [anchor({ title: "Class", prep: "Print syllabus" })];

    const summary = buildDecisionLoopSummary({
      tasks,
      anchors,
      today: TODAY,
      currentEnergy: 7,
    });

    expect(summary.inboxCandidates.map((t) => t.title)).toEqual(["Capture this"]);
    expect(summary.ignoredToday.map((t) => t.title)).toEqual(["Skip today"]);
    expect(summary.todayCommitted.map((t) => t.title)).toContain("Pay tuition");
    expect(summary.trustProtectors.map((p) => p.title)).toContain("Pay tuition");
    expect(summary.trustProtectors.map((p) => p.title)).toContain("Prep: Class");
  });

  it("renders a multi-line anti-drift summary suitable for prompt context", () => {
    const text = summarizeAntiDrift({
      computedBottleneck: "Plan is overloaded",
      userNote: "If today slips, do the lab summary only",
      ignored: [task({ title: "Skip social" })],
      trustProtectors: [
        {
          id: "t1",
          title: "Pay tuition",
          reason: "Due today",
          kind: "due-today",
          source: "task",
        },
      ],
    });
    expect(text).toContain("Computed bottleneck: Plan is overloaded");
    expect(text).toContain("User anti-drift note");
    expect(text).toContain("Pay tuition");
    expect(text).toContain("Skip social");
  });
});
