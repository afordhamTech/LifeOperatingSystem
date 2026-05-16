// Phase 2A: Reality-Constrained Planning Engine.
// Make planning realistic before making it intelligent. This module computes
// true availability by subtracting sleep, shutdown, anchors, imported time
// blocks, transition buffers, and recovery reserves — then ranks open windows,
// scores deep-work suitability, budgets capacity, and produces a realism score.

import {
  minutesToTime,
  parseTimeToMinutes,
  type CalendarAnchor,
  type TimeBlock,
} from "@/lib/calendar-system";

export const MIN_WINDOW_MINUTES = 15;
export const DEFAULT_WAKE_TIME = "07:00";
export const DEFAULT_SLEEP_TIME = "23:00";
export const DEFAULT_SHUTDOWN_RESERVE_MINUTES = 45;
export const DEFAULT_MEAL_RESERVE_MINUTES = 60;

// Transition / recovery buffers applied AFTER an occupied segment. These are
// computed planning buffers only — user-entered anchor times are never mutated.
export type SegmentKind = "deep_work" | "meeting" | "anchor" | "workout" | "break" | "commute";
export const TRANSITION_BUFFERS: Record<SegmentKind, number> = {
  deep_work: 10,
  meeting: 5,
  anchor: 5,
  workout: 20,
  break: 0,
  commute: 15,
};

export type WindowQuality = "high focus" | "medium focus" | "low focus" | "fragment";

export type OpenWindow = {
  start: string;
  end: string;
  durationMinutes: number;
  energyScore: number; // 0-10
  deepWorkScore: number; // 0-10
  conflictDensity: number; // 0-10, higher = more crowded edges
  quality: WindowQuality;
};

export type CapacityBudget = {
  totalAvailableMinutes: number;
  scheduledMinutes: number;
  plannedTaskMinutes: number;
  deepWorkCapacityMinutes: number;
  recoveryReserveMinutes: number;
  maintenanceReserveMinutes: number;
  fragmentedMinutes: number;
  overloadScore: number; // 0-10
  overloaded: boolean;
  underplanned: boolean;
  message: string;
};

export type PlanningRealism = {
  score: number; // 1-10
  bottleneck: string;
  correction: string;
};

export type OccupiedSegment = {
  start: string;
  end: string;
  label: string;
  kind: SegmentKind;
  bufferMinutes: number;
};

export type PlanningSnapshot = {
  date: string;
  sleepWindow: { start: string; end: string };
  shutdownReserve: { start: string; end: string };
  occupied: OccupiedSegment[];
  openWindows: OpenWindow[];
  largestWindow: OpenWindow | null;
  deepWorkWindows: OpenWindow[]; // top 3, ranked
  lowEnergyWindows: OpenWindow[]; // best fragmented / evening windows
  capacity: CapacityBudget;
  realism: PlanningRealism;
  recoveryReserveProtected: boolean;
  warnings: string[];
};

export type PlanningInput = {
  date: string;
  anchors: CalendarAnchor[];
  timeBlocks: TimeBlock[];
  wakeTime?: string;
  sleepTime?: string;
  shutdownTarget?: string | null;
  sleepDebtHours?: number;
  mealReserveMinutes?: number;
  maintenanceReserveMinutes?: number;
  minWindowMinutes?: number;
  plannedTaskMinutes?: number;
  carryForwardPressure?: number; // 0-10
};

