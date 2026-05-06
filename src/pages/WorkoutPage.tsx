import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { AlertTriangle, Loader2, Plus, Save, Trash2 } from "lucide-react";
import StatusRing, { getStatusColor } from "@/components/StatusRing";
import { supabase } from "@/lib/supabase-client";
import type { WorkoutLogRow } from "@/lib/supabase-types";
import {
  calcTrainingReadiness,
  getWorkoutDecision,
} from "@/lib/calculations";
import { toDateKey } from "@/lib/date-helpers";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";

interface Exercise {
  name: string;
  sets: number;
  reps: number;
  weight: number;
  rpe: number;
}

type WorkoutForm = {
  workoutType: string;
  durationMinutes: number;
  rpe: number;
  soreness: number;
  pain: number;
  energy: number;
  notes: string;
};

const defaultForm: WorkoutForm = {
  workoutType: "Strength",
  durationMinutes: 60,
  rpe: 7,
  soreness: 3,
  pain: 1,
  energy: 7,
  notes: "",
};

const exercisePresets = [
  "Squat",
  "Bench Press",
  "Deadlift",
  "Overhead Press",
  "Barbell Row",
  "Pull-up",
  "Dip",
  "Lunge",
  "Romanian Deadlift",
  "Leg Press",
];

function rowToExercises(value: unknown): Exercise[] {
  if (!Array.isArray(value)) return [];
  return value.filter(Boolean) as Exercise[];
}

function rowToForm(row: WorkoutLogRow): WorkoutForm {
  return {
    workoutType: row.workout_type ?? defaultForm.workoutType,
    durationMinutes: row.duration_minutes ?? defaultForm.durationMinutes,
    rpe: row.rpe ?? defaultForm.rpe,
    soreness: row.soreness ?? defaultForm.soreness,
    pain: row.pain ?? defaultForm.pain,
    energy: row.energy ?? defaultForm.energy,
    notes: row.notes ?? "",
  };
}

function computeReadiness(sleepReadiness: number, form: WorkoutForm) {
  return calcTrainingReadiness(
    sleepReadiness,
    form.energy,
    form.soreness,
    form.pain,
  );
}

