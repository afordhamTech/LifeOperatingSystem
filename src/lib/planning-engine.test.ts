import { describe, expect, it } from "vitest";
import { makeAnchor, makeTimeBlock } from "@/lib/calendar-system";
import {
  buildPlanningSnapshot,
  energyAtMinute,
  validateImportRealism,
  summarizePlanningSnapshot,
} from "@/lib/planning-engine";

const DATE = "2026-05-14";

function anchor(
  title: string,
  start: string,
  end: string,
  extra: Partial<Parameters<typeof makeAnchor>[0]> = {},
) {
  return makeAnchor({ title, date: DATE, start_time: start, end_time: end, ...extra });
}

function block(title: string, start: string, end: string, blockType = "focus") {
  return makeTimeBlock({
    title,
    date: DATE,
    start_time: start,
    end_time: end,
    block_type: blockType,
  });
}

describe("planning-engine: open-window generation", () => {
  it("does not treat the whole day as one open block", () => {
    const snapshot = buildPlanningSnapshot({ date: DATE, anchors: [], timeBlocks: [] });
    const largest = snapshot.largestWindow;
    expect(largest).not.toBeNull();
    // Day stops at the shutdown reserve (22:15 with defaults), never 23:00.
    expect(largest!.end).not.toBe("23:00");
    expect(largest!.start).toBe("07:00");
    expect(largest!.durationMinutes).toBeLessThan(16 * 60);
  });

  it("subtracts anchors and produces realistic gaps", () => {
    const snapshot = buildPlanningSnapshot({
      date: DATE,
      anchors: [anchor("Class", "09:00", "10:30"), anchor("Lab", "13:00", "15:00")],
      timeBlocks: [],
    });
    expect(snapshot.openWindows.length).toBeGreaterThanOrEqual(3);
    // No open window may overlap an occupied anchor span.
    for (const window of snapshot.openWindows) {
      expect(window.durationMinutes).toBeGreaterThanOrEqual(15);
    }
  });

  it("ignores windows below the minimum threshold", () => {
    const snapshot = buildPlanningSnapshot({
      date: DATE,
      anchors: [anchor("A", "09:00", "10:00"), anchor("B", "10:10", "11:00")],
      timeBlocks: [],
      minWindowMinutes: 15,
    });
    // The 10:00-10:10 gap (minus buffer) is below threshold and excluded.
    expect(
      snapshot.openWindows.some((w) => w.start === "10:05" && w.durationMinutes < 15),
    ).toBe(false);
  });
});

describe("planning-engine: transition buffering", () => {
  it("applies a transition buffer after a meeting anchor", () => {
    const snapshot = buildPlanningSnapshot({
      date: DATE,
      anchors: [anchor("Standup", "09:00", "10:00")],
      timeBlocks: [],
    });
    const afterMeeting = snapshot.openWindows.find((w) => w.start === "10:05");
    expect(afterMeeting).toBeDefined();
  });

  it("applies a larger recovery buffer after a workout anchor", () => {
    const snapshot = buildPlanningSnapshot({
      date: DATE,
      anchors: [anchor("Gym", "09:00", "10:00", { category: "Workout" })],
      timeBlocks: [],
    });
    const afterWorkout = snapshot.openWindows.find((w) => w.start === "10:20");
    expect(afterWorkout).toBeDefined();
  });
});

describe("planning-engine: energy heuristics", () => {
  it("ranks morning energy above late-night energy", () => {
    expect(energyAtMinute(9 * 60)).toBeGreaterThan(energyAtMinute(22 * 60));
  });

  it("applies a post-meal dip", () => {
    expect(energyAtMinute(13 * 60)).toBeLessThan(energyAtMinute(10 * 60));
    expect(energyAtMinute(13 * 60)).toBeLessThan(energyAtMinute(16 * 60));
  });
});

