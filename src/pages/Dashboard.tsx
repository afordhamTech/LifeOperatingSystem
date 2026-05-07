import { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  AlertTriangle,
  CalendarClock,
  CheckCheck,
  CheckCircle2,
  Circle,
  Copy,
  FlaskConical,
  Loader2,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import DailyLogPanel from "@/components/DailyLogPanel";
import { DailyOpModeChip, deriveDailyOpMode } from "@/components/DailyOpModeChip";
import StatusRing, { getStatusColor } from "@/components/StatusRing";
import { SyncBadge } from "@/components/SyncBadge";
import { supabase } from "@/lib/supabase-client";
import type {
  AcademicTaskRow,
  DailyLogRow,
  NutritionLogRow,
  SleepLogRow,
  WeeklyReviewRow,
  WorkoutLogRow,
} from "@/lib/supabase-types";
import { calcNutritionStatus } from "@/lib/calculations";
import { calculateWeeklyLifeScore } from "@/lib/life-scoring";
import { toDateKey } from "@/lib/date-helpers";
import { getMcatDailyNextMove, loadMcatFoundationState } from "@/lib/mcat-foundation";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import { Link } from "react-router";
import { buildDayPlan, loadTasks, type Task } from "@/lib/task-system";
import {
  buildDailyPlanPayload,
  fetchCalendarAnchors,
  fetchUniversalTasks,
  type LifeeeSyncStatus,
  upsertDailyPlan,
} from "@/lib/lifeee-persistence";
import {
  CATEGORY_COLORS,
  buildCalendarPlanningPrompt,
  buildTodayTimeline,
  calculateAvailableTime,
  calculateRealityScore,
  parseTimeToMinutes,
  type CalendarAnchor,
  loadAnchors,
} from "@/lib/calendar-system";

type DashboardState = {
  dailyLog: DailyLogRow | null;
  sleepToday: SleepLogRow | null;
  sleepWeek: SleepLogRow[];
  tasks: AcademicTaskRow[];
  workoutToday: WorkoutLogRow | null;
  workoutWeek: WorkoutLogRow[];
  nutritionToday: NutritionLogRow | null;
  weeklyReview: WeeklyReviewRow | null;
};

const emptyState: DashboardState = {
  dailyLog: null,
  sleepToday: null,
  sleepWeek: [],
  tasks: [],
  workoutToday: null,
  workoutWeek: [],
  nutritionToday: null,
  weeklyReview: null,
};

function rowExercises(row: WorkoutLogRow | null) {
  if (!row || !Array.isArray(row.exercises)) return [];
  return row.exercises.filter(Boolean) as Array<{ name?: string }>;
}

export default function Dashboard() {
  const today = useMemo(() => toDateKey(new Date()), []);
  const weekStart = useMemo(() => {
    const date = new Date();
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    return toDateKey(date);
  }, []);
  const { hasSupabaseConfig, userId } = useSupabaseSession();
  const [state, setState] = useState<DashboardState>(emptyState);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taskList, setTaskList] = useState<Task[]>(() => loadTasks());
  const [anchorList, setAnchorList] = useState<CalendarAnchor[]>(() => loadAnchors());
  const [planSyncStatus, setPlanSyncStatus] = useState<LifeeeSyncStatus>("local");
  const [planSyncError, setPlanSyncError] = useState<string | null>(null);
  const planSaveSequenceRef = useRef(0);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!supabase || !userId) {
        if (!active) return;
        setTaskList(loadTasks());
        setAnchorList(loadAnchors());
        setPlanSyncStatus(hasSupabaseConfig ? "waiting" : "local");
        setIsLoading(false);
        setNotice(
          hasSupabaseConfig
            ? "No Supabase session yet. The dashboard shows local drafts and placeholders until auth is connected."
            : "Supabase env vars are missing. The dashboard is still usable in local draft mode.",
        );
        return;
      }

      setIsLoading(true);
      setError(null);

      const start = new Date();
      start.setDate(start.getDate() - 6);

      const [
        dailyLogResult,
        sleepTodayResult,
        sleepWeekResult,
        tasksResult,
        workoutTodayResult,
        workoutWeekResult,
        nutritionTodayResult,
        weeklyReviewResult,
        universalTasksResult,
        calendarAnchorsResult,
      ] =
        await Promise.all([
          supabase
            .from("daily_logs")
            .select("*")
            .eq("user_id", userId)
            .eq("date", today)
            .maybeSingle(),
          supabase
            .from("sleep_logs")
            .select("*")
            .eq("user_id", userId)
            .eq("date", today)
            .maybeSingle(),
          supabase
            .from("sleep_logs")
            .select("*")
            .eq("user_id", userId)
            .gte("date", toDateKey(start))
            .lte("date", today)
            .order("date", { ascending: true }),
          supabase
            .from("academic_tasks")
            .select("*")
            .eq("user_id", userId)
            .eq("status", "pending")
            .order("priority_score", { ascending: false }),
          supabase
            .from("workout_logs")
            .select("*")
            .eq("user_id", userId)
            .eq("date", today)
            .maybeSingle(),
          supabase
            .from("workout_logs")
            .select("*")
            .eq("user_id", userId)
            .gte("date", toDateKey(start))
            .lte("date", today)
            .order("date", { ascending: true }),
          supabase
            .from("nutrition_logs")
            .select("*")
            .eq("user_id", userId)
            .eq("date", today)
            .maybeSingle(),
          supabase
            .from("weekly_reviews")
            .select("*")
            .eq("user_id", userId)
            .eq("week_start", weekStart)
            .maybeSingle(),
          fetchUniversalTasks(userId)
            .then((data) => ({ data, error: null }))
            .catch((caughtError: unknown) => ({ data: [] as Task[], error: caughtError })),
          fetchCalendarAnchors(userId)
            .then((data) => ({ data, error: null }))
            .catch((caughtError: unknown) => ({ data: [] as CalendarAnchor[], error: caughtError })),
        ]);

      if (!active) return;

      const firstError =
        dailyLogResult.error ??
        sleepTodayResult.error ??
        sleepWeekResult.error ??
        tasksResult.error ??
        workoutTodayResult.error ??
        workoutWeekResult.error ??
        nutritionTodayResult.error ??
        weeklyReviewResult.error ??
        universalTasksResult.error ??
        calendarAnchorsResult.error;

      if (firstError) {
        setError(firstError instanceof Error ? firstError.message : "Dashboard Supabase load failed.");
      }

      setState({
        dailyLog: (dailyLogResult.data as DailyLogRow | null) ?? null,
        sleepToday: (sleepTodayResult.data as SleepLogRow | null) ?? null,
        sleepWeek: (sleepWeekResult.data ?? []) as SleepLogRow[],
        tasks: (tasksResult.data ?? []) as AcademicTaskRow[],
        workoutToday: (workoutTodayResult.data as WorkoutLogRow | null) ?? null,
        workoutWeek: (workoutWeekResult.data ?? []) as WorkoutLogRow[],
        nutritionToday: (nutritionTodayResult.data as NutritionLogRow | null) ?? null,
        weeklyReview: (weeklyReviewResult.data as WeeklyReviewRow | null) ?? null,
      });
      setTaskList(universalTasksResult.data);
      setAnchorList(calendarAnchorsResult.data);

      setIsLoading(false);
      setPlanSyncStatus("local");
      setNotice("Dashboard loaded from Supabase.");
    };

    void load();

    return () => {
      active = false;
    };
  }, [hasSupabaseConfig, today, userId, weekStart]);

  const sleepScore = Number(state.sleepToday?.sleep_readiness ?? 0);
  const academicScore = Number(state.tasks[0]?.priority_score ?? 0);
  const workoutScore = Number(state.workoutToday?.training_readiness ?? 0);
  const nutritionStatus = state.nutritionToday
    ? calcNutritionStatus(
        Number(state.nutritionToday.calories ?? 0),
        Number(state.nutritionToday.protein_g ?? 0),
        Number(state.nutritionToday.water_oz ?? 0),
        Number(state.nutritionToday.meals_count ?? 0),
        Number(state.nutritionToday.bodyweight ?? 150),
      )
    : null;
  const nutritionChecks = nutritionStatus?.checks ?? 0;

  const weeklyScore = state.weeklyReview
    ? Number(state.weeklyReview.weekly_life_score ?? 0)
    : calculateWeeklyLifeScore({
        academicsScore: academicScore || 5,
        sleepScore: sleepScore || 5,
        trainingScore: workoutScore || 5,
        nutritionScore: nutritionChecks ? (nutritionChecks / 4) * 10 : 5,
        careerProofScore: 5,
        faithSubstanceScore: 5,
        moneyAdminScore: 5,
      });

  const sleepChartData = state.sleepWeek.map((row) => ({
    day: new Date(row.date).toLocaleDateString("en-US", { weekday: "short" }),
    readiness: Number(row.sleep_readiness ?? 0),
    hours: Number(row.hours_slept ?? 0),
  }));

  const shouldDoTasks = state.tasks.slice(1, 3);
  const topTask = state.tasks[0];
  const workoutExercises = rowExercises(state.workoutToday).slice(0, 3);

  const statusAverage = (sleepScore + academicScore + workoutScore) / 3;
  const currentEnergy = Number(state.dailyLog?.energy ?? 7);
  const dayPlan = useMemo(
    () => buildDayPlan(taskList, currentEnergy),
    [taskList, currentEnergy],
  );

  const todayAnchors = useMemo(
    () =>
      anchorList
        .filter((a) => a.date === today)
        .sort((a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time)),
    [anchorList, today],
  );
  const sleepDebtHours = Number(state.sleepToday?.sleep_debt ?? 0);
  const availableTime = useMemo(
    () =>
      calculateAvailableTime(todayAnchors, {
        sleepDebtHours: Number.isFinite(sleepDebtHours) ? sleepDebtHours : 0,
      }),
    [todayAnchors, sleepDebtHours],
  );
  const todayTimeline = useMemo(
    () => buildTodayTimeline(todayAnchors, availableTime),
    [todayAnchors, availableTime],
  );
  const realityScore = useMemo(
    () =>
      calculateRealityScore({
        available: availableTime,
        plan: dayPlan,
        currentEnergy,
        sleepReadiness: sleepScore || 6,
        academicPressure: academicScore || 5,
        workoutReadiness: workoutScore || 6,
      }),
    [availableTime, dayPlan, currentEnergy, sleepScore, academicScore, workoutScore],
  );
  const operatingMode = useMemo(
    () => deriveDailyOpMode(realityScore.score, currentEnergy, sleepScore || 6),
    [currentEnergy, realityScore.score, sleepScore],
  );

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setPlanSyncStatus("local");
      return;
    }
    if (!userId) {
      setPlanSyncStatus("waiting");
      return;
    }
    if (isLoading || error) return;

    const saveSequence = planSaveSequenceRef.current + 1;
    planSaveSequenceRef.current = saveSequence;
    const timeout = window.setTimeout(() => {
      setPlanSyncStatus("saving");
      setPlanSyncError(null);

      const payload = {
        ...buildDailyPlanPayload({
          date: today,
          plan: dayPlan,
          realityScore: realityScore.score,
          mainBottleneck: realityScore.recommendations[0] ?? null,
          shutdownTime: availableTime.bestShutdownTarget,
        }),
        operating_mode: operatingMode,
      };

      void upsertDailyPlan(userId, payload)
        .then(() => {
          if (planSaveSequenceRef.current === saveSequence) {
            setPlanSyncStatus("saved");
          }
        })
        .catch((caughtError: unknown) => {
          if (planSaveSequenceRef.current !== saveSequence) return;
          setPlanSyncStatus("error");
          setPlanSyncError(
            caughtError instanceof Error ? caughtError.message : "Dashboard daily plan did not save.",
          );
        });
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [
    availableTime.bestShutdownTarget,
    dayPlan,
    error,
    hasSupabaseConfig,
    isLoading,
    operatingMode,
    realityScore.recommendations,
    realityScore.score,
    today,
    userId,
  ]);

  const [calendarPromptCopied, setCalendarPromptCopied] = useState(false);
  const copyCalendarPrompt = async () => {
    const text = buildCalendarPlanningPrompt({
      date: today,
      anchors: todayAnchors,
      available: availableTime,
      plan: dayPlan,
      currentEnergy,
      sleepReadiness: sleepScore || 6,
      academicPressure: academicScore || 5,
      workoutReadiness: workoutScore || 6,
      mcatNextMove: mcatNextMove?.title ?? "(see MCAT page)",
    });
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCalendarPromptCopied(true);
    setTimeout(() => setCalendarPromptCopied(false), 2000);
  };

  const mcatNextMove = useMemo(
    () =>
      getMcatDailyNextMove(loadMcatFoundationState(), {
        academicRisk: academicScore,
        sleepReadiness: sleepScore,
      }),
    [academicScore, sleepScore],
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="border-b border-[#ddd4c6] pb-4">
        <h1 className="text-2xl font-semibold text-[#25313c]">
          Daily Operating System
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <DailyOpModeChip mode={operatingMode} />
          <SyncBadge status={planSyncStatus} />
          {planSyncError ? <span className="text-xs text-destructive">{planSyncError}</span> : null}
        </div>
      </div>

      <div className="card-surface p-4 flex flex-wrap items-center justify-between gap-4">
        <StatusRing score={sleepScore} label="Sleep" size={60} />
        <div className="h-10 w-px bg-[#ece5da] hidden sm:block" />
        <StatusRing score={academicScore} label="Academics" size={60} />
        <div className="h-10 w-px bg-[#ece5da] hidden sm:block" />
        <StatusRing score={workoutScore} label="Workout" size={60} />
        <div className="h-10 w-px bg-[#ece5da] hidden sm:block" />
        <div className="flex flex-col items-center">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full ${
                  i < nutritionChecks ? "bg-[#6a9a74]" : "bg-[#ece5da]"
                }`}
              />
            ))}
          </div>
          <span className="text-[10px] uppercase tracking-wider text-[#6f685f] font-medium mt-1.5">
            Nutrition
          </span>
        </div>
        <div className="h-10 w-px bg-[#ece5da] hidden sm:block" />
        <div className="flex flex-col items-center">
          <span
            className="text-2xl font-bold"
            style={{ color: getStatusColor(statusAverage) }}
          >
            {statusAverage.toFixed(1)}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-[#6f685f] font-medium">
            Priority
          </span>
        </div>
        <div className="h-10 w-px bg-[#ece5da] hidden sm:block" />
        <div className="flex flex-col items-center">
          <span
            className="text-2xl font-bold"
            style={{ color: getStatusColor(weeklyScore) }}
          >
            {weeklyScore.toFixed(1)}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-[#6f685f] font-medium">
            Weekly
          </span>
        </div>
        <div className="h-10 w-px bg-[#ece5da] hidden sm:block" />
        <div className="text-right">
          <div className="text-sm text-[#25313c]">
            {new Date().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </div>
          <div className="text-xs text-[#6f685f]">
            {new Date().toLocaleDateString("en-US", { weekday: "long" })}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded border border-[#c97a73]/30 bg-[#c97a73]/10 px-3 py-2 text-xs text-[#c97a73]">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded border border-[#ddd4c6] bg-[#fdfaf4] px-3 py-2 text-xs text-[#6f685f]">
          {notice}
        </div>
      ) : null}
      {hasSupabaseConfig && !userId ? (
        <div className="rounded border border-[#6b87ae]/30 bg-[#6b87ae]/10 px-3 py-2 text-xs text-[#6b87ae]">
          Supabase is configured, but there is no session yet. The dashboard is
          still usable in draft mode.
        </div>
      ) : null}
      {!hasSupabaseConfig ? (
        <div className="rounded border border-[#c39a4e]/30 bg-[#c39a4e]/10 px-3 py-2 text-xs text-[#c39a4e]">
          Supabase env vars are missing. The dashboard still works locally.
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card-surface p-4 border-l-2 border-[#6b87ae]">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-[#6b87ae]" />
            <span className="text-[10px] uppercase tracking-wider text-[#6b87ae] font-semibold">
              Must Do
            </span>
          </div>
          {state.dailyLog?.must_do ? (
            <div className="text-sm font-semibold text-[#25313c]">
              {state.dailyLog.must_do}
            </div>
          ) : (
            <div className="text-sm text-[#8c8478]">
              No must-do captured yet. Add one decisive task for today.
            </div>
          )}
          <div className="mt-3 space-y-1 text-xs text-[#6f685f]">
            <div>Should do 1: {state.dailyLog?.should_do_1 ?? "Unset"}</div>
            <div>Should do 2: {state.dailyLog?.should_do_2 ?? "Unset"}</div>
          </div>
        </div>

        <div className="card-surface p-4 border-l-2 border-[#c39a4e]">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] uppercase tracking-wider text-[#c39a4e] font-semibold">
              Should Do
            </span>
          </div>
          <div className="space-y-2">
            {shouldDoTasks.length > 0 ? (
              shouldDoTasks.map((task) => (
                <div key={task.id} className="flex items-start gap-2">
                  <Circle size={14} className="text-[#8c8478] mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-sm text-[#25313c]">{task.task_name}</div>
                    <div className="text-[10px] text-[#6f685f]">
                      {task.class_name}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-[#8c8478]">
                Add tasks in Academics or capture a personal errand.
              </div>
            )}
          </div>
        </div>

        <div className="card-surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wrench size={12} className="text-[#6f685f]" />
            <span className="text-[10px] uppercase tracking-wider text-[#6f685f] font-semibold">
              Maintenance
            </span>
          </div>
          <div className="space-y-2">
            {state.dailyLog?.maintenance ? (
              <div className="flex items-start gap-2">
                <CheckCircle2 size={14} className="text-[#6a9a74] mt-0.5 flex-shrink-0" />
                <span className="text-sm text-[#6f685f]">
                  {state.dailyLog.maintenance}
                </span>
              </div>
            ) : (
              <div className="text-sm text-[#8c8478]">No maintenance logged yet. Add the small admin task that would make today easier.</div>
            )}
          </div>
        </div>
      </div>

      <div className="card-surface p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-[#6f685f] font-semibold">
              Today's Plan
            </div>
            <div className="text-sm text-[#25313c]">
              Saved to daily_plans from Task Command, Calendar, and energy. Energy: {currentEnergy}/10.
            </div>
          </div>
          <Link
            to="/tasks"
            className="rounded-md border border-[#ddd4c6] bg-white px-3 py-1.5 text-xs hover:bg-[#f7f3ec]"
          >
            Open Task Command →
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          <DayPlanCard label="Anchors" tasks={dayPlan.anchors} accent="#2f4f6f" />
          <DayPlanCard label="Must Do" tasks={dayPlan.mustDo} accent="#6b87ae" />
          <DayPlanCard label="Should Do 1" tasks={dayPlan.shouldDo.slice(0, 1)} accent="#c39a4e" />
          <DayPlanCard label="Should Do 2" tasks={dayPlan.shouldDo.slice(1, 2)} accent="#c39a4e" />
          <DayPlanCard label="Maintenance" tasks={dayPlan.maintenance} accent="#6f685f" />
          <DayPlanCard label="Quick Win" tasks={dayPlan.quickWins} accent="#6a9a74" />
          <DayPlanCard label="Ignore Today" tasks={dayPlan.ignoreToday} accent="#9b938a" muted />
        </div>
      </div>

      <div className="card-surface p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CalendarClock size={14} className="text-primary" />
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Today timeline · anchors + best windows
              </div>
            </div>
            <div className="text-sm text-foreground mt-1">
              {todayAnchors.length} fixed anchors · {availableTime.totalOpenMinutes} min open · shutdown {availableTime.bestShutdownTarget}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyCalendarPrompt}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs hover:bg-muted/70"
            >
              {calendarPromptCopied ? <CheckCheck size={12} /> : <Copy size={12} />}
              {calendarPromptCopied ? "Copied" : "Copy Calendar Planning Prompt"}
            </button>
            <Link
              to="/calendar"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted/70"
            >
              Open Calendar →
            </Link>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <div>
            {todayTimeline.length === 0 ? (
              <div className="empty-state">
                No anchors yet. Add classes, Connex Zoom, work shifts, or appointments in Calendar.
              </div>
            ) : (
              <ol className="relative ml-3 border-l border-border space-y-2.5">
                {todayTimeline.map((slot, i) => {
                  const palette =
                    slot.kind === "anchor" && slot.category
                      ? CATEGORY_COLORS[slot.category]
                      : null;
                  const dot =
                    slot.kind === "deep-work"
                      ? "bg-sky-500"
                      : slot.kind === "workout"
                        ? "bg-emerald-500"
                        : slot.kind === "maintenance"
                          ? "bg-amber-500"
                          : slot.kind === "shutdown"
                            ? "bg-violet-500"
                            : "bg-primary";
                  return (
                    <li key={`${slot.start}-${i}`} className="ml-4 relative">
                      <span
                        className={`absolute -left-[22px] top-1.5 inline-block h-2.5 w-2.5 rounded-full ring-2 ring-background ${dot}`}
                      />
                      <div className="flex items-baseline flex-wrap gap-2">
                        <span className="font-mono-data text-xs text-muted-foreground tabular-nums">
                          {slot.start}–{slot.end}
                        </span>
                        <span className="text-sm text-foreground">{slot.label}</span>
                        {palette && slot.category ? (
                          <span
                            className={`text-[10px] font-medium uppercase tracking-wider ${palette.bg} ${palette.text} rounded-full px-2 py-0.5`}
                          >
                            {slot.category}
                          </span>
                        ) : null}
                      </div>
                      {slot.detail ? (
                        <div className="text-xs text-muted-foreground mt-0.5">{slot.detail}</div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div className="space-y-3">
            <div
              className={`rounded-2xl border p-3 ${
                realityScore.score >= 7
                  ? "border-emerald-200 bg-emerald-50"
                  : realityScore.score >= 5
                    ? "border-amber-200 bg-amber-50"
                    : "border-rose-200 bg-rose-50"
              }`}
            >
              <div className="text-[10px] uppercase tracking-wider font-semibold text-foreground">
                Plan reality
              </div>
              <div className="font-mono-data mt-1 text-2xl font-semibold text-foreground">
                {realityScore.score.toFixed(1)}<span className="text-sm text-muted-foreground">/10</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                time {realityScore.available_time_fit.toFixed(1)} · energy {realityScore.energy_fit.toFixed(1)} · focus {realityScore.priority_focus.toFixed(1)} · recovery {realityScore.recovery_protection.toFixed(1)}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card/70 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Anti Drift
              </div>
              <div className="mt-1 text-sm text-foreground">
                {realityScore.recommendations[0] ?? "Keep only anchors, one must-do, maintenance, and recovery if today slips."}
              </div>
            </div>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              {realityScore.recommendations.slice(0, 3).map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <ShieldCheck size={12} className="mt-0.5 flex-shrink-0 text-primary" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-border bg-card/60 p-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Best deep work
                </div>
                <div className="text-foreground">
                  {availableTime.bestDeepWork
                    ? `${availableTime.bestDeepWork.start}–${availableTime.bestDeepWork.end}`
                    : "—"}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card/60 p-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Best workout
                </div>
                <div className="text-foreground">
                  {availableTime.bestWorkout
                    ? `${availableTime.bestWorkout.start}–${availableTime.bestWorkout.end}`
                    : "—"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card-surface border-l-2 border-[#2f4f6f] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FlaskConical size={14} className="text-[#2f4f6f]" />
              <span className="text-[10px] uppercase tracking-wider text-[#2f4f6f] font-semibold">
                MCAT readiness gating
              </span>
            </div>
            <div className="mt-2 text-sm font-semibold text-[#25313c]">
              {mcatNextMove.title}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-[#6f685f]">
              {mcatNextMove.detail}
            </p>
          </div>
          <div className="rounded-full border border-[#2f4f6f]/20 bg-[#2f4f6f]/10 px-3 py-1 text-xs font-semibold text-[#2f4f6f]">
            {mcatNextMove.topic}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="card-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#25313c]">SLEEP</span>
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: getStatusColor(sleepScore) }}
              />
            </div>
            <span
              className="font-mono-data text-xs"
              style={{ color: getStatusColor(sleepScore) }}
            >
              {sleepScore.toFixed(1)}/10
            </span>
          </div>
          {sleepChartData.length > 0 ? (
            <div className="h-[60px] mb-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sleepChartData}>
                  <Line
                    type="monotone"
                    dataKey="readiness"
                    stroke="#6b87ae"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#f0ebe2",
                      border: "1px solid rgba(111,104,95,0.18)",
                      borderRadius: "4px",
                      fontSize: "11px",
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : null}
              <div className="flex items-center gap-4 text-xs text-[#6f685f]">
            <span>{state.sleepToday?.hours_slept ?? "—"}h</span>
            <span>
              Debt:{" "}
              <span
                className={
                  Number(state.sleepToday?.sleep_debt ?? 0) > 3
                    ? "text-[#c97a73]"
                    : Number(state.sleepToday?.sleep_debt ?? 0) > 0
                      ? "text-[#c39a4e]"
                      : "text-[#6a9a74]"
                }
              >
                {state.sleepToday?.sleep_debt ?? "—"}h
              </span>
            </span>
          </div>
        </div>

        <div className="card-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#25313c]">ACADEMICS</span>
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: getStatusColor(academicScore) }}
              />
            </div>
            <span
              className="font-mono-data text-xs"
              style={{ color: getStatusColor(academicScore) }}
            >
              {academicScore.toFixed(1)}/10
            </span>
          </div>
          {topTask ? (
            <div>
              <div className="text-sm font-semibold text-[#25313c]">
                {topTask.task_name}
              </div>
              <div className="text-xs text-[#6f685f] mt-1">
                {topTask.class_name} - {Number(topTask.estimated_hours ?? 0)}h
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono-data text-[10px] text-[#6f685f]">
                  Priority: {Number(topTask.priority_score ?? 0).toFixed(1)}
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    Number(topTask.priority_score ?? 0) >= 8
                      ? "bg-[#c97a73]/20 text-[#c97a73]"
                      : Number(topTask.priority_score ?? 0) >= 6
                        ? "bg-[#c39a4e]/20 text-[#c39a4e]"
                        : "bg-[#6a9a74]/20 text-[#6a9a74]"
                  }`}
                >
                  {Number(topTask.priority_score ?? 0) >= 8
                    ? "High"
                    : Number(topTask.priority_score ?? 0) >= 6
                      ? "Medium"
                      : "Low"}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-[#8c8478]">
              No high-priority tasks yet. Add work from school, Connex, or personal life as it surfaces.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="card-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#25313c]">WORKOUT</span>
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: getStatusColor(workoutScore) }}
              />
            </div>
            <span
              className="font-mono-data text-xs"
              style={{ color: getStatusColor(workoutScore) }}
            >
              {workoutScore.toFixed(1)}/10
            </span>
          </div>
          {state.workoutToday ? (
            <div>
              <div className="text-sm font-semibold text-[#25313c]">
                {state.workoutToday.workout_type}
              </div>
              <div className="text-xs text-[#6f685f] mt-1">
                {Number(state.workoutToday.duration_minutes ?? 0)} min,{" "}
                {rowExercises(state.workoutToday).length} exercises
              </div>
              <div className="mt-3 space-y-1 text-xs text-[#6f685f]">
                {workoutExercises.map((exercise, index) => (
                  <div key={`${exercise.name ?? "exercise"}-${index}`}>
                    {exercise.name ?? "Exercise"}
                  </div>
                ))}
                {workoutExercises.length === 0 ? (
                  <div>No exercises logged yet. Add the first lift or movement block from today.</div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="text-sm text-[#8c8478]">
              No workout logged today. Add a session to see readiness trends.
            </div>
          )}
        </div>

        <div className="card-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#25313c]">NUTRITION</span>
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: currentStatusColor(nutritionChecks) }}
              />
            </div>
            <span className="font-mono-data text-xs text-[#6f685f]">
              {nutritionChecks}/4 checks
            </span>
          </div>
          {state.nutritionToday ? (
            <div>
              <div className="text-sm font-semibold text-[#25313c]">
                {Number(state.nutritionToday.bodyweight ?? 0)} lbs
              </div>
              <div className="text-xs text-[#6f685f] mt-1">
                {Number(state.nutritionToday.calories ?? 0)} cal,{" "}
                {Number(state.nutritionToday.protein_g ?? 0)}g protein
              </div>
              <div className="mt-3 text-xs text-[#6f685f]">
                Status:{" "}
                <span
                  className={
                    nutritionStatus?.status === "green"
                      ? "text-[#6a9a74]"
                      : nutritionStatus?.status === "yellow"
                        ? "text-[#c39a4e]"
                        : "text-[#c97a73]"
                  }
                >
                  {nutritionStatus?.status.toUpperCase() ?? "RED"}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-[#8c8478]">
              No nutrition log today. Log a meal, hydration, or bodyweight update to see the check score.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card-surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={12} className="text-[#6f685f]" />
            <span className="text-[10px] uppercase tracking-wider text-[#6f685f] font-semibold">
              Weekly Review
            </span>
          </div>
          {state.weeklyReview ? (
            <div className="space-y-2 text-sm">
              <div className="text-[#25313c]">
                Life Score: {Number(state.weeklyReview.weekly_life_score ?? 0).toFixed(1)}
              </div>
              <div className="text-xs text-[#6f685f]">
                Win: {state.weeklyReview.biggest_win ?? "Unset"}
              </div>
              <div className="text-xs text-[#6f685f]">
                Leak: {state.weeklyReview.biggest_leak ?? "Unset"}
              </div>
            </div>
          ) : (
            <div className="text-sm text-[#8c8478]">
              No weekly review saved yet. Summarize the week to see your Life Score.
            </div>
          )}
        </div>

        <div className="card-surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={12} className="text-[#c39a4e]" />
            <span className="text-[10px] uppercase tracking-wider text-[#6f685f] font-semibold">
              Quick Notes
            </span>
          </div>
          <div className="text-xs text-[#6f685f] space-y-2">
            <div>
              {isLoading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin" />
                  Refreshing dashboard...
                </span>
              ) : (
                "Dashboard is synced to the Supabase v1 tables."
              )}
            </div>
            <div>
              {state.workoutWeek.length > 0
                ? `${state.workoutWeek.length} workout rows loaded for the last week.`
                : "No workout history loaded yet. Add sessions to review readiness over time."}
            </div>
            <div>
              {state.sleepWeek.length > 0
                ? `${state.sleepWeek.length} sleep rows loaded for the last week.`
                : "No sleep history loaded yet. Add nights to see recovery trends."}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#25313c] mb-3">
            SLEEP TREND
          </h3>
          {sleepChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={sleepChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(111,104,95,0.14)" />
                <Tooltip
                  contentStyle={{
                    background: "#f0ebe2",
                    border: "1px solid rgba(111,104,95,0.18)",
                    borderRadius: "4px",
                    fontSize: "11px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="readiness"
                  stroke="#6b87ae"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-sm text-[#8c8478]">
              No sleep logged yet. Add tonight's sleep to calculate readiness.
            </div>
          )}
        </div>

        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#25313c] mb-3">
            TASKS TO WATCH
          </h3>
          <div className="space-y-2">
            {state.tasks.slice(0, 5).map((task) => (
              <div key={task.id} className="flex items-start gap-2">
                <Circle size={14} className="text-[#8c8478] mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-[#25313c] truncate">
                    {task.task_name}
                  </div>
                  <div className="text-[10px] text-[#6f685f]">
                    {task.class_name} - P:{Number(task.priority_score ?? 0).toFixed(1)}
                  </div>
                </div>
              </div>
            ))}
            {state.tasks.length === 0 ? (
              <div className="text-sm text-[#8c8478]">No tasks yet. Capture anything from school, Connex, family, or personal life.</div>
            ) : null}
          </div>
        </div>
      </div>

      <DailyLogPanel />
    </div>
  );
}

function DayPlanCard({
  label,
  tasks,
  accent,
  muted,
}: {
  label: string;
  tasks: Task[];
  accent: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border bg-white/60 p-3 ${muted ? "opacity-70" : ""}`}
      style={{ borderColor: "#ece5da", borderLeft: `2px solid ${accent}` }}
    >
      <div
        className="text-[10px] uppercase tracking-wider font-semibold"
        style={{ color: accent }}
      >
        {label}
      </div>
      {tasks.length === 0 ? (
        <div className="mt-1 text-xs text-[#9b938a]">Empty.</div>
      ) : (
        <ul className="mt-1 space-y-1 text-sm text-[#25313c]">
          {tasks.slice(0, 3).map((t) => (
            <li key={t.id} className="truncate">
              {t.title}
              <span className="ml-1 text-[10px] text-[#9b938a]">· {t.task_type}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function currentStatusColor(checks: number) {
  if (checks === 4) return "#6a9a74";
  if (checks >= 2) return "#c39a4e";
  return "#c97a73";
}
