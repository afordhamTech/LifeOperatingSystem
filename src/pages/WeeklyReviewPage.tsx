import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Frown, Loader2, Save, Sparkles, Trophy, TrendingDown } from "lucide-react";
import StatusRing, { getStatusColor } from "@/components/StatusRing";
import { supabase } from "@/lib/supabase-client";
import type {
  AcademicTaskRow,
  NutritionLogRow,
  SleepLogRow,
  WeeklyReviewRow,
  WorkoutLogRow,
} from "@/lib/supabase-types";
import { calculateWeeklyLifeScore } from "@/lib/life-scoring";
import { getWeekStartDateKey, toDateKey } from "@/lib/date-helpers";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import { calcNutritionStatus } from "@/lib/calculations";

type WeeklyReviewForm = {
  academicsScore: number;
  sleepScore: number;
  trainingScore: number;
  nutritionScore: number;
  careerProofScore: number;
  faithSubstanceScore: number;
  moneyAdminScore: number;
  biggestWin: string;
  biggestLeak: string;
  nextWeekBig3: [string, string, string];
  notes: string;
};

const defaultForm: WeeklyReviewForm = {
  academicsScore: 5,
  sleepScore: 5,
  trainingScore: 5,
  nutritionScore: 5,
  careerProofScore: 5,
  faithSubstanceScore: 5,
  moneyAdminScore: 5,
  biggestWin: "",
  biggestLeak: "",
  nextWeekBig3: ["", "", ""],
  notes: "",
};

function rowToForm(row: WeeklyReviewRow): WeeklyReviewForm {
  const nextWeekBig3 = Array.isArray(row.next_week_big_3)
    ? row.next_week_big_3
    : [];

  return {
    academicsScore: row.academics_score ?? 5,
    sleepScore: row.sleep_score ?? 5,
    trainingScore: row.training_score ?? 5,
    nutritionScore: row.nutrition_score ?? 5,
    careerProofScore: row.career_proof_score ?? 5,
    faithSubstanceScore: row.faith_substance_score ?? 5,
    moneyAdminScore: row.money_admin_score ?? 5,
    biggestWin: row.biggest_win ?? "",
    biggestLeak: row.biggest_leak ?? "",
    nextWeekBig3: [
      String(nextWeekBig3[0] ?? ""),
      String(nextWeekBig3[1] ?? ""),
      String(nextWeekBig3[2] ?? ""),
    ],
    notes: row.notes ?? "",
  };
}

function buildSnapshot(
  tasks: AcademicTaskRow[],
  sleepLogs: SleepLogRow[],
  workoutLogs: WorkoutLogRow[],
  nutritionLogs: NutritionLogRow[],
) {
  const academicsScore = tasks.length
    ? Math.round(
        (tasks.filter((task) => task.status === "completed").length /
          tasks.length) *
          10 *
          100,
      ) / 100
    : 5;

  const sleepScore = sleepLogs.length
    ? Math.round(
        (sleepLogs.reduce((sum, row) => sum + Number(row.sleep_readiness ?? 0), 0) /
          sleepLogs.length) *
          100,
      ) / 100
    : 5;

  const trainingScore = workoutLogs.length
    ? Math.round(
        (workoutLogs.reduce(
          (sum, row) => sum + Number(row.training_readiness ?? 0),
          0,
        ) / workoutLogs.length) *
          100,
      ) / 100
    : 5;

  const nutritionScore = nutritionLogs.length
    ? Math.round(
        (nutritionLogs.reduce((sum, row) => {
          const status = calcNutritionStatus(
            Number(row.calories ?? 0),
            Number(row.protein_g ?? 0),
            Number(row.water_oz ?? 0),
            Number(row.meals_count ?? 0),
            Number(row.bodyweight ?? 150),
          );
          return sum + (status.checks / 4) * 10;
        }, 0) /
          nutritionLogs.length) *
          100,
      ) / 100
    : 5;

  return {
    academicsScore: academicsScore,
    sleepScore,
    trainingScore,
    nutritionScore,
  };
}

