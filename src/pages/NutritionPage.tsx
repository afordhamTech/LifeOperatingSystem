import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Droplets,
  Loader2,
  Minus,
  Plus,
  Save,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { SyncBadge } from "@/components/SyncBadge";
import type { NutritionLogRow } from "@/lib/supabase-types";
import { calcNutritionStatus } from "@/lib/calculations";
import { toDateKey } from "@/lib/date-helpers";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { runSupabasePersistence } from "@/lib/persistence-runner";
import {
  fetchNutritionLog,
  fetchNutritionLogs,
  upsertNutritionLog,
} from "@/lib/lifeee-persistence";

type NutritionForm = {
  bodyweight: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterOz: number;
  mealsCount: number;
  trainingDay: boolean;
  notes: string;
};

const defaultForm: NutritionForm = {
  bodyweight: 145,
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  waterOz: 0,
  mealsCount: 0,
  trainingDay: false,
  notes: "",
};

function rowToForm(row: NutritionLogRow): NutritionForm {
  return {
    bodyweight: row.bodyweight ?? defaultForm.bodyweight,
    calories: row.calories ?? 0,
    proteinG: row.protein_g ?? 0,
    carbsG: row.carbs_g ?? 0,
    fatG: row.fat_g ?? 0,
    waterOz: row.water_oz ?? 0,
    mealsCount: row.meals_count ?? 0,
    trainingDay: row.training_day ?? false,
    notes: row.notes ?? "",
  };
}

