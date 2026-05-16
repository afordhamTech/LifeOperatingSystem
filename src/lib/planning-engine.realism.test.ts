import { describe, expect, it } from "vitest";
import { makeAnchor } from "@/lib/calendar-system";
import {
  buildPlanningSnapshot,
  evaluateImportRealism,
  type RealismBlockInput,
  type RealismCategory,
} from "@/lib/planning-engine";

const DATE = "2026-05-14";

function b(
  title: string,
  start: string,
  end: string,
  block_type = "deep_work",
): RealismBlockInput {
  return { title, start_time: start, end_time: end, block_type };
}

function snapshotFor(anchors: ReturnType<typeof makeAnchor>[] = []) {
  return buildPlanningSnapshot({ date: DATE, anchors, timeBlocks: [] });
}

function anchor(title: string, start: string, end: string) {
  return makeAnchor({ title, date: DATE, start_time: start, end_time: end });
}

function hasCategory(
  issues: { category: RealismCategory }[],
  category: RealismCategory,
) {
  return issues.some((i) => i.category === category);
}

describe("evaluateImportRealism — per-criterion coverage", () => {
  it("flags imported-block overlaps as blocking", () => {
    const report = evaluateImportRealism({
      blocks: [b("Deep A", "09:00", "10:30"), b("Deep B", "10:00", "11:00")],
    });
    expect(hasCategory(report.issues, "overlap")).toBe(true);
    expect(report.issues.find((i) => i.category === "overlap")?.severity).toBe("block");
  });

  it("flags fixed-anchor conflicts as blocking", () => {
    const report = evaluateImportRealism({
      blocks: [b("Study", "09:00", "10:30")],
      anchors: [anchor("Class", "09:30", "10:30")],
      dayDate: DATE,
    });
    expect(hasCategory(report.issues, "anchor_conflict")).toBe(true);
  });

  it("warns when a block starts before wake (outside open window)", () => {
    const snapshot = snapshotFor();
    const report = evaluateImportRealism({
      blocks: [b("Pre-dawn grind", "05:00", "06:30")],
      snapshot,
    });
    expect(hasCategory(report.issues, "outside_open_window")).toBe(true);
  });

  it("flags shutdown-reserve overlap as blocking", () => {
    const snapshot = snapshotFor();
    const report = evaluateImportRealism({
      blocks: [b("Late deep work", "22:00", "22:45")],
      snapshot,
    });
    expect(hasCategory(report.issues, "shutdown_reserve")).toBe(true);
    expect(
      report.issues.find((i) => i.category === "shutdown_reserve")?.severity,
    ).toBe("block");
  });

  it("warns when transitions are too tight by block type", () => {
    const report = evaluateImportRealism({
      blocks: [
        b("Deep A", "09:00", "10:00", "deep_work"),
        b("Deep B", "10:05", "11:00", "deep_work"),
      ],
    });
    expect(hasCategory(report.issues, "transition")).toBe(true);
  });

  it("warns when recovery reserve is consumed", () => {
    const snapshot = snapshotFor([anchor("Class", "09:00", "13:00")]);
    // Fill nearly all remaining open time with non-break work.
    const report = evaluateImportRealism({
      blocks: [
        b("Work 1", "07:00", "08:55", "deep_work"),
        b("Work 2", "13:30", "16:30", "deep_work"),
        b("Work 3", "16:35", "19:30", "deep_work"),
        b("Work 4", "19:35", "22:00", "deep_work"),
      ],
      snapshot,
    });
    expect(hasCategory(report.issues, "recovery_reserve")).toBe(true);
  });

  it("warns when deep-work capacity is exceeded", () => {
    const snapshot = snapshotFor([anchor("Class", "07:00", "20:00")]);
    const report = evaluateImportRealism({
      blocks: [b("Marathon focus", "20:00", "21:30", "deep_work")],
      snapshot,
    });
    expect(hasCategory(report.issues, "deep_work_capacity")).toBe(true);
  });

  it("warns on 3+ high-energy blocks back-to-back without recovery", () => {
    const report = evaluateImportRealism({
      blocks: [
        b("Deep 1", "07:00", "08:00", "deep_work"),
        b("Deep 2", "08:10", "09:00", "deep_work"),
        b("Workout", "09:10", "10:00", "workout"),
      ],
    });
    expect(hasCategory(report.issues, "high_energy_streak")).toBe(true);
  });

  it("warns on late-night cognitive load", () => {
    const report = evaluateImportRealism({
      blocks: [b("Late study", "21:15", "22:30", "deep_work")],
    });
    expect(hasCategory(report.issues, "late_night")).toBe(true);
  });

  it("warns when a midday meal window has no break/recovery block", () => {
    const report = evaluateImportRealism({
      blocks: [
        b("Deep AM", "09:00", "11:30", "deep_work"),
        b("Deep midday", "11:30", "14:00", "deep_work"),
        b("Break", "14:00", "14:30", "break"),
      ],
    });
    expect(hasCategory(report.issues, "missing_meal_window")).toBe(true);
  });

  it("scores a clean, well-spaced schedule at 9 or higher", () => {
    const snapshot = snapshotFor();
    const report = evaluateImportRealism({
      blocks: [
        b("Deep AM", "08:00", "09:30", "deep_work"),
        b("Break", "09:30", "09:45", "break"),
        b("Shallow", "09:45", "10:45", "shallow"),
        b("Lunch", "12:00", "12:45", "break"),
        b("Deep PM", "13:00", "14:30", "deep_work"),
        b("Snack", "17:30", "18:00", "break"),
        b("Wrap up", "18:00", "19:00", "shallow"),
      ],
      snapshot,
      anchors: [],
      dayDate: DATE,
    });
    expect(report.issues.filter((i) => i.severity === "block")).toHaveLength(0);
    expect(report.score).toBeGreaterThanOrEqual(9);
  });

  it("backward-compat: validateImportRealism still surfaces overlaps as block", async () => {
    const { validateImportRealism } = await import("@/lib/planning-engine");
    const issues = validateImportRealism([
      { start_time: "09:00", end_time: "10:30", title: "A" },
      { start_time: "10:00", end_time: "11:00", title: "B" },
    ]);
    expect(issues.some((i) => i.severity === "block")).toBe(true);
  });
});