function clamp(value: number, lo = 0, hi = 10): number {
  return Math.max(lo, Math.min(hi, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

// ── Energy heuristics ───────────────────────────────────────────────────────
// Simple time-of-day energy curve: morning high-focus bias, post-meal dip,
// late-night cognitive decay. 0-10.
export function energyAtMinute(minute: number): number {
  const h = minute / 60;
  if (h < 7) return 3; // pre-wake grogginess
  if (h < 11) return 9; // morning peak
  if (h < 12.5) return 7.5;
  if (h < 14) return 5; // post-meal dip
  if (h < 17) return 7;
  if (h < 19) return 6;
  if (h < 21) return 4.5; // evening decline
  if (h < 23) return 3; // late-night cognitive decay
  return 1.5;
}

function averageEnergy(startMin: number, endMin: number): number {
  if (endMin <= startMin) return energyAtMinute(startMin);
  let total = 0;
  let count = 0;
  for (let m = startMin; m < endMin; m += 15) {
    total += energyAtMinute(m);
    count += 1;
  }
  return count > 0 ? total / count : energyAtMinute(startMin);
}

// ── Segment classification ──────────────────────────────────────────────────
function anchorKind(anchor: CalendarAnchor): SegmentKind {
  if (anchor.category === "Workout") return "workout";
  return "meeting";
}

function timeBlockKind(block: TimeBlock): SegmentKind {
  const type = (block.block_type ?? "").toLowerCase();
  if (type.includes("workout") || type.includes("training")) return "workout";
  if (type.includes("break") || type.includes("recovery") || type.includes("rest")) {
    return "break";
  }
  if (type.includes("deep") || type.includes("focus") || type.includes("study")) {
    return "deep_work";
  }
  if (type.includes("meeting") || type.includes("call")) return "meeting";
  return "anchor";
}

export function buildOccupiedSegments(
  anchors: CalendarAnchor[],
  timeBlocks: TimeBlock[],
  dayDate: string,
): OccupiedSegment[] {
  const segments: OccupiedSegment[] = [];

  const todayAnchors = anchors
    .filter((anchor) => anchor.date === dayDate)
    .sort((a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time));

  let previousLocation = "";
  for (const anchor of todayAnchors) {
    const kind = anchorKind(anchor);
    let buffer = TRANSITION_BUFFERS[kind];
    // Travel buffer when the location changes between consecutive anchors.
    if (
      anchor.location &&
      previousLocation &&
      anchor.location.trim().toLowerCase() !== previousLocation.trim().toLowerCase()
    ) {
      buffer = Math.max(buffer, TRANSITION_BUFFERS.commute);
    }
    previousLocation = anchor.location || previousLocation;
    segments.push({
      start: anchor.start_time,
      end: anchor.end_time,
      label: anchor.title,
      kind,
      bufferMinutes: buffer,
    });
  }

  for (const block of timeBlocks) {
    if (block.date !== dayDate) continue;
    const kind = timeBlockKind(block);
    segments.push({
      start: block.start_time,
      end: block.end_time,
      label: block.title,
      kind,
      bufferMinutes: TRANSITION_BUFFERS[kind],
    });
  }

  return segments.sort(
    (a, b) => parseTimeToMinutes(a.start) - parseTimeToMinutes(b.start),
  );
}

// ── Window quality ──────────────────────────────────────────────────────────
function conflictDensityFor(
  windowStart: number,
  windowEnd: number,
  occupiedRanges: Array<{ start: number; end: number }>,
): number {
  // Count occupied edges within 30 minutes of this window.
  let near = 0;
  for (const range of occupiedRanges) {
    if (Math.abs(range.end - windowStart) <= 30) near += 1;
    if (Math.abs(range.start - windowEnd) <= 30) near += 1;
  }
  // Short windows in crowded areas are worse.
  const duration = windowEnd - windowStart;
  const shortPenalty = duration < 45 ? 2 : 0;
  return clamp(near * 2 + shortPenalty);
}

function deepWorkScoreFor(
  energyScore: number,
  durationMinutes: number,
  conflictDensity: number,
  startMinute: number,
): number {
  const durationFit =
    durationMinutes >= 90 ? 10 : durationMinutes >= 60 ? 8 : durationMinutes >= 30 ? 5 : 2;
  const earliness = clamp(10 - (startMinute - 7 * 60) / 90); // earlier is better
  const score =
    energyScore * 0.4 + durationFit * 0.35 + earliness * 0.15 + (10 - conflictDensity) * 0.1;
  return clamp(round(score));
}

function qualityFor(deepWorkScore: number, durationMinutes: number): WindowQuality {
  if (durationMinutes < 30) return "fragment";
  if (deepWorkScore >= 7.5) return "high focus";
  if (deepWorkScore >= 5) return "medium focus";
  return "low focus";
}

// ── Core snapshot ───────────────────────────────────────────────────────────
export function buildPlanningSnapshot(input: PlanningInput): PlanningSnapshot {
  const wakeTime = input.wakeTime ?? DEFAULT_WAKE_TIME;
  const sleepTime = input.sleepTime ?? DEFAULT_SLEEP_TIME;
  const minWindow = input.minWindowMinutes ?? MIN_WINDOW_MINUTES;
  const mealReserve = input.mealReserveMinutes ?? DEFAULT_MEAL_RESERVE_MINUTES;
  const maintenanceReserve = input.maintenanceReserveMinutes ?? 0;

  const wakeMin = parseTimeToMinutes(wakeTime);
  const sleepMin = parseTimeToMinutes(sleepTime);

  // Shutdown reserve: final 30-60 minutes before sleep, pulled earlier when a
  // shutdown target is set. Sleep debt also pulls the reserve earlier.
  const sleepDebtPull = Math.min(60, Math.max(0, (input.sleepDebtHours ?? 0) * 20));
  let shutdownStartMin = sleepMin - DEFAULT_SHUTDOWN_RESERVE_MINUTES - sleepDebtPull;
  if (input.shutdownTarget) {
    const targetMin = parseTimeToMinutes(input.shutdownTarget);
    if (targetMin > wakeMin && targetMin < sleepMin) {
      shutdownStartMin = Math.min(shutdownStartMin, targetMin);
    }
  }
  shutdownStartMin = Math.max(wakeMin + 60, shutdownStartMin);

  const dayStart = wakeMin;
  const dayEnd = Math.max(dayStart + 30, shutdownStartMin);

  const occupied = buildOccupiedSegments(input.anchors, input.timeBlocks, input.date);

  // Merge occupied + buffer into normalized ranges, clamped to the day window.
  const rawRanges = occupied
    .map((segment) => ({
      start: parseTimeToMinutes(segment.start),
      end: parseTimeToMinutes(segment.end) + segment.bufferMinutes,
    }))
    .filter((range) => range.end > dayStart && range.start < dayEnd)
    .map((range) => ({
      start: Math.max(dayStart, range.start),
      end: Math.min(dayEnd, range.end),
    }))
    .sort((a, b) => a.start - b.start);

  const mergedRanges: Array<{ start: number; end: number }> = [];
  for (const range of rawRanges) {
    const last = mergedRanges[mergedRanges.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      mergedRanges.push({ ...range });
    }
  }

  const scheduledMinutes = mergedRanges.reduce(
    (sum, range) => sum + (range.end - range.start),
    0,
  );

  // Open windows = gaps between merged occupied ranges within the day window.
  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = dayStart;
  for (const range of mergedRanges) {
    if (range.start > cursor) gaps.push({ start: cursor, end: range.start });
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < dayEnd) gaps.push({ start: cursor, end: dayEnd });

  const occupiedForDensity = mergedRanges;
  const openWindows: OpenWindow[] = gaps
    .filter((gap) => gap.end - gap.start >= minWindow)
    .map((gap) => {
      const durationMinutes = gap.end - gap.start;
      const energyScore = round(averageEnergy(gap.start, gap.end));
      const conflictDensity = conflictDensityFor(gap.start, gap.end, occupiedForDensity);
      const deepWorkScore = deepWorkScoreFor(
        energyScore,
        durationMinutes,
        conflictDensity,
        gap.start,
      );
      return {
        start: minutesToTime(gap.start),
        end: minutesToTime(gap.end),
        durationMinutes,
        energyScore,
        deepWorkScore,
        conflictDensity,
        quality: qualityFor(deepWorkScore, durationMinutes),
      };
    })
    .sort((a, b) => b.durationMinutes - a.durationMinutes);

  const totalAvailableMinutes = openWindows.reduce(
    (sum, window) => sum + window.durationMinutes,
    0,
  );
  const fragmentedMinutes = openWindows
    .filter((window) => window.durationMinutes < 45)
    .reduce((sum, window) => sum + window.durationMinutes, 0);

  const largestWindow = openWindows[0] ?? null;

  const deepWorkWindows = [...openWindows]
    .filter((window) => window.durationMinutes >= 30)
    .sort((a, b) => b.deepWorkScore - a.deepWorkScore)
    .slice(0, 3);

  const lowEnergyWindows = [...openWindows]
    .filter((window) => window.deepWorkScore < 6 || window.durationMinutes < 45)
    .sort((a, b) => a.deepWorkScore - b.deepWorkScore)
    .slice(0, 3);

  // ── Recovery reserve ──────────────────────────────────────────────────────
  const dayLength = dayEnd - dayStart;
  const heavyLoad = dayLength > 0 && scheduledMinutes / dayLength > 0.6;
  const effectiveMealReserve = heavyLoad ? mealReserve + 30 : mealReserve;
  const recoveryReserveMinutes = effectiveMealReserve + maintenanceReserve;
  const recoveryReserveProtected = totalAvailableMinutes >= recoveryReserveMinutes;

  // ── Capacity budget ───────────────────────────────────────────────────────
  const deepWorkCapacityMinutes = Math.max(
    0,
    totalAvailableMinutes - recoveryReserveMinutes - fragmentedMinutes,
  );
  const plannedTaskMinutes = input.plannedTaskMinutes ?? 0;
  const focusDemand = plannedTaskMinutes > 0 ? plannedTaskMinutes : scheduledMinutes;
  const overshoot = focusDemand - deepWorkCapacityMinutes;
  const overloadScore = clamp(
    deepWorkCapacityMinutes > 0
      ? (overshoot / deepWorkCapacityMinutes) * 10
      : focusDemand > 0
        ? 10
        : 0,
  );
  const overloaded = overshoot > 0 && focusDemand > 0;
  const underplanned =
    focusDemand > 0 && focusDemand < deepWorkCapacityMinutes * 0.3 && deepWorkCapacityMinutes > 120;

  let capacityMessage: string;
  if (overloaded) {
    capacityMessage = `This plan exceeds realistic focus capacity by ~${Math.round(overshoot)} minutes.`;
  } else if (underplanned) {
    capacityMessage = `Only ~${Math.round(focusDemand)} min planned against ~${Math.round(
      deepWorkCapacityMinutes,
    )} min of focus capacity — the day is underplanned.`;
  } else {
    capacityMessage = `Plan fits realistic capacity: ~${Math.round(
      deepWorkCapacityMinutes,
    )} min of focus capacity available.`;
  }

  const capacity: CapacityBudget = {
    totalAvailableMinutes,
    scheduledMinutes,
    plannedTaskMinutes,
    deepWorkCapacityMinutes,
    recoveryReserveMinutes,
    maintenanceReserveMinutes: maintenanceReserve,
    fragmentedMinutes,
    overloadScore: round(overloadScore),
    overloaded,
    underplanned,
    message: capacityMessage,
  };

  // ── Warnings ──────────────────────────────────────────────────────────────
  const warnings: string[] = [];
  if (!recoveryReserveProtected) {
    warnings.push("Recovery reserve is not protected — the day has too little open time for meals and decompression.");
  }
  if (overloaded) warnings.push(capacityMessage);
  if (fragmentedMinutes > totalAvailableMinutes * 0.5 && totalAvailableMinutes > 0) {
    warnings.push("Most open time is fragmented into short windows — deep work will be hard to protect.");
  }
  const lateNightLoad = mergedRanges.some((range) => range.end > 21 * 60);
  if (lateNightLoad) {
    warnings.push("Work is scheduled past 21:00 — late-night cognitive decay makes this unrealistic.");
  }
  if (deepWorkWindows.length === 0) {
    warnings.push("No window is long enough for deep work.");
  }

  // ── Realism score (1-10) ──────────────────────────────────────────────────
  let realismScore = 10;
  const transitionDensity = occupied.length;
  if (totalAvailableMinutes < 120) realismScore -= 3;
  else if (totalAvailableMinutes < 240) realismScore -= 1.5;
  if (overloaded) realismScore -= clamp(overloadScore / 2, 0, 4);
  if (!recoveryReserveProtected) realismScore -= 2;
  if (fragmentedMinutes > totalAvailableMinutes * 0.5 && totalAvailableMinutes > 0) {
    realismScore -= 1.5;
  }
  if (lateNightLoad) realismScore -= 1;
  if (transitionDensity >= 6) realismScore -= 1;
  if ((input.carryForwardPressure ?? 0) >= 5) realismScore -= 1;
  realismScore = clamp(realismScore, 1, 10);

  let bottleneck = "Plan looks realistic.";
  let correction = "Protect the top deep-work window and keep the recovery reserve.";
  if (overloaded) {
    bottleneck = "Planned work exceeds realistic focus capacity.";
    correction = `Cut or defer ~${Math.round(overshoot)} minutes of work.`;
  } else if (!recoveryReserveProtected) {
    bottleneck = "No protected recovery reserve.";
    correction = "Clear a fixed anchor or shorten a block so meals and decompression fit.";
  } else if (fragmentedMinutes > totalAvailableMinutes * 0.5 && totalAvailableMinutes > 0) {
    bottleneck = "Open time is too fragmented for deep work.";
    correction = "Consolidate anchors to open one continuous 90-minute block.";
  } else if (lateNightLoad) {
    bottleneck = "Late-night load conflicts with cognitive decay.";
    correction = "Move post-21:00 work earlier or drop it.";
  } else if (totalAvailableMinutes < 120) {
    bottleneck = "Very little open time after fixed commitments.";
    correction = "Pick one Must Do and let the rest carry forward.";
  } else if (deepWorkWindows.length === 0) {
    bottleneck = "No deep-work-sized window exists.";
    correction = "Free a 60+ minute block by moving a flexible anchor.";
  }

  const realism: PlanningRealism = {
    score: round(realismScore),
    bottleneck,
    correction,
  };

  return {
    date: input.date,
    sleepWindow: { start: sleepTime, end: wakeTime },
    shutdownReserve: {
      start: minutesToTime(shutdownStartMin),
      end: sleepTime,
    },
    occupied,
    openWindows,
    largestWindow,
    deepWorkWindows,
    lowEnergyWindows,
    capacity,
    realism,
    recoveryReserveProtected,
    warnings,
  };
}

// ── Schedule import realism validation ──────────────────────────────────────
export type ImportRealismIssue = {
  severity: "block" | "warn";
  message: string;
};

export type RealismCategory =
  | "overlap"
  | "anchor_conflict"
  | "outside_open_window"
  | "transition"
  | "shutdown_reserve"
  | "recovery_reserve"
  | "deep_work_capacity"
  | "high_energy_streak"
  | "late_night"
  | "missing_meal_window"
  | "invalid_duration";

export type RealismIssue = {
  severity: "block" | "warn";
  category: RealismCategory;
  message: string;
};

export type RealismReport = {
  score: number; // 1-10
  bottleneck: string;
  correction: string;
  issues: RealismIssue[];
};

export type RealismBlockInput = {
  start_time: string;
  end_time: string;
  title: string;
  block_type?: string;
};

type Classified = {
  start: number;
  end: number;
  title: string;
  type: string;
  isBreak: boolean;
  isDeepWork: boolean;
  isHighEnergy: boolean;
  isShallow: boolean;
};

function classifyBlock(block: RealismBlockInput): Classified {
  const start = parseTimeToMinutes(block.start_time);
  const end = parseTimeToMinutes(block.end_time);
  const type = (block.block_type ?? "").toLowerCase();
  const isBreak =
    type.includes("break") ||
    type.includes("recovery") ||
    type.includes("rest") ||
    type.includes("meal");
  const isDeepWork = type.includes("deep") || type.includes("focus") || type.includes("study");
  const isHighEnergy =
    isDeepWork ||
    type.includes("workout") ||
    type.includes("training") ||
    type.includes("high");
  const isShallow = type.includes("shallow") || type.includes("admin");
  return { start, end, title: block.title, type, isBreak, isDeepWork, isHighEnergy, isShallow };
}

function transitionRequirement(prev: Classified, next: Classified): number {
  if (prev.isBreak || next.isBreak) return 0;
  if (prev.isDeepWork && next.isDeepWork) return 10;
  return 5;
}

const BOTTLENECK_PRIORITY: RealismCategory[] = [
  "overlap",
  "anchor_conflict",
  "shutdown_reserve",
  "invalid_duration",
  "deep_work_capacity",
  "recovery_reserve",
  "outside_open_window",
  "high_energy_streak",
  "late_night",
  "transition",
  "missing_meal_window",
];

const CORRECTION_BY_CATEGORY: Record<RealismCategory, string> = {
  overlap: "Move or shorten one of the overlapping blocks so they don't double-book the same window.",
  anchor_conflict: "Reschedule the imported block outside the fixed anchor.",
  shutdown_reserve: "Pull the block earlier so it ends before the shutdown reserve.",
  invalid_duration: "Fix the end time so it falls after the start time.",
  deep_work_capacity: "Cut a deep-work block or move it to tomorrow — capacity is already maxed.",
  recovery_reserve: "Free a 60+ minute gap so meals and decompression fit.",
  outside_open_window: "Move the block into a realistic open window between wake and shutdown.",
  high_energy_streak: "Insert a break/recovery block between high-energy sessions.",
  late_night: "Move post-21:00 cognitive work earlier in the day.",
  transition: "Add a buffer between back-to-back blocks so context switching is realistic.",
  missing_meal_window: "Add a short break or meal block in the 11–14 or 17–20 window.",
};

export function evaluateImportRealism(input: {
  blocks: RealismBlockInput[];
  snapshot?: PlanningSnapshot;
  anchors?: CalendarAnchor[];
  dayDate?: string;
}): RealismReport {
  const issues: RealismIssue[] = [];
  const classified = input.blocks.map(classifyBlock);
  const sorted = [...classified].sort((a, b) => a.start - b.start);

  // 1 + invalid_duration: per-block sanity + pairwise overlap
  for (let i = 0; i < sorted.length; i++) {
    const block = sorted[i];
    if (block.end <= block.start) {
      issues.push({
        severity: "block",
        category: "invalid_duration",
        message: `"${block.title}" has a non-positive duration.`,
      });
      continue;
    }
    for (let j = i + 1; j < sorted.length; j++) {
      const other = sorted[j];
      if (other.end <= other.start) continue;
      if (other.start >= block.end) break;
      issues.push({
        severity: "block",
        category: "overlap",
        message: `"${block.title}" overlaps "${other.title}".`,
      });
    }
  }

  // 2: anchor conflicts
  const anchors = (input.anchors ?? []).filter(
    (a) => !input.dayDate || a.date === input.dayDate,
  );
  for (const block of sorted) {
    if (block.end <= block.start) continue;
    for (const anchor of anchors) {
      const aStart = parseTimeToMinutes(anchor.start_time);
      const aEnd = parseTimeToMinutes(anchor.end_time);
      if (aEnd <= aStart) continue;
      if (block.start < aEnd && aStart < block.end) {
        issues.push({
          severity: "block",
          category: "anchor_conflict",
          message: `"${block.title}" overlaps fixed anchor "${anchor.title}".`,
        });
      }
    }
  }

  // 3 + 5: snapshot-dependent — outside open windows + shutdown reserve
  if (input.snapshot) {
    const snap = input.snapshot;
    const wakeMin = parseTimeToMinutes(snap.sleepWindow.end); // sleepWindow.end is wake time
    const shutdownStart = parseTimeToMinutes(snap.shutdownReserve.start);
    const sleepStart = parseTimeToMinutes(snap.sleepWindow.start);

    for (const block of sorted) {
      if (block.end <= block.start) continue;
      if (block.isBreak) continue; // breaks can fall anywhere
      if (block.start < wakeMin) {
        issues.push({
          severity: "warn",
          category: "outside_open_window",
          message: `"${block.title}" starts before wake (${snap.sleepWindow.end}).`,
        });
      }
      // Shutdown reserve [shutdownStart, sleepStart) is protected.
      if (block.end > shutdownStart && block.start < sleepStart) {
        issues.push({
          severity: "block",
          category: "shutdown_reserve",
          message: `"${block.title}" overlaps the shutdown reserve (${snap.shutdownReserve.start}–${snap.sleepWindow.start}).`,
        });
      } else if (block.end > sleepStart) {
        issues.push({
          severity: "warn",
          category: "outside_open_window",
          message: `"${block.title}" runs past sleep (${snap.sleepWindow.start}).`,
        });
      }
    }

    // 6: recovery reserve
    const nonBreakMinutes = sorted
      .filter((b) => !b.isBreak && b.end > b.start)
      .reduce((sum, b) => sum + (b.end - b.start), 0);
    const totalAvail = snap.capacity.totalAvailableMinutes;
    const reserve = snap.capacity.recoveryReserveMinutes;
    if (totalAvail > 0 && nonBreakMinutes > totalAvail - reserve) {
      const overshoot = Math.round(nonBreakMinutes - (totalAvail - reserve));
      issues.push({
        severity: "warn",
        category: "recovery_reserve",
        message: `Imported work consumes the recovery reserve by ~${overshoot} min (meals/decompression unprotected).`,
      });
    }

    // 7: deep-work capacity
    const deepMinutes = sorted
      .filter((b) => b.isDeepWork && b.end > b.start)
      .reduce((sum, b) => sum + (b.end - b.start), 0);
    if (deepMinutes > snap.capacity.deepWorkCapacityMinutes) {
      const overshoot = Math.round(deepMinutes - snap.capacity.deepWorkCapacityMinutes);
      issues.push({
        severity: "warn",
        category: "deep_work_capacity",
        message: `Deep-work load exceeds capacity by ~${overshoot} min.`,
      });
    }
  }

  // 4: transitions
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a.end <= a.start || b.end <= b.start) continue;
    if (b.start < a.end) continue; // already counted as overlap
    const required = transitionRequirement(a, b);
    const gap = b.start - a.end;
    if (gap < required) {
      issues.push({
        severity: "warn",
        category: "transition",
        message: `Transition "${a.title}" → "${b.title}" leaves ${gap} min (needs ${required}).`,
      });
    }
  }

  // 8: high-energy streak (3+ consecutive without a break)
  let streak = 0;
  let streakStart = "";
  for (const block of sorted) {
    if (block.end <= block.start) continue;
    if (block.isBreak) {
      streak = 0;
      streakStart = "";
      continue;
    }
    if (block.isHighEnergy) {
      if (streak === 0) streakStart = block.title;
      streak += 1;
      if (streak === 3) {
        issues.push({
          severity: "warn",
          category: "high_energy_streak",
          message: `3+ high-energy blocks back-to-back starting at "${streakStart}" with no recovery.`,
        });
      }
    } else {
      streak = 0;
      streakStart = "";
    }
  }

  // 9: late-night cognitive load
  for (const block of sorted) {
    if (block.end <= block.start || block.isBreak) continue;
    if ((block.isDeepWork || block.isShallow) && block.start >= 21 * 60) {
      issues.push({
        severity: "warn",
        category: "late_night",
        message: `"${block.title}" starts after 21:00 — cognitive decay makes this unrealistic.`,
      });
    } else if (block.end > 23 * 60) {
      issues.push({
        severity: "warn",
        category: "late_night",
        message: `"${block.title}" runs past 23:00 — late-night overload.`,
      });
    }
  }

  // 10: missing meal/recovery windows
  const meals = [
    { label: "midday (11–14)", start: 11 * 60, end: 14 * 60 },
    { label: "evening (17–20)", start: 17 * 60, end: 20 * 60 },
  ];
  if (sorted.length > 0) {
    for (const meal of meals) {
      const dayCoversMeal = sorted.some((b) => b.end > meal.start && b.start < meal.end);
      if (!dayCoversMeal) continue;
      const hasBreak = sorted.some(
        (b) => b.isBreak && b.end > meal.start && b.start < meal.end,
      );
      if (!hasBreak) {
        issues.push({
          severity: "warn",
          category: "missing_meal_window",
          message: `No break or meal block in the ${meal.label} window.`,
        });
      }
    }
  }

  // Score
  const blockCount = issues.filter((i) => i.severity === "block").length;
  const warnCount = issues.filter((i) => i.severity === "warn").length;
  let score = 10 - blockCount * 2 - warnCount * 0.5;
  score = clamp(round(score), 1, 10);

  let bottleneck = "Schedule looks realistic.";
  let correction = "Keep the recovery reserve and avoid stacking deep-work blocks.";
  if (issues.length > 0) {
    const sortedIssues = [...issues].sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "block" ? -1 : 1;
      return BOTTLENECK_PRIORITY.indexOf(a.category) - BOTTLENECK_PRIORITY.indexOf(b.category);
    });
    const top = sortedIssues[0];
    bottleneck = top.message;
    correction = CORRECTION_BY_CATEGORY[top.category];
  }

  return { score, bottleneck, correction, issues };
}

