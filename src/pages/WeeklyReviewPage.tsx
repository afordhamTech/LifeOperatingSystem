import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { SyncBadge } from "@/components/SyncBadge";
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
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { runSupabasePersistence } from "@/lib/persistence-runner";
import {
  fetchAcademicTasks,
  fetchCalendarAnchors,
  fetchDecisionLogs,
  fetchNutritionLogs,
  fetchSleepLogs,
  fetchUniversalTasks,
  fetchWeeklyReview,
  fetchWorkoutLogs,
  upsertWeeklyReview,
  type DecisionLog,
} from "@/lib/lifeee-persistence";
import {
  reviewedTimestamp,
  splitDecisionsByReview,
} from "@/lib/decision-log-summary";
import {
  buildDecisionPatternDigest,
} from "@/lib/decision-pattern-digest";
import {
  buildWeeklyBottleneckDiagnosis,
} from "@/lib/weekly-bottleneck-diagnosis";
import type { CalendarAnchor } from "@/lib/calendar-system";
import type { Task } from "@/lib/task-system";

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
  const { hasSupabaseConfig, isLoading: sessionLoading, userId } = useSupabaseSession();
  const [form, setForm] = useState<WeeklyReviewForm>(defaultForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const remoteLoadedRef = useRef(false);
  const { syncStatus, setSyncStatus } = useSyncStatus("local");
  const [moduleSnapshot, setModuleSnapshot] = useState({
    academicsScore: 5,
    sleepScore: 5,
    trainingScore: 5,
    nutritionScore: 5,
  });
  const [decisionLogs, setDecisionLogs] = useState<DecisionLog[]>([]);
  const [universalTasks, setUniversalTasks] = useState<Task[]>([]);
  const [calendarAnchorList, setCalendarAnchorList] = useState<CalendarAnchor[]>([]);

  const weekEnd = useMemo(() => {
    const date = new Date(`${weekStart}T00:00:00`);
    date.setDate(date.getDate() + 6);
    return toDateKey(date);
  }, [weekStart]);

  const reviewedThisWeek = useMemo(
    () => splitDecisionsByReview(decisionLogs, today, weekStart, weekEnd).reviewedThisWeek,
    [decisionLogs, today, weekStart, weekEnd],
  );

  const patternDigest = useMemo(
    () => buildDecisionPatternDigest(decisionLogs, weekStart, weekEnd, today),
    [decisionLogs, weekStart, weekEnd, today],
  );

  const bottleneckDiagnosis = useMemo(
    () =>
      buildWeeklyBottleneckDiagnosis({
        tasks: universalTasks,
        decisionLogs,
        anchors: calendarAnchorList,
        weekStart,
        weekEnd,
        today,
      }),
    [calendarAnchorList, decisionLogs, today, universalTasks, weekEnd, weekStart],
  );

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
      if (sessionLoading) {
        setIsLoading(true);
        setSyncStatus("waiting");
        return;
      }

      if (!hasSupabaseConfig || !userId) {
        if (!active) return;
        remoteLoadedRef.current = false;
        setIsLoading(false);
        setNotice(
          hasSupabaseConfig
            ? "No Supabase session yet. Weekly review stays in draft mode until auth is connected."
            : "Supabase env vars are missing. Weekly review stays in local draft mode.",
        );
        setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
        return;
      }

      setIsLoading(true);
      setError(null);
      setSyncStatus("loading");

      const weekStartDate = weekStart;
      const todayDate = today;
      try {
        const [
          existingReview,
          allTasks,
          sleepRows,
          workoutRows,
          nutritionRows,
          decisionRows,
          universalRows,
          anchorRows,
        ] = await Promise.all([
          fetchWeeklyReview(userId, weekStartDate),
          fetchAcademicTasks(userId),
          fetchSleepLogs(userId, weekStartDate, todayDate),
          fetchWorkoutLogs(userId, weekStartDate, todayDate),
          fetchNutritionLogs(userId, weekStartDate, todayDate),
          fetchDecisionLogs(userId).catch(() => [] as DecisionLog[]),
          fetchUniversalTasks(userId).catch(() => [] as Task[]),
          fetchCalendarAnchors(userId).catch(() => [] as CalendarAnchor[]),
        ]);
        setDecisionLogs(decisionRows);
        setUniversalTasks(universalRows);
        setCalendarAnchorList(anchorRows);

        if (!active) return;

        if (existingReview) {
          setForm(rowToForm(existingReview));
        }

        const tasksThisWeek = allTasks.filter((task) => {
          const dueDate = toDateKey(new Date(task.due_date));
          return dueDate >= weekStartDate && dueDate <= todayDate;
        });
        const snapshot = buildSnapshot(
          tasksThisWeek as AcademicTaskRow[],
          sleepRows as SleepLogRow[],
          workoutRows as WorkoutLogRow[],
          nutritionRows as NutritionLogRow[],
        );
        setModuleSnapshot(snapshot);

        if (!existingReview) {
          setForm((current) => ({
            ...current,
            ...snapshot,
          }));
        }

        remoteLoadedRef.current = true;
        setIsLoading(false);
        setNotice(
          existingReview
            ? "Loaded from Supabase."
            : "Supabase source data loaded. Weekly review is local draft only until you save.",
        );
        setSyncStatus(existingReview ? "saved" : "local");
      } catch (loadError) {
        if (!active) return;
        remoteLoadedRef.current = false;
        setError(loadError instanceof Error ? loadError.message : "Unable to load weekly review.");
        setIsLoading(false);
        setSyncStatus("error");
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [hasSupabaseConfig, sessionLoading, setSyncStatus, today, userId, weekStart]);

  const handleUseSnapshot = () => {
    setForm((current) => ({
      ...current,
      ...moduleSnapshot,
    }));
    setNotice("Loaded current module snapshot into the form.");
  };

  const handleSave = async () => {
    const payload = {
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

    if (!userId) {
      setNotice("Weekly review is local draft only until Supabase login is available.");
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);
    setSyncStatus("saving");

    const result = await runSupabasePersistence({
      hasSupabaseConfig,
      userId,
      hasLoadedRemote: remoteLoadedRef.current,
      operation: () => upsertWeeklyReview(userId, payload),
    });

    if (result.ok) {
      if (result.data) {
        setForm(rowToForm(result.data));
      }
      setNotice("Weekly review saved to Supabase.");
      setSyncStatus(result.status);
    } else {
      setError(result.error);
      setSyncStatus(result.status);
    }

    setIsSaving(false);
  };

  const categories = chartData;

  return (
    <div className="space-y-6">
      <div className="border-b border-[#ddd4c6] pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[#25313c]">Weekly Review</h1>
            <p className="text-sm text-[#6f685f] mt-1">
              Turn the week into feedback. Week of {weekStart}.
            </p>
          </div>
          <SyncBadge status={syncStatus} />
        </div>
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
          disabled={isSaving || isLoading || sessionLoading}
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
            <div className="text-sm text-[#6f685f]">Weekly Life Score</div>
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
              <div className="text-[10px] text-[#6f685f]">{cat.label}</div>
              <div className="text-sm font-bold" style={{ color: getStatusColor(cat.score) }}>
                {cat.score.toFixed(1)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card-surface p-4">
        <h3 className="text-sm font-semibold text-[#25313c] mb-3">
          CATEGORY BREAKDOWN
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData}>
            <XAxis dataKey="label" stroke="#8c8478" fontSize={10} />
            <YAxis domain={[0, 10]} stroke="#8c8478" fontSize={10} />
            <Tooltip
              contentStyle={{
                background: "#f0ebe2",
                border: "1px solid rgba(111,104,95,0.18)",
                fontSize: "11px",
              }}
            />
            <ReferenceLine y={8} stroke="#6a9a74" strokeDasharray="3 3" />
            <Bar dataKey="score" fill="#6b87ae" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card-surface p-4 border-l-2 border-[#c39a4e]">
        <h3 className="text-sm font-semibold text-[#25313c] mb-2">
          WEEKLY BOTTLENECK DIAGNOSIS
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[#25313c]">
            {bottleneckDiagnosis.bottleneckLabel}
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
              bottleneckDiagnosis.confidence === "high"
                ? "border-rose-200 bg-rose-100 text-rose-700"
                : bottleneckDiagnosis.confidence === "medium"
                  ? "border-amber-200 bg-amber-100 text-amber-700"
                  : "border-stone-200 bg-stone-100 text-stone-700"
            }`}
          >
            confidence: {bottleneckDiagnosis.confidence}
          </span>
        </div>
        <p className="mt-2 text-xs text-[#6f685f]">
          {bottleneckDiagnosis.bottleneckDescription}
        </p>
        {bottleneckDiagnosis.evidence.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2 text-[11px]">
            {bottleneckDiagnosis.evidence.slice(0, 3).map((item) => (
              <li
                key={item.label}
                className="rounded-md border border-[#ece5da] bg-white/70 px-2 py-0.5 text-[#25313c]"
              >
                {item.label}: <span className="font-semibold">{item.count}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-2 text-xs text-[#25313c]">
          <span className="text-[10px] uppercase tracking-wider text-[#c39a4e] font-semibold">
            Suggested fix
          </span>{" "}
          {bottleneckDiagnosis.suggestedFix}
        </div>
      </div>

      <div className="card-surface p-4">
        <h3 className="text-sm font-semibold text-[#25313c] mb-3">
          DECISIONS REVIEWED THIS WEEK
        </h3>
        {reviewedThisWeek.length === 0 ? (
          <div className="text-xs text-[#9b938a]">
            No decisions were closed this week. Mark items reviewed on Daily OS to populate this section.
          </div>
        ) : (
          <ul className="space-y-2">
            {reviewedThisWeek.map((decision) => {
              const ts = reviewedTimestamp(decision);
              const reviewedDate = ts ? ts.slice(0, 10) : null;
              return (
                <li
                  key={decision.id}
                  className="rounded-md border border-[#ece5da] bg-white/70 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-[#25313c]">{decision.decision}</span>
                    {decision.review_date ? (
                      <span className="text-[10px] text-[#6f685f]">
                        Review {decision.review_date}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-[12px] text-[#25313c]">
                    Result: {decision.result_later?.trim()}
                  </div>
                  {reviewedDate ? (
                    <div className="text-[10px] text-[#9b938a]">
                      Reviewed {reviewedDate}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="card-surface p-4">
        <h3 className="text-sm font-semibold text-[#25313c] mb-3">
          DECISION PATTERN DIGEST
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4 text-xs text-[#6f685f]">
          <Stat label="Reviewed total" value={patternDigest.totalsReviewed} />
          <Stat
            label="This week"
            value={patternDigest.currentWeekReviewedCount}
            hint={`prior ${patternDigest.priorWeekReviewedCount} · Δ ${
              patternDigest.weeklyDelta > 0 ? "+" : ""
            }${patternDigest.weeklyDelta}`}
          />
          <Stat
            label="Sentiment"
            value={`${patternDigest.positiveCount}/${patternDigest.negativeCount}/${patternDigest.neutralCount}`}
            hint="positive / negative / neutral"
          />
          <Stat
            label="Open overdue reviews"
            value={patternDigest.openOverdueReviewCount}
            hint={
              patternDigest.openOverdueReviewCount > 0
                ? "review_date past, result_later empty"
                : "all caught up"
            }
          />
        </div>
        {patternDigest.topRecurringDecisionTitles.length === 0 ? (
          <div className="mt-3 text-xs text-[#9b938a]">
            No repeated decisions yet. Patterns appear once a normalized decision title is reviewed at least twice.
          </div>
        ) : (
          <ul className="mt-3 space-y-1.5 text-xs">
            {patternDigest.topRecurringDecisionTitles.slice(0, 3).map((recurring) => (
              <li
                key={recurring.title}
                className="rounded-md border border-[#ece5da] bg-white/70 p-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-[#25313c]">{recurring.title}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                      recurring.dominantSentiment === "positive"
                        ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                        : recurring.dominantSentiment === "negative"
                          ? "border-rose-200 bg-rose-100 text-rose-700"
                          : "border-stone-200 bg-stone-100 text-stone-700"
                    }`}
                  >
                    ×{recurring.count} {recurring.dominantSentiment}
                  </span>
                </div>
                {recurring.lastResultExcerpt ? (
                  <div className="mt-0.5 text-[11px] text-[#6f685f]">
                    Last result: {recurring.lastResultExcerpt}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ReviewTextCard
          title="BIGGEST WIN"
          icon={<Trophy size={14} className="text-[#6a9a74]" />}
          accent="text-[#6a9a74]"
          value={form.biggestWin}
          onChange={(value) => setForm((p) => ({ ...p, biggestWin: value }))}
          placeholder="What went well this week?"
        />
        <ReviewTextCard
          title="BIGGEST LEAK"
          icon={<TrendingDown size={14} className="text-[#c97a73]" />}
          accent="text-[#c97a73]"
          value={form.biggestLeak}
          onChange={(value) => setForm((p) => ({ ...p, biggestLeak: value }))}
          placeholder="Where did energy go to waste?"
        />
        <ReviewTextCard
          title="NEXT WEEK BIG 3"
          icon={<Frown size={14} className="text-[#c39a4e]" />}
          accent="text-[#c39a4e]"
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
        <h3 className="text-sm font-semibold text-[#25313c] mb-3">
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
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[#6f685f]">
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
        <div className="rounded border border-[#6b87ae]/30 bg-[#6b87ae]/10 px-3 py-2 text-xs text-[#6b87ae]">
          Supabase is configured, but there is no session yet. Draft mode is
          still available.
        </div>
      ) : null}
      {!hasSupabaseConfig ? (
        <div className="rounded border border-[#c39a4e]/30 bg-[#c39a4e]/10 px-3 py-2 text-xs text-[#c39a4e]">
          Supabase env vars are missing. Weekly review will stay local until the
          frontend env is added.
        </div>
      ) : null}
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
        <label className="text-[10px] uppercase tracking-wider text-[#6f685f]">
          {label}
        </label>
        <span className="font-mono-data text-[10px] text-[#6b87ae]">
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

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-[#ece5da] bg-white/70 p-2">
      <div className="text-[10px] uppercase tracking-wider text-[#9b938a] font-semibold">
        {label}
      </div>
      <div className="text-base font-semibold text-[#25313c]">{value}</div>
      {hint ? <div className="text-[10px] text-[#6f685f]">{hint}</div> : null}
    </div>
  );
}
