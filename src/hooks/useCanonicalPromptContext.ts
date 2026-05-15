// Canonical AI Prompt Drawer context.
// The AI Prompt Drawer is mounted in the app layout and is reachable from
// every page, so its context cannot depend on whichever page happens to be
// mounted. This hook loads canonical Supabase-backed state once (per session)
// and assembles the data-backed PromptBuilderContext fields so every export
// reflects real app state instead of stale placeholder text.

import { useEffect, useMemo, useState } from "react";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import { supabase } from "@/lib/supabase-client";
import { toDateKey, getWeekStartDateKey } from "@/lib/date-helpers";
import {
  fetchAcademicTasks,
  fetchCalendarAnchors,
  fetchDailyPlan,
  fetchFaithEntry,
  fetchNutritionLog,
  fetchProofItems,
  fetchRelationshipEntries,
  fetchSleepLog,
  fetchTimeBlocks,
  fetchUniversalTasks,
  fetchWeeklyReview,
  fetchWorkoutLog,
} from "@/lib/lifeee-persistence";
import {
  buildTaskSmartViews,
  type Task,
} from "@/lib/task-system";
import {
  summarizeAnchors,
  summarizeTaskCandidates,
} from "@/lib/today-decision-loop";
import { aggregateExecutionStats } from "@/lib/execution-truth";
import { buildPlanningSnapshot, summarizePlanningSnapshot } from "@/lib/planning-engine";
import { getMcatDailyNextMove, loadMcatFoundationState } from "@/lib/mcat-foundation";
import { calcNutritionStatus } from "@/lib/calculations";
import type { PromptBuilderContext } from "@/lib/prompt-builders";

function dedupeById(tasks: Task[]): Task[] {
  const seen = new Set<string>();
  const result: Task[] = [];
  for (const task of tasks) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    result.push(task);
  }
  return result;
}