export default function WeeklyReviewPage() {
  const today = useMemo(() => toDateKey(new Date()), []);
  const weekStart = useMemo(() => getWeekStartDateKey(new Date()), []);
  const { hasSupabaseConfig, userId } = useSupabaseSession();
  const [form, setForm] = useState<WeeklyReviewForm>(defaultForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moduleSnapshot, setModuleSnapshot] = useState({
    academicsScore: 5,
    sleepScore: 5,
    trainingScore: 5,
    nutritionScore: 5,
  });

  const weeklyLifeScore = calculateWeeklyLifeScore({
    academicsScore: form.academicsScore,
    sleepScore: form.sleepScore,
    trainingScore: form.trainingScore,
    nutritionScore: form.nutritionScore,
    careerProofScore: form.careerProofScore,
    faithSubstanceScore: form.faithSubstanceScore,
    moneyAdminScore: form.moneyAdminScore,
  });

  const chartData = [
    { label: "Academics", score: form.academicsScore },
    { label: "Sleep", score: form.sleepScore },
    { label: "Training", score: form.trainingScore },
    { label: "Nutrition", score: form.nutritionScore },
    { label: "Career", score: form.careerProofScore },
    { label: "Faith", score: form.faithSubstanceScore },
    { label: "Money", score: form.moneyAdminScore },
  ];

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!supabase || !userId) {
        if (!active) return;
        setIsLoading(false);
        setNotice(
          hasSupabaseConfig
            ? "No Supabase session yet. Weekly review stays in draft mode until auth is connected."
            : "Supabase env vars are missing. Weekly review stays in local draft mode.",
        );
        return;
      }

      setIsLoading(true);
      setError(null);

      const weekStartDate = weekStart;
      const todayDate = today;
      const [existingReview, tasksResult, sleepResult, workoutResult, nutritionResult] =
        await Promise.all([
          supabase
            .from("weekly_reviews")
            .select("*")
            .eq("user_id", userId)
            .eq("week_start", weekStartDate)
            .maybeSingle(),
          supabase
            .from("academic_tasks")
            .select("*")
            .eq("user_id", userId)
            .gte("due_date", weekStartDate)
            .lte("due_date", todayDate),
          supabase
            .from("sleep_logs")
            .select("*")
            .eq("user_id", userId)
            .gte("date", weekStartDate)
            .lte("date", todayDate),
          supabase
            .from("workout_logs")
            .select("*")
            .eq("user_id", userId)
            .gte("date", weekStartDate)
            .lte("date", todayDate),
          supabase
            .from("nutrition_logs")
            .select("*")
            .eq("user_id", userId)
            .gte("date", weekStartDate)
            .lte("date", todayDate),
        ]);

      if (!active) return;

      if (existingReview.error) {
        setError(existingReview.error.message);
      } else if (existingReview.data) {
        setForm(rowToForm(existingReview.data as WeeklyReviewRow));
      }

      if (
        !tasksResult.error &&
        !sleepResult.error &&
        !workoutResult.error &&
        !nutritionResult.error
      ) {
        const snapshot = buildSnapshot(
          (tasksResult.data ?? []) as AcademicTaskRow[],
          (sleepResult.data ?? []) as SleepLogRow[],
          (workoutResult.data ?? []) as WorkoutLogRow[],
          (nutritionResult.data ?? []) as NutritionLogRow[],
        );
        setModuleSnapshot(snapshot);

        if (!existingReview.data) {
          setForm((current) => ({
            ...current,
            ...snapshot,
          }));
        }
      } else {
        const firstError =
          tasksResult.error ??
          sleepResult.error ??
          workoutResult.error ??
          nutritionResult.error;
        setError(firstError?.message ?? "Unable to load module snapshot.");
      }

      setIsLoading(false);
      setNotice("Loaded from Supabase.");
    };

    void load();

    return () => {
      active = false;
    };
  }, [hasSupabaseConfig, today, userId, weekStart]);

  const handleUseSnapshot = () => {
    setForm((current) => ({
      ...current,
      ...moduleSnapshot,
    }));
    setNotice("Loaded current module snapshot into the form.");
  };

  const handleSave = async () => {
    const payload = {
      user_id: userId,
      week_start: weekStart,
      academics_score: form.academicsScore,
      sleep_score: form.sleepScore,
      training_score: form.trainingScore,
      nutrition_score: form.nutritionScore,
      career_proof_score: form.careerProofScore,
      faith_substance_score: form.faithSubstanceScore,
      money_admin_score: form.moneyAdminScore,
      weekly_life_score: weeklyLifeScore,
      biggest_win: form.biggestWin.trim() || null,
      biggest_leak: form.biggestLeak.trim() || null,
      next_week_big_3: form.nextWeekBig3.filter(Boolean),
      notes: form.notes.trim() || null,
    };

    if (!supabase || !userId) {
      setNotice("Weekly review stored in local draft mode.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    const { error: saveError } = await supabase
      .from("weekly_reviews")
      .upsert(payload, { onConflict: "user_id,week_start" });

    if (saveError) {
      setError(saveError.message);
    } else {
      const { data } = await supabase
        .from("weekly_reviews")
        .select("*")
        .eq("user_id", userId)
        .eq("week_start", weekStart)
        .maybeSingle();

      if (data) {
        setForm(rowToForm(data as WeeklyReviewRow));
      }
      setNotice("Weekly review saved to Supabase.");
    }

    setIsSaving(false);
  };

  const categories = chartData;

  return (
    <div className="space-y-6">
      <div className="border-b border-white/[0.06] pb-4">
        <h1 className="text-2xl font-semibold text-[#eaeaea]">Weekly Review</h1>
        <p className="text-sm text-[#777777] mt-1">
          Turn the week into feedback. Week of {weekStart}.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleUseSnapshot}
          className="btn-primary inline-flex items-center gap-2"
          type="button"
        >
          <Sparkles size={14} />
          Use Current Snapshot
        </button>
        <button
          onClick={handleSave}
          className="btn-primary inline-flex items-center gap-2"
          disabled={isSaving || isLoading}
          type="button"
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {isSaving ? "Saving..." : "Save Weekly Review"}
        </button>
      </div>

      <div className="card-surface p-6">
        <div className="flex flex-wrap items-center gap-6 justify-center">
          <StatusRing score={weeklyLifeScore} size={140} strokeWidth={7} />
          <div className="space-y-1">
            <div className="text-sm text-[#777777]">Weekly Life Score</div>
            <div
              className="text-3xl font-bold"
              style={{ color: getStatusColor(weeklyLifeScore) }}
            >
              {weeklyLifeScore.toFixed(1)} / 10
            </div>
            <div className="text-xs" style={{ color: getStatusColor(weeklyLifeScore) }}>
              {weeklyLifeScore >= 8 ? "Dominant week" : weeklyLifeScore >= 6.5 ? "Decent week" : "Needs work"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mt-4">
          {categories.map((cat) => (
            <div
              key={cat.label}
              className="px-3 py-1.5 rounded-md text-center"
              style={{ backgroundColor: `${getStatusColor(cat.score)}10` }}
            >
              <div className="text-[10px] text-[#777777]">{cat.label}</div>
              <div className="text-sm font-bold" style={{ color: getStatusColor(cat.score) }}>
                {cat.score.toFixed(1)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card-surface p-4">
        <h3 className="text-sm font-semibold text-[#eaeaea] mb-3">
          CATEGORY BREAKDOWN
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData}>
            <XAxis dataKey="label" stroke="#444" fontSize={10} />
            <YAxis domain={[0, 10]} stroke="#444" fontSize={10} />
            <Tooltip
              contentStyle={{
                background: "#1a1a1a",
                border: "1px solid rgba(255,255,255,0.06)",
                fontSize: "11px",
              }}
            />
            <ReferenceLine y={8} stroke="#22c55e" strokeDasharray="3 3" />
            <Bar dataKey="score" fill="#3b82f6" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ReviewTextCard
          title="BIGGEST WIN"
          icon={<Trophy size={14} className="text-[#22c55e]" />}
          accent="text-[#22c55e]"
          value={form.biggestWin}
          onChange={(value) => setForm((p) => ({ ...p, biggestWin: value }))}
          placeholder="What went well this week?"
        />
        <ReviewTextCard
          title="BIGGEST LEAK"
          icon={<TrendingDown size={14} className="text-[#ef4444]" />}
          accent="text-[#ef4444]"
          value={form.biggestLeak}
          onChange={(value) => setForm((p) => ({ ...p, biggestLeak: value }))}
          placeholder="Where did energy go to waste?"
        />
        <ReviewTextCard
          title="NEXT WEEK BIG 3"
          icon={<Frown size={14} className="text-[#eab308]" />}
          accent="text-[#eab308]"
          value={form.nextWeekBig3.join("\n")}
          onChange={(value) =>
            setForm((p) => ({
              ...p,
              nextWeekBig3: value
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .slice(0, 3) as WeeklyReviewForm["nextWeekBig3"],
            }))
          }
          placeholder={"1. ...\n2. ...\n3. ..."}
          textarea
        />
      </div>

      <div className="card-surface p-4">
        <h3 className="text-sm font-semibold text-[#eaeaea] mb-3">
          SCORE SLIDERS
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ScoreSlider
            label="Academics"
            value={form.academicsScore}
            onChange={(value) => setForm((p) => ({ ...p, academicsScore: value }))}
          />
          <ScoreSlider
            label="Sleep"
            value={form.sleepScore}
            onChange={(value) => setForm((p) => ({ ...p, sleepScore: value }))}
          />
          <ScoreSlider
            label="Training"
            value={form.trainingScore}
            onChange={(value) => setForm((p) => ({ ...p, trainingScore: value }))}
          />
          <ScoreSlider
            label="Nutrition"
            value={form.nutritionScore}
            onChange={(value) => setForm((p) => ({ ...p, nutritionScore: value }))}
          />
          <ScoreSlider
            label="Career Proof"
            value={form.careerProofScore}
            onChange={(value) =>
              setForm((p) => ({ ...p, careerProofScore: value }))
            }
          />
          <ScoreSlider
            label="Faith Substance"
            value={form.faithSubstanceScore}
            onChange={(value) =>
              setForm((p) => ({ ...p, faithSubstanceScore: value }))
            }
          />
          <ScoreSlider
            label="Money Admin"
            value={form.moneyAdminScore}
            onChange={(value) => setForm((p) => ({ ...p, moneyAdminScore: value }))}
          />
        </div>
      </div>

      <div className="card-surface p-4">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[#777777]">
          Notes
        </label>
        <textarea
          className="input-dark h-28 w-full resize-none"
          placeholder="Patterns, lessons, and what matters next"
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
        />
      </div>

      {hasSupabaseConfig && !userId ? (
        <div className="rounded border border-[#3b82f6]/30 bg-[#3b82f6]/10 px-3 py-2 text-xs text-[#3b82f6]">
          Supabase is configured, but there is no session yet. Draft mode is
          still available.
        </div>
      ) : null}
      {!hasSupabaseConfig ? (
        <div className="rounded border border-[#eab308]/30 bg-[#eab308]/10 px-3 py-2 text-xs text-[#eab308]">
          Supabase env vars are missing. Weekly review will stay local until the
          frontend env is added.
        </div>
      ) : null}
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
    </div>
  );
}

function ScoreSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] uppercase tracking-wider text-[#777777]">
          {label}
        </label>
        <span className="font-mono-data text-[10px] text-[#3b82f6]">
          {value.toFixed(1)}/10
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        step={0.1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider-dark"
      />
    </div>
  );
}

function ReviewTextCard({
  title,
  icon,
  accent,
  value,
  onChange,
  placeholder,
  textarea = false,
}: {
  title: string;
  icon: ReactNode;
  accent: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  textarea?: boolean;
}) {
  return (
    <div className="card-surface p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className={`text-sm font-semibold ${accent}`}>{title}</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`input-dark w-full resize-none ${textarea ? "h-24" : "h-20"}`}
      />
    </div>
  );
}