export default function NutritionPage() {
  const today = useMemo(() => toDateKey(new Date()), []);
  const { hasSupabaseConfig, isLoading: sessionLoading, userId } = useSupabaseSession();
  const [form, setForm] = useState<NutritionForm>(defaultForm);
  const [history, setHistory] = useState<NutritionLogRow[]>([]);
  const [surplus, setSurplus] = useState(500);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const remoteLoadedRef = useRef(false);
  const { syncStatus, setSyncStatus } = useSyncStatus("local");

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
            ? "No Supabase session yet. Nutrition logs stay in local draft mode until auth is connected."
            : "Supabase env vars are missing. Nutrition logs stay in local draft mode.",
        );
        setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
        return;
      }

      setIsLoading(true);
      setError(null);
      setSyncStatus("loading");

      const start = new Date();
      start.setDate(start.getDate() - 6);

      try {
        const [todayNutrition, weekNutrition] = await Promise.all([
          fetchNutritionLog(userId, today),
          fetchNutritionLogs(userId, toDateKey(start), today),
        ]);

        if (!active) return;

        if (todayNutrition) {
          setForm(rowToForm(todayNutrition));
        } else {
          setForm(defaultForm);
        }

        setHistory(weekNutrition);

        remoteLoadedRef.current = true;
        setIsLoading(false);
        setNotice(
          todayNutrition
            ? "Loaded from Supabase."
            : "No Supabase nutrition log exists for today yet. Local draft only until you save.",
        );
        setSyncStatus(todayNutrition ? "saved" : "local");
      } catch (loadError) {
        if (!active) return;
        remoteLoadedRef.current = false;
        setError(loadError instanceof Error ? loadError.message : "Unable to load nutrition logs.");
        setIsLoading(false);
        setSyncStatus("error");
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [hasSupabaseConfig, sessionLoading, setSyncStatus, today, userId]);

  const maintenance = Math.round(form.bodyweight * 15);
  const targetCalories = maintenance + surplus;
  const proteinTarget = Math.round(form.bodyweight * 1.0);

  const currentStatus = calcNutritionStatus(
    form.calories,
    form.proteinG,
    form.waterOz,
    form.mealsCount,
    form.bodyweight,
    targetCalories,
  );

  const weightTrend = history
    .filter((row) => row.bodyweight != null)
    .map((row) => ({
      date: row.date,
      weight: Number(row.bodyweight ?? 0),
      calories: Number(row.calories ?? 0),
    }));

  const weightChange =
    weightTrend.length >= 2
      ? Math.round(
          (weightTrend[weightTrend.length - 1].weight - weightTrend[0].weight) * 100,
        ) / 100
      : 0;

  const calorieFeedback =
    weightChange < 0.25
      ? { message: "Add 200 calories per day", action: "up" as const }
      : weightChange <= 1
        ? { message: "Keep calories the same", action: "same" as const }
        : { message: "Remove 150 calories per day", action: "down" as const };

  const chartData = history
    .filter((row) => row.bodyweight != null)
    .map((row) => ({
      day: new Date(row.date).toLocaleDateString("en-US", { weekday: "short" }),
      bodyweight: Number(row.bodyweight ?? 0),
      calories: Number(row.calories ?? 0),
    }));

  const handleSave = async () => {
    const payload = {
      date: today,
      bodyweight: form.bodyweight,
      calories: form.calories,
      protein_g: form.proteinG,
      carbs_g: form.carbsG,
      fat_g: form.fatG,
      water_oz: form.waterOz,
      meals_count: form.mealsCount,
      training_day: form.trainingDay,
      notes: form.notes.trim() || null,
    };

    if (!userId) {
      const localRow: NutritionLogRow = {
        id: crypto.randomUUID(),
        user_id: "local-draft",
        date: today,
        bodyweight: form.bodyweight,
        calories: form.calories,
        protein_g: form.proteinG,
        carbs_g: form.carbsG,
        fat_g: form.fatG,
        water_oz: form.waterOz,
        meals_count: form.mealsCount,
        training_day: form.trainingDay,
        notes: form.notes.trim() || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setHistory((current) => {
        const others = current.filter((row) => row.date !== today);
        return [...others, localRow];
      });
      setNotice("Nutrition log stored in local draft mode.");
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
      operation: () => upsertNutritionLog(userId, payload),
    });

    if (result.ok) {
      if (result.data) {
        setForm(rowToForm(result.data));
        setHistory((current) => {
          const others = current.filter((row) => row.date !== today);
          return [...others, result.data as NutritionLogRow];
        });
      }

      setNotice("Nutrition log saved to Supabase.");
      setSyncStatus(result.status);
    } else {
      setError(result.error);
      setSyncStatus(result.status);
    }

    setIsSaving(false);
  };

  const waterRemaining = Math.max(0, 8 - form.waterOz);

  return (
    <div className="space-y-6">
      <div className="border-b border-[#ddd4c6] pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[#25313c]">Nutrition</h1>
            <p className="text-sm text-[#6f685f] mt-1">
              Track whether your food supports muscle gain, energy, school, and
              recovery.
            </p>
          </div>
          <SyncBadge status={syncStatus} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#25313c] mb-3">
              CALORIE TARGET
            </h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[10px] uppercase text-[#6f685f] block mb-1">
                  Bodyweight (lbs)
                </label>
                <input
                  type="number"
                  value={form.bodyweight}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, bodyweight: Number(e.target.value) }))
                  }
                  className="input-dark w-full"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase text-[#6f685f] block mb-1">
                  Maintenance
                </label>
                <div className="text-sm text-[#6f685f] py-2">
                  {maintenance} cal
                </div>
              </div>
            </div>
            <div className="mb-3">
              <label className="text-[10px] uppercase text-[#6f685f] block mb-1">
                Surplus: +{surplus} cal
              </label>
              <input
                type="range"
                min={200}
                max={600}
                step={50}
                value={surplus}
                onChange={(e) => setSurplus(Number(e.target.value))}
                className="slider-dark"
              />
            </div>
            <div className="text-center">
              <span className="text-3xl font-bold text-[#6b87ae]">
                {targetCalories}
              </span>
              <span className="text-sm text-[#6f685f]"> cal/day target</span>
            </div>
            <div className="mt-2 flex items-center justify-center gap-1 text-xs">
              {calorieFeedback.action === "up" ? (
                <TrendingUp size={12} className="text-[#c39a4e]" />
              ) : null}
              {calorieFeedback.action === "down" ? (
                <TrendingDown size={12} className="text-[#c97a73]" />
              ) : null}
              {calorieFeedback.action === "same" ? (
                <CheckCircle2 size={12} className="text-[#6a9a74]" />
              ) : null}
              <span
                className={
                  calorieFeedback.action === "up"
                    ? "text-[#c39a4e]"
                    : calorieFeedback.action === "down"
                      ? "text-[#c97a73]"
                      : "text-[#6a9a74]"
                }
              >
                {calorieFeedback.message}
              </span>
            </div>
          </div>

          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#25313c] mb-3">
              DAILY INPUT
            </h3>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] uppercase text-[#6f685f]">
                    Calories Eaten
                  </label>
                  <span className="font-mono-data text-[10px] text-[#6f685f]">
                    {form.calories}/{targetCalories}
                  </span>
                </div>
                <input
                  type="number"
                  value={form.calories}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, calories: Number(e.target.value) }))
                  }
                  className="input-dark w-full"
                />
                <div className="mt-1 h-1 bg-[#ece5da] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#c39a4e] rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (form.calories / targetCalories) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] uppercase text-[#6f685f]">
                    Protein (g)
                  </label>
                  <span className="font-mono-data text-[10px] text-[#6f685f]">
                    {form.proteinG}/{proteinTarget}g
                  </span>
                </div>
                <input
                  type="number"
                  value={form.proteinG}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, proteinG: Number(e.target.value) }))
                  }
                  className="input-dark w-full"
                />
                <div className="mt-1 h-1 bg-[#ece5da] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#6a9a74] rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (form.proteinG / proteinTarget) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase text-[#6f685f] block mb-1">
                    Carbs (g)
                  </label>
                  <input
                    type="number"
                    value={form.carbsG}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, carbsG: Number(e.target.value) }))
                    }
                    className="input-dark w-full"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-[#6f685f] block mb-1">
                    Fat (g)
                  </label>
                  <input
                    type="number"
                    value={form.fatG}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, fatG: Number(e.target.value) }))
                    }
                    className="input-dark w-full"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase text-[#6f685f] block mb-2">
                  Water Glasses
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setForm((p) => ({ ...p, waterOz: Math.max(0, p.waterOz - 1) }))}
                    className="p-1 bg-[#f0ebe2] rounded hover:bg-[#ebe4da] transition-colors"
                  >
                    <Minus size={14} />
                  </button>
                  <div className="flex gap-1 flex-1 justify-center">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Droplets
                        key={i}
                        size={16}
                        className={
                          i < form.waterOz ? "text-[#6b87ae]" : "text-white/[0.06]"
                        }
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => setForm((p) => ({ ...p, waterOz: Math.min(8, p.waterOz + 1) }))}
                    className="p-1 bg-[#f0ebe2] rounded hover:bg-[#ebe4da] transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <div className="mt-1 text-[10px] text-[#6f685f] text-center">
                  {waterRemaining} more glasses to hit the target
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase text-[#6f685f] block mb-1">
                  Meals Eaten
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setForm((p) => ({ ...p, mealsCount: Math.max(0, p.mealsCount - 1) }))
                    }
                    className="p-1 bg-[#f0ebe2] rounded hover:bg-[#ebe4da] transition-colors"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="text-sm text-[#25313c] w-8 text-center">
                    {form.mealsCount}
                  </span>
                  <button
                    onClick={() =>
                      setForm((p) => ({ ...p, mealsCount: p.mealsCount + 1 }))
                    }
                    className="p-1 bg-[#f0ebe2] rounded hover:bg-[#ebe4da] transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-[#6f685f]">
                <input
                  type="checkbox"
                  checked={form.trainingDay}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, trainingDay: e.target.checked }))
                  }
                  className="rounded border-[#ddd4c6] bg-[#f0ebe2]"
                />
                Training day
              </label>

              <div>
                <label className="text-[10px] uppercase text-[#6f685f] block mb-1">
                  Notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, notes: e.target.value }))
                  }
                  className="input-dark w-full h-20 resize-none"
                  placeholder="Meal timing, appetite, digestion, anything useful"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#25313c] mb-3">
              NUTRITION STATUS
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <StatusChip label="Calories" ok={currentStatus.caloriesHit} />
              <StatusChip label="Protein" ok={currentStatus.proteinHit} />
              <StatusChip label="Water" ok={currentStatus.waterHit} />
              <StatusChip label="Meals" ok={currentStatus.timingOk} />
            </div>
            <div className="mt-3 text-sm text-[#6f685f]">
              Checks: <span className="text-[#25313c]">{currentStatus.checks}/4</span>
            </div>
            <div className="mt-2 text-sm">
              Status:{" "}
              <span
                className={
                  currentStatus.status === "green"
                    ? "text-[#6a9a74]"
                    : currentStatus.status === "yellow"
                      ? "text-[#c39a4e]"
                      : "text-[#c97a73]"
                }
              >
                {currentStatus.status.toUpperCase()}
              </span>
            </div>
          </div>

          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#25313c] mb-3">
              SAVE NUTRITION
            </h3>
            {!hasSupabaseConfig ? (
              <div className="mb-3 rounded border border-[#c39a4e]/30 bg-[#c39a4e]/10 px-3 py-2 text-xs text-[#c39a4e]">
                Supabase env vars are missing. Nutrition logs stay in local draft
                mode.
              </div>
            ) : null}
            {hasSupabaseConfig && !userId ? (
              <div className="mb-3 rounded border border-[#6b87ae]/30 bg-[#6b87ae]/10 px-3 py-2 text-xs text-[#6b87ae]">
                Supabase is configured, but there is no session yet.
              </div>
            ) : null}
            {error ? (
              <div className="mb-3 rounded border border-[#c97a73]/30 bg-[#c97a73]/10 px-3 py-2 text-xs text-[#c97a73]">
                {error}
              </div>
            ) : null}
            {notice ? (
              <div className="mb-3 rounded border border-[#ddd4c6] bg-[#fdfaf4] px-3 py-2 text-xs text-[#6f685f]">
                {notice}
              </div>
            ) : null}
            <button
              onClick={handleSave}
              className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSaving || isLoading || sessionLoading}
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isSaving ? "Saving..." : "Save Nutrition"}
            </button>
          </div>

          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#25313c] mb-3">
              WEIGHT TREND
            </h3>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(111,104,95,0.14)" />
                  <XAxis dataKey="day" stroke="#8c8478" fontSize={10} />
                  <YAxis stroke="#8c8478" fontSize={10} />
                  <Tooltip
                    contentStyle={{
                      background: "#f0ebe2",
                      border: "1px solid rgba(111,104,95,0.18)",
                      fontSize: "11px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="bodyweight"
                    stroke="#6b87ae"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-[#8c8478]">
                Save a nutrition log to see the trend line.
              </div>
            )}
            <div className="mt-2 flex items-center gap-2 text-xs text-[#6f685f]">
              {weightChange < 0.25 ? (
                <TrendingUp size={12} className="text-[#c39a4e]" />
              ) : weightChange > 1 ? (
                <TrendingDown size={12} className="text-[#c97a73]" />
              ) : (
                <CheckCircle2 size={12} className="text-[#6a9a74]" />
              )}
              <span>{weightChange > 0 ? "+" : ""}
                {weightChange} lbs over the tracked period
              </span>
            </div>
          </div>

          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#25313c] mb-3">
              WEEK SNAPSHOT
            </h3>
            <div className="text-xs text-[#6f685f]">
              {history.length > 0
                ? `${history.length} nutrition logs loaded from Supabase.`
                : "No weekly logs yet. Add a few days of entries to see weight and calorie trends."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div
      className="flex items-center justify-between rounded px-3 py-2"
      style={{ backgroundColor: ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)" }}
    >
      <span className="text-[#6f685f]">{label}</span>
      <span className={ok ? "text-[#6a9a74]" : "text-[#c97a73]"}>
        {ok ? "Hit" : "Miss"}
      </span>
    </div>
  );
}