export function useCanonicalPromptContext(): PromptBuilderContext {
  const { hasSupabaseConfig, userId } = useSupabaseSession();
  const [context, setContext] = useState<PromptBuilderContext>({});

  const today = useMemo(() => toDateKey(), []);
  const weekStart = useMemo(() => getWeekStartDateKey(new Date()), []);

  useEffect(() => {
    let active = true;

    if (!hasSupabaseConfig || !userId || !supabase) {
      setContext({});
      return;
    }

    const client = supabase;

    const load = async () => {
      const safe = async <T,>(promise: Promise<T>, fallback: T): Promise<T> => {
        try {
          return await promise;
        } catch {
          return fallback;
        }
      };

      const [
        tasks,
        anchors,
        timeBlocks,
        dailyPlan,
        sleepRow,
        workoutRow,
        nutritionRow,
        weeklyReview,
        academicTasks,
        proofItems,
        faithEntry,
        relationshipEntries,
        dailyLogResult,
      ] = await Promise.all([
        safe(fetchUniversalTasks(userId), [] as Task[]),
        safe(fetchCalendarAnchors(userId), []),
        safe(fetchTimeBlocks(userId, today, today), []),
        safe(fetchDailyPlan(userId, today), null),
        safe(fetchSleepLog(userId, today), null),
        safe(fetchWorkoutLog(userId, today), null),
        safe(fetchNutritionLog(userId, today), null),
        safe(fetchWeeklyReview(userId, weekStart), null),
        safe(fetchAcademicTasks(userId), []),
        safe(fetchProofItems(userId), []),
        safe(fetchFaithEntry(userId, today), null),
        safe(fetchRelationshipEntries(userId), []),
        safe(
          Promise.resolve(
            client
              .from("daily_logs")
              .select("*")
              .eq("user_id", userId)
              .eq("date", today)
              .maybeSingle(),
          ).then((res) => (res.data as Record<string, unknown> | null) ?? null),
          null as Record<string, unknown> | null,
        ),
      ]);

      if (!active) return;

      const currentEnergy = Number(
        (dailyLogResult?.energy as number | undefined) ??
          sleepRow?.wake_energy ??
          5,
      );
      const sleepReadiness = Number(sleepRow?.sleep_readiness ?? 0);
      const academicRisk = Math.min(10, academicTasks.length);

      // ── Tasks ───────────────────────────────────────────────────────────
      const smartViews = buildTaskSmartViews(tasks, { today, currentEnergy });
      const exportableTasks = dedupeById([
        ...smartViews.committedToday,
        ...smartViews.exportablePlanningSet,
        ...smartViews.inboxCandidates,
        ...smartViews.quickWins,
        ...smartViews.driftRisk,
        ...smartViews.trustProtectors,
      ]);
      const taskSummary = summarizeTaskCandidates(exportableTasks);

      // ── Calendar / timeline ─────────────────────────────────────────────
      const calendarSummary = summarizeAnchors(anchors, today);
      const timelineSummary = calendarSummary;

      // ── Execution truth ─────────────────────────────────────────────────
      let executionTruthSummary: string | undefined;
      if (timeBlocks.length > 0) {
        const exec = aggregateExecutionStats(timeBlocks);
        executionTruthSummary = `${exec.total} blocks · ${exec.completed} done · ${exec.partial} partial · ${exec.missed} missed · ${exec.skipped} skipped · ${exec.notStarted} not started${
          exec.mostCommonMissedReason
            ? ` · top miss reason: ${exec.mostCommonMissedReason}`
            : ""
        }`;
      }
      if (dailyPlan?.lock_status) {
        executionTruthSummary = `${executionTruthSummary ?? "No time blocks today"} · plan ${dailyPlan.lock_status} · plan changes ${dailyPlan.plan_change_count ?? 0}`;
      }

      // ── Reality-constrained planning ────────────────────────────────────
      const plannedTaskMinutes = smartViews.committedToday.reduce(
        (sum, task) => sum + (task.estimated_minutes ?? 0),
        0,
      );
      const carryForwardPressure = Math.min(
        10,
        tasks.reduce((max, task) => Math.max(max, task.carry_forward_count ?? 0), 0),
      );
      const planningSnapshot = buildPlanningSnapshot({
        date: today,
        anchors,
        timeBlocks,
        sleepDebtHours: Number(sleepRow?.sleep_debt ?? 0),
        plannedTaskMinutes,
        carryForwardPressure,
      });
      const planningSummary = summarizePlanningSnapshot(planningSnapshot);

      // ── Sleep ───────────────────────────────────────────────────────────
      const sleepSummary = sleepRow
        ? `Readiness ${Number(sleepRow.sleep_readiness ?? 0).toFixed(1)}/10 · ${sleepRow.hours_slept ?? "—"}h slept · debt ${sleepRow.sleep_debt ?? "—"}h · bedtime ${sleepRow.bedtime ?? "—"} · wake ${sleepRow.wake_time ?? "—"} · quality ${sleepRow.sleep_quality ?? "—"} · wake energy ${sleepRow.wake_energy ?? "—"}`
        : undefined;

      // ── Academics ───────────────────────────────────────────────────────
      const topAcademic = academicTasks[0];
      const academicTaskRows = [...smartViews.committedToday, ...smartViews.exportablePlanningSet]
        .filter((task) => task.task_type === "Academic")
        .slice(0, 6);
      const academicsSummary = topAcademic
        ? `Top academic: ${topAcademic.task_name} (${topAcademic.class_name}) due ${topAcademic.due_date} · priority ${Number(topAcademic.priority_score ?? 0).toFixed(1)} · ${academicTasks.length} pending academic task(s)${
            academicTaskRows.length
              ? ` · canonical Academic tasks: ${academicTaskRows.map((task) => task.task_code).join(", ")}`
              : ""
          }`
        : academicTaskRows.length
          ? `Canonical Academic tasks: ${academicTaskRows.map((task) => `${task.task_code} ${task.title}`).join("; ")}`
          : undefined;

      // ── MCAT ────────────────────────────────────────────────────────────
      let mcatSummary: string | undefined;
      try {
        const mcatState = loadMcatFoundationState();
        const move = getMcatDailyNextMove(mcatState, { academicRisk, sleepReadiness });
        mcatSummary = `${move.title} — ${move.detail} (topic: ${move.topic})`;
      } catch {
        mcatSummary = undefined;
      }

      // ── Workout ─────────────────────────────────────────────────────────
      const workoutSummary = workoutRow
        ? `${workoutRow.workout_type ?? "Workout"} · ${Number(workoutRow.duration_minutes ?? 0)} min · readiness ${Number(workoutRow.training_readiness ?? 0).toFixed(1)} · soreness ${workoutRow.soreness ?? "—"} · pain ${workoutRow.pain ?? "—"}`
        : undefined;

      // ── Nutrition ───────────────────────────────────────────────────────
      let nutritionSummary: string | undefined;
      if (nutritionRow) {
        const status = calcNutritionStatus(
          Number(nutritionRow.calories ?? 0),
          Number(nutritionRow.protein_g ?? 0),
          Number(nutritionRow.water_oz ?? 0),
          Number(nutritionRow.meals_count ?? 0),
        );
        nutritionSummary = `${status.checks}/4 checks · ${Number(nutritionRow.calories ?? 0)} cal · ${Number(nutritionRow.protein_g ?? 0)}g protein · ${Number(nutritionRow.water_oz ?? 0)}oz water · bodyweight ${nutritionRow.bodyweight ?? "—"}`;
      }

      // ── Weekly review ───────────────────────────────────────────────────
      const weeklyReviewSummary = weeklyReview
        ? `Life score ${Number(weeklyReview.weekly_life_score ?? 0).toFixed(1)} · win: ${weeklyReview.biggest_win ?? "unset"} · leak: ${weeklyReview.biggest_leak ?? "unset"} · execution: ${weeklyReview.completed_blocks_count ?? 0} done / ${weeklyReview.missed_blocks_count ?? 0} missed / ${weeklyReview.partial_blocks_count ?? 0} partial / ${weeklyReview.skipped_blocks_count ?? 0} skipped`
        : undefined;

      // ── Faith ───────────────────────────────────────────────────────────
      const faithSummary = faithEntry
        ? `Passage ${faithEntry.bibleReading || faithEntry.chapterStudied || "—"} · prayer ${faithEntry.prayerDone ? "done" : "pending"} · lesson: ${faithEntry.mainLesson || "—"} · action: ${faithEntry.actionStep || "—"} · temptation: ${faithEntry.temptation || "—"} · church involvement ${faithEntry.churchInvolvement ? "yes" : "no"}`
        : undefined;

      // ── Relationships ───────────────────────────────────────────────────
      const relationshipSummary = relationshipEntries.length
        ? relationshipEntries
            .slice(0, 6)
            .map(
              (entry) =>
                `${entry.personName}: quality ${entry.conversationQuality}${
                  entry.followUpNeeded ? " · follow-up needed" : ""
                }${entry.unresolvedIssue ? ` · unresolved: ${entry.unresolvedIssue}` : ""}`,
            )
            .join("\n")
        : undefined;

      // ── Career proof ────────────────────────────────────────────────────
      const careerTasks = [...smartViews.committedToday, ...smartViews.exportablePlanningSet]
        .filter((task) => task.task_type === "Career" || task.task_type === "Connex / Project")
        .slice(0, 6);
      const careerProofSummary = proofItems.length
        ? `${proofItems.length} proof item(s): ${proofItems
            .slice(0, 6)
            .map(
              (item) =>
                `${item.projectName} (${item.artifactType}, score ${item.proofScore.toFixed(1)})`,
            )
            .join("; ")}${
            careerTasks.length
              ? ` · career tasks: ${careerTasks.map((task) => task.task_code).join(", ")}`
              : ""
          }`
        : careerTasks.length
          ? `Career tasks: ${careerTasks.map((task) => `${task.task_code} ${task.title}`).join("; ")}`
          : undefined;

      // ── Anti-drift ──────────────────────────────────────────────────────
      const antiDriftLines: string[] = [];
      if (dailyPlan?.main_bottleneck) {
        antiDriftLines.push(`Computed bottleneck: ${dailyPlan.main_bottleneck}`);
      }
      if (dailyPlan?.notes) {
        antiDriftLines.push(`Plan note: ${dailyPlan.notes}`);
      }
      if (smartViews.ignoreToday.length) {
        antiDriftLines.push(
          `Ignored today: ${smartViews.ignoreToday.map((task) => `${task.task_code} ${task.title}`).join("; ")}`,
        );
      }
      if (smartViews.driftRisk.length) {
        antiDriftLines.push(
          `Drift risk: ${smartViews.driftRisk.map((task) => `${task.task_code} ${task.title}`).join("; ")}`,
        );
      }
      const antiDriftSummary = antiDriftLines.length ? antiDriftLines.join("\n") : undefined;

      const next: PromptBuilderContext = {
        operatingMode: dailyPlan?.operating_mode ?? undefined,
        taskSummary,
        timelineSummary,
        calendarSummary,
        executionTruthSummary,
        planningSummary,
        sleepSummary,
        academicsSummary,
        mcatSummary,
        workoutSummary,
        nutritionSummary,
        weeklyReviewSummary,
        faithSummary,
        relationshipSummary,
        careerProofSummary,
        antiDriftSummary,
      };

      setContext(next);
    };

    void load();

    return () => {
      active = false;
    };
  }, [hasSupabaseConfig, today, userId, weekStart]);

  return context;
}
