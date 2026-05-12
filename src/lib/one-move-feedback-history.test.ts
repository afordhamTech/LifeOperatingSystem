import { describe, expect, it } from "vitest";
import {
  buildOneMoveFeedbackHistory,
  buildOneMoveFeedbackHistorySummary,
} from "@/lib/one-move-feedback-history";
import { serializeOneMoveVerdict } from "@/lib/one-move-verdict";

const CURRENT_WEEK_START = "2026-05-11";

type RowLike = {
  week_start?: string | null;
  next_week_big_3?: unknown;
  notes?: string | null;
};

function row(
  week_start: string,
  move: string | null,
  verdict?: { outcome: "worked" | "partial" | "missed" | "skipped"; note: string } | "malformed",
): RowLike {
  const notes =
    verdict === "malformed"
      ? "[oneMoveVerdict] outcome=garbage; note=x"
      : verdict
        ? serializeOneMoveVerdict(verdict)
        : null;
  return {
    week_start,
    next_week_big_3: move == null ? null : [move, "", ""],
    notes,
  };
}

describe("buildOneMoveFeedbackHistory", () => {
  it("returns zero totals and empty entries for empty input", () => {
    const history = buildOneMoveFeedbackHistory([], {
      currentWeekStart: CURRENT_WEEK_START,
    });
    expect(history.totalMoves).toBe(0);
    expect(history.totalVerdicts).toBe(0);
    expect(history.verdictRate).toBe(0);
    expect(history.entries).toEqual([]);
    expect(history.currentStreak).toBe(0);
    expect(history.longestStreak).toBe(0);
  });

  it("skips rows with no move", () => {
    const history = buildOneMoveFeedbackHistory(
      [
        row("2026-04-27", null),
        row("2026-05-04", "Close one decision review", { outcome: "worked", note: "ok" }),
      ],
      { currentWeekStart: CURRENT_WEEK_START },
    );
    expect(history.totalMoves).toBe(1);
    expect(history.entries[0]?.move).toBe("Close one decision review");
  });

  it("skips whitespace-only move", () => {
    const history = buildOneMoveFeedbackHistory(
      [row("2026-04-27", "   ", { outcome: "worked", note: "" })],
      { currentWeekStart: CURRENT_WEEK_START },
    );
    expect(history.totalMoves).toBe(0);
  });

  it("excludes rows whose target week has not started", () => {
    const history = buildOneMoveFeedbackHistory(
      [
        // commitment row for current week → target = next week, not yet eligible
        row("2026-05-11", "Future move"),
        row("2026-05-04", "Past move", { outcome: "missed", note: "x" }),
      ],
      { currentWeekStart: CURRENT_WEEK_START },
    );
    expect(history.totalMoves).toBe(1);
    expect(history.entries[0]?.move).toBe("Past move");
  });

  it("counts eligible past move without verdict in totalMoves but not totalVerdicts", () => {
    const history = buildOneMoveFeedbackHistory(
      [row("2026-04-27", "No verdict yet")],
      { currentWeekStart: CURRENT_WEEK_START },
    );
    expect(history.totalMoves).toBe(1);
    expect(history.totalVerdicts).toBe(0);
    expect(history.entries[0]?.outcome).toBeNull();
  });

  it("computes verdict rate correctly", () => {
    const history = buildOneMoveFeedbackHistory(
      [
        row("2026-04-20", "A", { outcome: "worked", note: "" }),
        row("2026-04-13", "B"),
        row("2026-04-06", "C", { outcome: "missed", note: "" }),
        row("2026-03-30", "D"),
      ],
      { currentWeekStart: CURRENT_WEEK_START },
    );
    expect(history.totalMoves).toBe(4);
    expect(history.totalVerdicts).toBe(2);
    expect(history.verdictRate).toBeCloseTo(0.5);
  });

  it("counts outcomes from parseOneMoveVerdict", () => {
    const history = buildOneMoveFeedbackHistory(
      [
        row("2026-04-20", "A", { outcome: "worked", note: "" }),
        row("2026-04-13", "B", { outcome: "partial", note: "" }),
        row("2026-04-06", "C", { outcome: "missed", note: "" }),
        row("2026-03-30", "D", { outcome: "skipped", note: "" }),
      ],
      { currentWeekStart: CURRENT_WEEK_START },
    );
    expect(history.outcomeCounts).toEqual({
      worked: 1,
      partial: 1,
      missed: 1,
      skipped: 1,
    });
  });

  it("ignores malformed sentinel as no verdict", () => {
    const history = buildOneMoveFeedbackHistory(
      [row("2026-04-20", "A", "malformed")],
      { currentWeekStart: CURRENT_WEEK_START },
    );
    expect(history.totalVerdicts).toBe(0);
    expect(history.entries[0]?.outcome).toBeNull();
  });

  it("computes currentStreak from most-recent consecutive verdicts", () => {
    const history = buildOneMoveFeedbackHistory(
      [
        row("2026-05-04", "A", { outcome: "worked", note: "" }), // target 2026-05-11 (today)
        row("2026-04-27", "B", { outcome: "partial", note: "" }),
        row("2026-04-20", "C"), // no verdict, breaks streak
        row("2026-04-13", "D", { outcome: "worked", note: "" }),
      ],
      { currentWeekStart: CURRENT_WEEK_START },
    );
    expect(history.currentStreak).toBe(2);
  });

  it("computes longestStreak across gaps", () => {
    const history = buildOneMoveFeedbackHistory(
      [
        row("2026-05-04", "A"),
        row("2026-04-27", "B", { outcome: "worked", note: "" }),
        row("2026-04-20", "C", { outcome: "worked", note: "" }),
        row("2026-04-13", "D", { outcome: "worked", note: "" }),
        row("2026-04-06", "E"),
        row("2026-03-30", "F", { outcome: "worked", note: "" }),
        row("2026-03-23", "G", { outcome: "worked", note: "" }),
      ],
      { currentWeekStart: CURRENT_WEEK_START },
    );
    expect(history.currentStreak).toBe(0);
    expect(history.longestStreak).toBe(3);
  });

  it("sorts entries descending by targetWeekStart", () => {
    const history = buildOneMoveFeedbackHistory(
      [
        row("2026-03-30", "Old"),
        row("2026-05-04", "Newest", { outcome: "worked", note: "" }),
        row("2026-04-13", "Middle"),
      ],
      { currentWeekStart: CURRENT_WEEK_START },
    );
    expect(history.entries.map((e) => e.move)).toEqual([
      "Newest",
      "Middle",
      "Old",
    ]);
    expect(history.entries[0]?.targetWeekStart).toBe("2026-05-11");
  });
});

describe("buildOneMoveFeedbackHistorySummary", () => {
  it("returns empty-state sentence when nothing eligible", () => {
    const history = buildOneMoveFeedbackHistory([], {
      currentWeekStart: CURRENT_WEEK_START,
    });
    expect(buildOneMoveFeedbackHistorySummary(history)).toBe(
      "No one-move feedback history yet.",
    );
  });

  it("includes totals, rate, outcomes, and streak", () => {
    const history = buildOneMoveFeedbackHistory(
      [
        row("2026-05-04", "A", { outcome: "worked", note: "" }),
        row("2026-04-27", "B", { outcome: "partial", note: "" }),
        row("2026-04-20", "C"),
      ],
      { currentWeekStart: CURRENT_WEEK_START },
    );
    const summary = buildOneMoveFeedbackHistorySummary(history, { windowWeeks: 8 });
    expect(summary).toContain("8w window");
    expect(summary).toContain("3 eligible moves");
    expect(summary).toContain("2 verdicts");
    expect(summary).toContain("rate 67%");
    expect(summary).toContain("worked:1");
    expect(summary).toContain("partial:1");
    expect(summary).toContain("streak 2");
  });
});