export default function WorkoutPage() {
  const today = useMemo(() => toDateKey(new Date()), []);
  const { hasSupabaseConfig, userId } = useSupabaseSession();
  const [form, setForm] = useState<WorkoutForm>(defaultForm);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [history, setHistory] = useState<WorkoutLogRow[]>([]);
  const [sleepReadiness, setSleepReadiness] = useState(6);
  const [newExercise, setNewExercise] = useState<Exercise>({
    name: "",
    sets: 3,
    reps: 8,
    weight: 0,
    rpe: 7,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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
            ? "No Supabase session yet. Workout logs stay in local draft mode until auth is connected."
            : "Supabase env vars are missing. Workout logs stay in local draft mode.",
        );
        return;
      }

      setIsLoading(true);
      setError(null);

      const start = new Date();
      start.setDate(start.getDate() - 6);

      const [todayWorkout, weekWorkout, sleepLog] = await Promise.all([
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
          .from("sleep_logs")
          .select("sleep_readiness")
          .eq("user_id", userId)
          .eq("date", today)
          .maybeSingle(),
      ]);

      if (!active) return;

      if (todayWorkout.error) {
        setError(todayWorkout.error.message);
      } else if (todayWorkout.data) {
        setForm(rowToForm(todayWorkout.data as WorkoutLogRow));
        setExercises(rowToExercises((todayWorkout.data as WorkoutLogRow).exercises));
      }

      if (weekWorkout.error) {
        setError(weekWorkout.error.message);
      } else {
        setHistory((weekWorkout.data ?? []) as WorkoutLogRow[]);
      }

      if (!sleepLog.error && sleepLog.data?.sleep_readiness != null) {
        setSleepReadiness(Number(sleepLog.data.sleep_readiness));
      }

      setIsLoading(false);
      setNotice("Loaded from Supabase.");
    };

    void load();

    return () => {
      active = false;
    };
  }, [hasSupabaseConfig, today, userId]);

  const readinessScore = computeReadiness(sleepReadiness, form);
  const decision = getWorkoutDecision(readinessScore, form.pain);
  const chartData = history.map((row) => ({
    day: new Date(row.date).toLocaleDateString("en-US", { weekday: "short" }),
    readiness: Number(row.training_readiness ?? 0),
    energy: Number(row.energy ?? 0),
    pain: Number(row.pain ?? 0),
  }));

  const handleAddExercise = () => {
    if (!newExercise.name) return;
    setExercises((current) => [...current, newExercise]);
    setNewExercise({ name: "", sets: 3, reps: 8, weight: 0, rpe: 7 });
  };

  const handleSaveWorkout = async () => {
    const payload = {
      user_id: userId,
      date: today,
      workout_type: form.workoutType,
      exercises,
      duration_minutes: form.durationMinutes,
      rpe: form.rpe,
      soreness: form.soreness,
      pain: form.pain,
      energy: form.energy,
      training_readiness: readinessScore,
      notes: form.notes.trim() || null,
    };

    if (!supabase || !userId) {
      setHistory((current) => {
        const nextRow: WorkoutLogRow = {
          id: crypto.randomUUID(),
          user_id: "local-draft",
          date: today,
          workout_type: form.workoutType,
          exercises,
          duration_minutes: form.durationMinutes,
          rpe: form.rpe,
          soreness: form.soreness,
          pain: form.pain,
          energy: form.energy,
          training_readiness: readinessScore,
          notes: form.notes.trim() || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const others = current.filter((row) => row.date !== today);
        return [...others, nextRow];
      });
      setNotice("Workout stored in local draft mode.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    const { error: saveError } = await supabase
      .from("workout_logs")
      .upsert(payload, { onConflict: "user_id,date" });

    if (saveError) {
      setError(saveError.message);
    } else {
      const { data: savedRow } = await supabase
        .from("workout_logs")
        .select("*")
        .eq("user_id", userId)
        .eq("date", today)
        .maybeSingle();

      if (savedRow) {
        setHistory((current) => {
          const next = current.filter((row) => row.date !== today);
          return [...next, savedRow as WorkoutLogRow];
        });
      }
      setNotice("Workout saved to Supabase.");
    }

    setIsSaving(false);
  };

  const removeExercise = (idx: number) => {
    setExercises((current) => current.filter((_, i) => i !== idx));
  };

  const recoveryFactors = [
    { label: "Sleep Readiness", value: sleepReadiness },
    { label: "Energy", value: form.energy },
    { label: "Soreness Recovery", value: 10 - form.soreness },
    { label: "Pain Safety", value: 10 - form.pain },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-[#ddd4c6] pb-4">
        <h1 className="text-2xl font-semibold text-[#25313c]">Workout</h1>
        <p className="text-sm text-[#6f685f] mt-1">
          Track training, athletic development, fatigue, progression, and injury
          risk.
        </p>
      </div>

      <div className="card-surface p-5">
        <div className="flex flex-wrap items-center gap-6">
          <StatusRing score={readinessScore} size={80} strokeWidth={5} />
          <div>
            <div
              className="inline-block px-4 py-1.5 rounded-full text-sm font-medium"
              style={{
                backgroundColor: `${decision.color}20`,
                color: decision.color,
              }}
            >
              {decision.label}
            </div>
            <div className="mt-2 text-xs text-[#6f685f]">
              Training Readiness: {readinessScore.toFixed(1)}/10
            </div>
          </div>
          <div className="flex-1 space-y-2 min-w-[200px]">
            {recoveryFactors.map((factor) => (
              <FactorBar
                key={factor.label}
                label={factor.label}
                value={factor.value}
                max={10}
                color="#6b87ae"
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card-surface p-4">
          <SliderInput label="Energy" value={form.energy} onChange={(value) => setForm((p) => ({ ...p, energy: value }))} />
        </div>
        <div className="card-surface p-4">
          <SliderInput
            label="Soreness"
            value={form.soreness}
            onChange={(value) => setForm((p) => ({ ...p, soreness: value }))}
          />
        </div>
        <div className="card-surface p-4">
          <SliderInput
            label="Pain"
            value={form.pain}
            onChange={(value) => setForm((p) => ({ ...p, pain: value }))}
          />
          {form.pain > 4 ? (
            <div className="mt-2 flex items-center gap-1 text-[10px] text-[#c97a73]">
              <AlertTriangle size={10} />
              Pain above 4 - consider modifying training
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#25313c] mb-3">
            ADD EXERCISE
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={newExercise.name}
              onChange={(e) =>
                setNewExercise((p) => ({ ...p, name: e.target.value }))
              }
              className="input-dark col-span-2"
            >
              <option value="">Select exercise...</option>
              {exercisePresets.map((exercise) => (
                <option key={exercise} value={exercise}>
                  {exercise}
                </option>
              ))}
              <option value="Custom">Custom</option>
            </select>
            {newExercise.name === "Custom" ? (
              <input
                type="text"
                placeholder="Exercise name"
                onChange={(e) =>
                  setNewExercise((p) => ({ ...p, name: e.target.value }))
                }
                className="input-dark col-span-2"
              />
            ) : null}
            <div>
              <label className="text-[10px] uppercase text-[#6f685f] block mb-1">
                Sets
              </label>
              <input
                type="number"
                value={newExercise.sets}
                onChange={(e) =>
                  setNewExercise((p) => ({
                    ...p,
                    sets: Number(e.target.value),
                  }))
                }
                className="input-dark w-full"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#6f685f] block mb-1">
                Reps
              </label>
              <input
                type="number"
                value={newExercise.reps}
                onChange={(e) =>
                  setNewExercise((p) => ({
                    ...p,
                    reps: Number(e.target.value),
                  }))
                }
                className="input-dark w-full"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#6f685f] block mb-1">
                Weight (lbs)
              </label>
              <input
                type="number"
                value={newExercise.weight}
                onChange={(e) =>
                  setNewExercise((p) => ({
                    ...p,
                    weight: Number(e.target.value),
                  }))
                }
                className="input-dark w-full"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#6f685f] block mb-1">
                Exercise RPE
              </label>
              <input
                type="range"
                min={1}
                max={10}
                value={newExercise.rpe}
                onChange={(e) =>
                  setNewExercise((p) => ({
                    ...p,
                    rpe: Number(e.target.value),
                  }))
                }
                className="slider-dark"
              />
              <span className="text-[10px] text-[#6f685f]">
                {newExercise.rpe}/10
              </span>
            </div>
          </div>
          <button
            onClick={handleAddExercise}
            className="btn-primary mt-3 inline-flex items-center gap-2"
          >
            <Plus size={14} />
            Add to Workout
          </button>
        </div>

        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#25313c] mb-3">
            TODAY&apos;S WORKOUT
          </h3>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase text-[#6f685f] block mb-1">
                  Workout Type
                </label>
                <select
                  value={form.workoutType}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, workoutType: e.target.value }))
                  }
                  className="input-dark w-full"
                >
                  <option value="Strength">Strength</option>
                  <option value="Conditioning">Conditioning</option>
                  <option value="Sport">Sport</option>
                  <option value="Recovery">Recovery</option>
                  <option value="Mixed">Mixed</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase text-[#6f685f] block mb-1">
                  Duration (min)
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.durationMinutes}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      durationMinutes: Number(e.target.value),
                    }))
                  }
                  className="input-dark w-full"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] uppercase text-[#6f685f] block mb-1">
                  Session RPE
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={form.rpe}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, rpe: Number(e.target.value) }))
                  }
                  className="slider-dark"
                />
                <span className="text-[10px] text-[#6f685f]">{form.rpe}/10</span>
              </div>
            </div>

            {exercises.length > 0 ? (
              <div className="space-y-2">
                {exercises.map((exercise, index) => (
                  <div
                    key={`${exercise.name}-${index}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 bg-[#f0ebe2] rounded"
                  >
                    <div className="text-sm text-[#25313c]">
                      {exercise.name} - {exercise.sets}x{exercise.reps} @{" "}
                      {exercise.weight} lbs - RPE {exercise.rpe}
                    </div>
                    <button
                      onClick={() => removeExercise(index)}
                      className="text-[#8c8478] hover:text-[#c97a73] transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded border border-dashed border-[#d8cdbd] p-4 text-sm text-[#8c8478]">
                Add exercises to build today&apos;s session.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-surface p-4">
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#6f685f]">
            Notes
          </label>
          <textarea
            className="input-dark h-28 w-full resize-none"
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            placeholder="Session notes, cues, pain, wins"
          />
        </div>

        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#25313c] mb-3">
            SAVE SESSION
          </h3>
          {!hasSupabaseConfig ? (
            <div className="mb-3 rounded border border-[#c39a4e]/30 bg-[#c39a4e]/10 px-3 py-2 text-xs text-[#c39a4e]">
              Supabase env vars are missing. Workout logs stay in local draft
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
            onClick={handleSaveWorkout}
            className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSaving || isLoading}
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isSaving ? "Saving..." : "Save Workout"}
          </button>
        </div>
      </div>

      <div className="card-surface p-4">
        <h3 className="text-sm font-semibold text-[#25313c] mb-3">
          7-DAY TREND
        </h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(111,104,95,0.14)" />
              <XAxis dataKey="day" stroke="#8c8478" fontSize={10} />
              <YAxis domain={[0, 10]} stroke="#8c8478" fontSize={10} />
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
              <Line
                type="monotone"
                dataKey="energy"
                stroke="#6a9a74"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-sm text-[#8c8478]">
            Save a workout to see the trend line.
          </div>
        )}
      </div>

      <div className="card-surface p-4 overflow-x-auto">
        <h3 className="text-sm font-semibold text-[#25313c] mb-3">HISTORY</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[#6f685f] text-left border-b border-[#ddd4c6]">
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 font-medium">Type</th>
              <th className="pb-2 font-medium">Duration</th>
              <th className="pb-2 font-medium">Energy</th>
              <th className="pb-2 font-medium">Pain</th>
              <th className="pb-2 font-medium">Readiness</th>
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr
                key={row.id}
                className="border-b border-[#e3d8c9] hover:bg-[#f7f3ed]"
              >
                <td className="py-2 text-[#25313c]">{row.date}</td>
                <td className="py-2 text-[#6f685f]">{row.workout_type}</td>
                <td className="py-2 text-[#6f685f]">
                  {Number(row.duration_minutes ?? 0)} min
                </td>
                <td className="py-2 text-[#6f685f]">{row.energy}/10</td>
                <td className="py-2 text-[#6f685f]">{row.pain}/10</td>
                <td className="py-2">
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-mono-data"
                    style={{
                      backgroundColor: `${getStatusColor(Number(row.training_readiness ?? 0))}15`,
                      color: getStatusColor(Number(row.training_readiness ?? 0)),
                    }}
                  >
                    {Number(row.training_readiness ?? 0).toFixed(1)}
                  </span>
                </td>
              </tr>
            ))}
            {history.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[#8c8478]">
                  No workouts yet. Add today’s session so the readiness trend has context.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FactorBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-[#6f685f] w-28">{label}</span>
      <div className="flex-1 h-1 bg-[#ece5da] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${(value / max) * 100}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[#6f685f] w-10 text-right">{value.toFixed(1)}</span>
    </div>
  );
}

function SliderInput({
  label,
  value,
  onChange,
  min = 1,
  max = 10,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] uppercase text-[#6f685f]">{label}</label>
        <span className="font-mono-data text-[10px] text-[#6f685f]">
          {value}/{max}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider-dark"
      />
    </div>
  );
}