// Backward-compatible wrapper. Existing callers receive the legacy shape.
export function validateImportRealism(
  blocks: RealismBlockInput[],
): ImportRealismIssue[] {
  return evaluateImportRealism({ blocks }).issues.map((issue) => ({
    severity: issue.severity,
    message: issue.message,
  }));
}

// ── Prompt-facing summary ───────────────────────────────────────────────────
export function summarizePlanningSnapshot(snapshot: PlanningSnapshot): string {
  const windowLines = snapshot.openWindows.length
    ? snapshot.openWindows
        .map(
          (window) =>
            `- ${window.start}-${window.end} | ${window.durationMinutes} min | ${window.quality} | energy ${window.energyScore}/10`,
        )
        .join("\n")
    : "- none";

  const deepWorkLines = snapshot.deepWorkWindows.length
    ? snapshot.deepWorkWindows
        .map(
          (window, index) =>
            `${index + 1}. ${window.start}-${window.end} · ${window.quality} (deep-work score ${window.deepWorkScore}/10)`,
        )
        .join("\n")
    : "none";

  return [
    `Sleep window: ${snapshot.sleepWindow.start}-${snapshot.sleepWindow.end} (protected)`,
    `Shutdown reserve: ${snapshot.shutdownReserve.start}-${snapshot.shutdownReserve.end} (protected)`,
    `Recovery reserve: ${snapshot.recoveryReserveProtected ? "protected" : "AT RISK"} (~${snapshot.capacity.recoveryReserveMinutes} min)`,
    `Realistic open windows (do not schedule outside these):`,
    windowLines,
    `Best deep-work windows:`,
    deepWorkLines,
    `Realistic capacity: ~${Math.round(snapshot.capacity.deepWorkCapacityMinutes)} min focus · ${snapshot.capacity.message}`,
    `Plan realism: ${snapshot.realism.score}/10 · bottleneck: ${snapshot.realism.bottleneck} · correction: ${snapshot.realism.correction}`,
    snapshot.warnings.length ? `Warnings:\n${snapshot.warnings.map((w) => `- ${w}`).join("\n")}` : "Warnings: none",
  ].join("\n");
}
