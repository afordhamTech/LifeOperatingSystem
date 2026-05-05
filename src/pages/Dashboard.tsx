import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
  Wrench,
} from "lucide-react";
import DailyLogPanel from "@/components/DailyLogPanel";
import StatusRing, { getStatusColor } from "@/components/StatusRing";
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
import { useSupabaseSession } from "@/hooks/useSupabaseSession";

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

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!supabase || !userId) {
        if (!active) return;
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

      const [dailyLogResult, sleepTodayResult, sleepWeekResult, tasksResult, workoutTodayResult, workoutWeekResult, nutritionTodayResult, weeklyReviewResult] =
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
        weeklyReviewResult.error;

      if (firstError) {
        setError(firstError.message);
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

      setIsLoading(false);
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="border-b border-white/[0.06] pb-4">
        <h1 className="text-2xl font-semibold text-[#eaeaea]">
          Daily Operating System
        </h1>
        <p className="text-sm text-[#777777] mt-1">
          Your command center. Inputs, calculations, status, and next actions -
          all in one place.
        </p>
      </div>

      <div className="card-surface p-4 flex flex-wrap items-center justify-between gap-4">
        <StatusRing score={sleepScore} label="Sleep" size={60} />
        <div className="h-10 w-px bg-white/[0.06] hidden sm:block" />
        <StatusRing score={academicScore} label="Academics" size={60} />
        <div className="h-10 w-px bg-white/[0.06] hidden sm:block" />
        <StatusRing score={workoutScore} label="Workout" size={60} />
        <div className="h-10 w-px bg-white/[0.06] hidden sm:block" />
        <div className="flex flex-col items-center">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full ${
                  i < nutritionChecks ? "bg-[#22c55e]" : "bg-white/[0.06]"
                }`}
              />
            ))}
          </div>
          <span className="text-[10px] uppercase tracking-wider text-[#777777] font-medium mt-1.5">
            Nutrition
          </span>
        </div>
        <div className="h-10 w-px bg-white/[0.06] hidden sm:block" />
        <div className="flex flex-col items-center">
          <span
            className="text-2xl font-bold"
            style={{ color: getStatusColor(statusAverage) }}
          >
            {statusAverage.toFixed(1)}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-[#777777] font-medium">
            Priority
          </span>
        </div>
        <div className="h-10 w-px bg-white/[0.06] hidden sm:block" />
        <div className="flex flex-col items-center">
          <span
            className="text-2xl font-bold"
            style={{ color: getStatusColor(weeklyScore) }}
          >
            {weeklyScore.toFixed(1)}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-[#777777] font-medium">
            Weekly
          </span>
        </div>
        <div className="h-10 w-px bg-white/[0.06] hidden sm:block" />
        <div className="text-right">
          <div className="text-sm text-[#eaeaea]">
            {new Date().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </div>
          <div className="text-xs text-[#777777]">
            {new Date().toLocaleDateString("en-US", { weekday: "long" })}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded border border-[#ef4444]/30 bg-[#ef4444]/10 px-3 py-2 text-xs text-[#ef4444]">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded border border-white/[0.06] bg-[#111111] px-3 py-2 text-xs text-[#777777]">
          {notice}
        </div>
      ) : null}
      {hasSupabaseConfig && !userId ? (
        <div className="rounded border border-[#3b82f6]/30 bg-[#3b82f6]/10 px-3 py-2 text-xs text-[#3b82f6]">
          Supabase is configured, but there is no session yet. The dashboard is
          still usable in draft mode.
        </div>
      ) : null}
      {!hasSupabaseConfig ? (
        <div className="rounded border border-[#eab308]/30 bg-[#eab308]/10 px-3 py-2 text-xs text-[#eab308]">
          Supabase env vars are missing. The dashboard still works locally.
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card-surface p-4 border-l-2 border-[#ef4444]">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" />
            <span className="text-[10px] uppercase tracking-wider text-[#ef4444] font-semibold">
              Must Do
            </span>
          </div>
          {state.dailyLog?.must_do ? (
            <div className="text-sm font-semibold text-[#eaeaea]">
              {state.dailyLog.must_do}
            </div>
          ) : (
            <div className="text-sm text-[#444444]">
              No must-do logged yet.
            </div>
          )}
          <div className="mt-3 space-y-1 text-xs text-[#777777]">
            <div>Should do 1: {state.dailyLog?.should_do_1 ?? "Unset"}</div>
            <div>Should do 2: {state.dailyLog?.should_do_2 ?? "Unset"}</div>
          </div>
        </div>

        <div className="card-surface p-4 border-l-2 border-[#eab308]">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] uppercase tracking-wider text-[#eab308] font-semibold">
              Should Do
            </span>
          </div>
          <div className="space-y-2">
            {shouldDoTasks.length > 0 ? (
              shouldDoTasks.map((task) => (
                <div key={task.id} className="flex items-start gap-2">
                  <Circle size={14} className="text-[#444444] mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-sm text-[#eaeaea]">{task.task_name}</div>
                    <div className="text-[10px] text-[#777777]">
                      {task.class_name}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-[#444444]">
                Add tasks in Academics
              </div>
            )}
          </div>
        </div>

        <div className="card-surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wrench size={12} className="text-[#777777]" />
            <span className="text-[10px] uppercase tracking-wider text-[#777777] font-semibold">
              Maintenance
            </span>
          </div>
          <div className="space-y-2">
            {state.dailyLog?.maintenance ? (
              <div className="flex items-start gap-2">
                <CheckCircle2 size={14} className="text-[#22c55e] mt-0.5 flex-shrink-0" />
                <span className="text-sm text-[#777777]">
                  {state.dailyLog.maintenance}
                </span>
              </div>
            ) : (
              <div className="text-sm text-[#444444]">No maintenance logged yet.</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="card-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#eaeaea]">SLEEP</span>
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
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#1a1a1a",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: "4px",
                      fontSize: "11px",
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : null}
          <div className="flex items-center gap-4 text-xs text-[#777777]">
            <span>{state.sleepToday?.hours_slept ?? "—"}h</span>
            <span>
              Debt:{" "}
              <span
                className={
                  Number(state.sleepToday?.sleep_debt ?? 0) > 0
                    ? "text-[#ef4444]"
                    : "text-[#22c55e]"
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
              <span className="text-xs font-semibold text-[#eaeaea]">ACADEMICS</span>
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
              <div className="text-sm font-semibold text-[#eaeaea]">
                {topTask.task_name}
              </div>
              <div className="text-xs text-[#777777] mt-1">
                {topTask.class_name} - {Number(topTask.estimated_hours ?? 0)}h
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono-data text-[10px] text-[#777777]">
                  Priority: {Number(topTask.priority_score ?? 0).toFixed(1)}
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    Number(topTask.priority_score ?? 0) >= 8
                      ? "bg-[#ef4444]/20 text-[#ef4444]"
                      : Number(topTask.priority_score ?? 0) >= 6
                        ? "bg-[#eab308]/20 text-[#eab308]"
                        : "bg-[#22c55e]/20 text-[#22c55e]"
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
            <div className="text-sm text-[#444444]">
              No high-priority tasks yet.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="card-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#eaeaea]">WORKOUT</span>
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
              <div className="text-sm font-semibold text-[#eaeaea]">
                {state.workoutToday.workout_type}
              </div>
              <div className="text-xs text-[#777777] mt-1">
                {Number(state.workoutToday.duration_minutes ?? 0)} min,{" "}
                {rowExercises(state.workoutToday).length} exercises
              </div>
              <div className="mt-3 space-y-1 text-xs text-[#777777]">
                {workoutExercises.map((exercise, index) => (
                  <div key={`${exercise.name ?? "exercise"}-${index}`}>
                    {exercise.name ?? "Exercise"}
                  </div>
                ))}
                {workoutExercises.length === 0 ? (
                  <div>No exercises logged yet.</div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="text-sm text-[#444444]">
              No workout logged today.
            </div>
          )}
        </div>

        <div className="card-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#eaeaea]">NUTRITION</span>
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: currentStatusColor(nutritionChecks) }}
              />
            </div>
            <span className="font-mono-data text-xs text-[#777777]">
              {nutritionChecks}/4 checks
            </span>
          </div>
          {state.nutritionToday ? (
            <div>
              <div className="text-sm font-semibold text-[#eaeaea]">
                {Number(state.nutritionToday.bodyweight ?? 0)} lbs
              </div>
              <div className="text-xs text-[#777777] mt-1">
                {Number(state.nutritionToday.calories ?? 0)} cal,{" "}
                {Number(state.nutritionToday.protein_g ?? 0)}g protein
              </div>
              <div className="mt-3 text-xs text-[#777777]">
                Status:{" "}
                <span
                  className={
                    nutritionStatus?.status === "green"
                      ? "text-[#22c55e]"
                      : nutritionStatus?.status === "yellow"
                        ? "text-[#eab308]"
                        : "text-[#ef4444]"
                  }
                >
                  {nutritionStatus?.status.toUpperCase() ?? "RED"}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-[#444444]">
              No nutrition log today.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card-surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={12} className="text-[#777777]" />
            <span className="text-[10px] uppercase tracking-wider text-[#777777] font-semibold">
              Weekly Review
            </span>
          </div>
          {state.weeklyReview ? (
            <div className="space-y-2 text-sm">
              <div className="text-[#eaeaea]">
                Life Score: {Number(state.weeklyReview.weekly_life_score ?? 0).toFixed(1)}
              </div>
              <div className="text-xs text-[#777777]">
                Win: {state.weeklyReview.biggest_win ?? "Unset"}
              </div>
              <div className="text-xs text-[#777777]">
                Leak: {state.weeklyReview.biggest_leak ?? "Unset"}
              </div>
            </div>
          ) : (
            <div className="text-sm text-[#444444]">
              No weekly review saved yet.
            </div>
          )}
        </div>

        <div className="card-surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={12} className="text-[#eab308]" />
            <span className="text-[10px] uppercase tracking-wider text-[#777777] font-semibold">
              Quick Notes
            </span>
          </div>
          <div className="text-xs text-[#777777] space-y-2">
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
                : "No workout history loaded yet."}
            </div>
            <div>
              {state.sleepWeek.length > 0
                ? `${state.sleepWeek.length} sleep rows loaded for the last week.`
                : "No sleep history loaded yet."}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#eaeaea] mb-3">
            SLEEP TREND
          </h3>
          {sleepChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={sleepChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <Tooltip
                  contentStyle={{
                    background: "#1a1a1a",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: "4px",
                    fontSize: "11px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="readiness"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-sm text-[#444444]">
              Log sleep to see the trend.
            </div>
          )}
        </div>

        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#eaeaea] mb-3">
            TASKS TO WATCH
          </h3>
          <div className="space-y-2">
            {state.tasks.slice(0, 5).map((task) => (
              <div key={task.id} className="flex items-start gap-2">
                <Circle size={14} className="text-[#444444] mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-[#eaeaea] truncate">
                    {task.task_name}
                  </div>
                  <div className="text-[10px] text-[#777777]">
                    {task.class_name} - P:{Number(task.priority_score ?? 0).toFixed(1)}
                  </div>
                </div>
              </div>
            ))}
            {state.tasks.length === 0 ? (
              <div className="text-sm text-[#444444]">No tasks yet.</div>
            ) : null}
          </div>
        </div>
      </div>

      <DailyLogPanel />
    </div>
  );
}

function currentStatusColor(checks: number) {
  if (checks === 4) return "#22c55e";
  if (checks >= 2) return "#eab308";
  return "#ef4444";
}