describe("planning-engine: deep-work ranking", () => {
  it("returns at most 3 ranked deep-work windows, best first", () => {
    const snapshot = buildPlanningSnapshot({
      date: DATE,
      anchors: [
        anchor("A", "10:30", "11:00"),
        anchor("B", "15:00", "15:30"),
        anchor("C", "18:00", "18:30"),
      ],
      timeBlocks: [],
    });
    expect(snapshot.deepWorkWindows.length).toBeGreaterThan(0);
    expect(snapshot.deepWorkWindows.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < snapshot.deepWorkWindows.length; i++) {
      expect(snapshot.deepWorkWindows[i - 1].deepWorkScore).toBeGreaterThanOrEqual(
        snapshot.deepWorkWindows[i].deepWorkScore,
      );
    }
    // The earliest morning window should be the top deep-work pick.
    expect(snapshot.deepWorkWindows[0].start).toBe("07:00");
  });
});

describe("planning-engine: overload + recovery reserve", () => {
  it("flags overload when planned work exceeds focus capacity", () => {
    const snapshot = buildPlanningSnapshot({
      date: DATE,
      anchors: [anchor("Class", "09:00", "12:00"), anchor("Work", "13:00", "17:00")],
      timeBlocks: [],
      plannedTaskMinutes: 600,
    });
    expect(snapshot.capacity.overloaded).toBe(true);
    expect(snapshot.capacity.message).toContain("exceeds realistic focus capacity");
    expect(snapshot.warnings.length).toBeGreaterThan(0);
  });

  it("protects the recovery reserve on an open day", () => {
    const snapshot = buildPlanningSnapshot({ date: DATE, anchors: [], timeBlocks: [] });
    expect(snapshot.recoveryReserveProtected).toBe(true);
  });

  it("drops recovery protection when the day is nearly full", () => {
    const snapshot = buildPlanningSnapshot({
      date: DATE,
      anchors: [anchor("All day", "07:00", "21:30")],
      timeBlocks: [],
    });
    expect(snapshot.recoveryReserveProtected).toBe(false);
  });
});

describe("planning-engine: realism scoring", () => {
  it("keeps the realism score within 1-10", () => {
    const snapshot = buildPlanningSnapshot({
      date: DATE,
      anchors: [anchor("Class", "09:00", "12:00")],
      timeBlocks: [block("Deep work", "13:00", "14:30")],
      plannedTaskMinutes: 800,
    });
    expect(snapshot.realism.score).toBeGreaterThanOrEqual(1);
    expect(snapshot.realism.score).toBeLessThanOrEqual(10);
    expect(snapshot.realism.bottleneck.length).toBeGreaterThan(0);
    expect(snapshot.realism.correction.length).toBeGreaterThan(0);
  });

  it("an empty realistic day scores higher than an overloaded one", () => {
    const open = buildPlanningSnapshot({ date: DATE, anchors: [], timeBlocks: [] });
    const overloaded = buildPlanningSnapshot({
      date: DATE,
      anchors: [anchor("Class", "07:00", "21:00")],
      timeBlocks: [],
      plannedTaskMinutes: 600,
    });
    expect(open.realism.score).toBeGreaterThan(overloaded.realism.score);
  });
});

describe("planning-engine: schedule import realism validation", () => {
  it("blocks overlapping imported blocks", () => {
    const issues = validateImportRealism([
      { start_time: "09:00", end_time: "10:30", title: "Deep work" },
      { start_time: "10:00", end_time: "11:00", title: "Call" },
    ]);
    expect(issues.some((issue) => issue.severity === "block")).toBe(true);
  });

  it("warns about late-night overload but does not block it", () => {
    const issues = validateImportRealism([
      { start_time: "21:30", end_time: "23:30", title: "Late grind" },
    ]);
    expect(issues.some((issue) => issue.severity === "warn")).toBe(true);
    expect(issues.some((issue) => issue.severity === "block")).toBe(false);
  });
});

describe("planning-engine: prompt summary", () => {
  it("summary names protected windows and never claims the whole day", () => {
    const snapshot = buildPlanningSnapshot({
      date: DATE,
      anchors: [anchor("Class", "09:00", "10:30")],
      timeBlocks: [],
    });
    const summary = summarizePlanningSnapshot(snapshot);
    expect(summary).toContain("Sleep window");
    expect(summary).toContain("Shutdown reserve");
    expect(summary).toContain("Best deep-work windows");
    expect(summary).not.toContain("07:00-23:00");
  });
});
