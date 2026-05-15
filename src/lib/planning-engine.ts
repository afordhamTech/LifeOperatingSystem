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

export function validateImportRealism(
  blocks: Array<{ start_time: string; end_time: string; title: string; block_type?: string }>,
): ImportRealismIssue[] {
  const issues: ImportRealismIssue[] = [];
  const sorted = [...blocks].sort(
    (a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time),
  );

  let continuousFocus = 0;
  for (let i = 0; i < sorted.length; i++) {
    const block = sorted[i];
    const start = parseTimeToMinutes(block.start_time);
    const end = parseTimeToMinutes(block.end_time);
    const type = (block.block_type ?? "").toLowerCase();
    const isBreak = type.includes("break") || type.includes("recovery") || type.includes("rest");

    if (end <= start) {
      issues.push({ severity: "block", message: `"${block.title}" has a non-positive duration.` });
    }
    if (end > 23 * 60) {
      issues.push({
        severity: "warn",
        message: `"${block.title}" runs past 23:00 — late-night overload.`,
      });
    }

    const next = sorted[i + 1];
    if (next) {
      const nextStart = parseTimeToMinutes(next.start_time);
      if (nextStart < end) {
        issues.push({
          severity: "block",
          message: `"${block.title}" overlaps "${next.title}".`,
        });
      } else if (nextStart - end < 5 && !isBreak) {
        issues.push({
          severity: "warn",
          message: `Impossible transition: "${block.title}" → "${next.title}" leaves under 5 minutes.`,
        });
      }
    }

    if (isBreak) {
      continuousFocus = 0;
    } else {
      continuousFocus += end - start;
      if (continuousFocus > 180) {
        issues.push({
          severity: "warn",
          message: "Over 3 hours of continuous focus with no recovery block — unrealistic.",
        });
        continuousFocus = 0;
      }
    }
  }

  return issues;
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
