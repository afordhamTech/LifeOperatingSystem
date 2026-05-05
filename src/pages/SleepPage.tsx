import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Circle, Loader2, Save } from "lucide-react";
import StatusRing, {
  getStatusColor,
  getStatusLabel,
} from "@/components/StatusRing";
import { supabase } from "@/lib/supabase-client";
import type { SleepLogRow } from "@/lib/supabase-types";
import {
  calculateSleepDebt,
  calculateSleepReadiness,
} from "@/lib/life-scoring";
import { toDateKey } from "@/lib/date-helpers";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";

type SleepForm = {
  bedtime: string;
  wakeTime: string;
  sleepQuality: number;
  wakeEnergy: number;
  stressBeforeBed: number;
  caffeineAfter3pm: boolean;
  napMinutes: number;
  notes: string;
};

const defaultForm: SleepForm = {
  bedtime: "23:00",
  wakeTime: "07:00",
  sleepQuality: 7,
  wakeEnergy: 6,
  stressBeforeBed: 5,
  caffeineAfter3pm: false,
  napMinutes: 0,
  notes: "",
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toTimeInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoTimestamp(dateKey: string, timeValue: string, dayOffset = 0) {
  const date = new Date(`${dateKey}T${timeValue}:00`);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString();
}

function calculateHoursSlept(bedtime: string, wakeTime: string) {
  const [bedHours, bedMinutes] = bedtime.split(":").map(Number);
  const [wakeHours, wakeMinutes] = wakeTime.split(":").map(Number);
  let totalMinutes = wakeHours * 60 + wakeMinutes - (bedHours * 60 + bedMinutes);
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60;
  }
  return Math.round((totalMinutes / 60) * 100) / 100;
}

function rowToForm(row: SleepLogRow): SleepForm {
  return {
    bedtime: toTimeInputValue(row.bedtime) || defaultForm.bedtime,
    wakeTime: toTimeInputValue(row.wake_time) || defaultForm.wakeTime,
    sleepQuality: row.sleep_quality ?? defaultForm.sleepQuality,
    wakeEnergy: row.wake_energy ?? defaultForm.wakeEnergy,
    stressBeforeBed: row.stress_before_bed ?? defaultForm.stressBeforeBed,
    caffeineAfter3pm: row.caffeine_after_3pm ?? false,
    napMinutes: row.nap_minutes ?? 0,
    notes: row.notes ?? "",
  };
}

function formToPayload(form: SleepForm, dateKey: string) {
  const bedtime = toIsoTimestamp(dateKey, form.bedtime);
  const wakeDayOffset = form.wakeTime <= form.bedtime ? 1 : 0;
  const wakeTime = toIsoTimestamp(dateKey, form.wakeTime, wakeDayOffset);
  const hoursSlept = calculateHoursSlept(form.bedtime, form.wakeTime);
  const sleepDebt = calculateSleepDebt(hoursSlept);
  const sleepReadiness = calculateSleepReadiness({
    hoursSlept,
    sleepQuality: form.sleepQuality,
    wakeEnergy: form.wakeEnergy,
    stressBeforeBed: form.stressBeforeBed,
  });

  return {
    bedtime,
    wake_time: wakeTime,
    hours_slept: hoursSlept,
    sleep_quality: form.sleepQuality,
    wake_energy: form.wakeEnergy,
    stress_before_bed: form.stressBeforeBed,
    caffeine_after_3pm: form.caffeineAfter3pm,
    nap_minutes: form.napMinutes,
    sleep_debt: sleepDebt,
    sleep_readiness: sleepReadiness,
    notes: form.notes.trim() || null,
  };
}

const recoveryTodos = [
  "No caffeine after 2 PM.",
  "Use the wind-down window one hour before bed.",
  "Keep tomorrow's first deep work block after your best sleep window.",
  "If you need a nap, cap it at 20 minutes.",
];

export default function SleepPage() {
  const today = useMemo(() => toDateKey(new Date()), []);
  const { hasSupabaseConfig: supabaseConfigured, isLoading: sessionLoading, userId } =
    useSupabaseSession();
  const [form, setForm] = useState<SleepForm>(defaultForm);
  const [history, setHistory] = useState<SleepLogRow[]>([]);
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
          supabaseConfigured
            ? "No Supabase session yet. Sleep logs stay in draft mode until auth is connected."
            : "Supabase env vars are missing. Sleep logs stay in local draft mode.",
        );
        return;
      }

      setIsLoading(true);
      setError(null);

      const start = new Date();
      start.setDate(start.getDate() - 6);

      const [todayResult, weekResult] = await Promise.all([
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
      ]);

      if (!active) return;

      if (todayResult.error) {
        setError(todayResult.error.message);
      } else if (todayResult.data) {
        setForm(rowToForm(todayResult.data as SleepLogRow));
      } else {
        setForm(defaultForm);
      }

      if (weekResult.error) {
        setError(weekResult.error.message);
      } else {
        setHistory((weekResult.data ?? []) as SleepLogRow[]);
      }

      setIsLoading(false);
      setNotice("Loaded from Supabase.");
    };

    void load();

    return () => {
      active = false;
    };
  }, [supabaseConfigured, today, userId]);

  const hoursSlept = calculateHoursSlept(form.bedtime, form.wakeTime);
  const sleepDebt = calculateSleepDebt(hoursSlept);
  const sleepReadiness = calculateSleepReadiness({
    hoursSlept,
    sleepQuality: form.sleepQuality,
    wakeEnergy: form.wakeEnergy,
    stressBeforeBed: form.stressBeforeBed,
  });

  const chartData = history.map((row) => ({
    day: new Date(row.date).toLocaleDateString("en-US", { weekday: "short" }),
    readiness: Number(row.sleep_readiness ?? 0),
    hours: Number(row.hours_slept ?? 0),
    quality: Number(row.sleep_quality ?? 0),
  }));

  const handleSave = async () => {
    if (!supabase || !userId) return;

    setIsSaving(true);
    setError(null);
    setNotice(null);

    const payload = {
      user_id: userId,
      date: today,
      ...formToPayload(form, today),
    };

    const { error: saveError } = await supabase
      .from("sleep_logs")
      .upsert(payload, { onConflict: "user_id,date" });

    if (saveError) {
      setError(saveError.message);
    } else {
      setNotice("Sleep log saved to Supabase.");
      const { data } = await supabase
        .from("sleep_logs")
        .select("*")
        .eq("user_id", userId)
        .eq("date", today)
        .maybeSingle();

      if (data) {
        setForm(rowToForm(data as SleepLogRow));
      }

      const start = new Date();
      start.setDate(start.getDate() - 6);
      const { data: weekRows } = await supabase
        .from("sleep_logs")
        .select("*")
        .eq("user_id", userId)
        .gte("date", toDateKey(start))
        .lte("date", today)
        .order("date", { ascending: true });

      setHistory((weekRows ?? []) as SleepLogRow[]);
    }

    setIsSaving(false);
  };

  const readinessLabel = getStatusLabel(sleepReadiness);
  const weekDebt = history.reduce((sum, row) => sum + Number(row.sleep_debt ?? 0), 0);
  const recoveryTasks =
    sleepReadiness < 6.5
      ? recoveryTodos
      : sleepReadiness < 8
        ? recoveryTodos.slice(0, 2)
        : ["Sleep is on track. Keep the routine steady."];

  return (
    <div className="space-y-6">
      <div className="border-b border-white/[0.06] pb-4">
        <h1 className="text-2xl font-semibold text-[#eaeaea]">Sleep</h1>
        <p className="text-sm text-[#777777] mt-1">
          Track sleep quality, debt, recovery, and whether your body is ready to
          perform.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-surface p-5 flex flex-col items-center">
          <StatusRing score={sleepReadiness} size={120} strokeWidth={6} />
          <div className="mt-4 w-full space-y-2">
            <ScoreBreakdown
              label="Sleep Duration"
              value={Math.min(10, (hoursSlept / 8) * 10)}
              weight={0.4}
            />
            <ScoreBreakdown
              label="Sleep Quality"
              value={form.sleepQuality}
              weight={0.25}
            />
            <ScoreBreakdown label="Wake Energy" value={form.wakeEnergy} weight={0.2} />
            <ScoreBreakdown
              label="Low Stress"
              value={10 - form.stressBeforeBed}
              weight={0.15}
            />
            <div className="mt-2 flex items-center justify-between text-xs text-[#777777]">
              <span>Sleep debt</span>
              <span className={sleepDebt > 0 ? "text-[#ef4444]" : "text-[#22c55e]"}>
                {sleepDebt.toFixed(1)}h
              </span>
            </div>
          </div>
          <div className="mt-3 text-center">
            <span
              className="text-2xl font-bold"
              style={{ color: getStatusColor(sleepReadiness) }}
            >
              {sleepReadiness.toFixed(2)}
            </span>
            <span className="text-sm text-[#777777]"> / 10</span>
          </div>
          <span
            className="mt-1 text-xs px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: `${getStatusColor(sleepReadiness)}20`,
              color: getStatusColor(sleepReadiness),
            }}
          >
            {readinessLabel.toUpperCase()}
          </span>
        </div>

        <div className="card-surface p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-[#eaeaea] mb-4">
            LOG LAST NIGHT&apos;S SLEEP
          </h3>

          {!supabaseConfigured ? (
            <div className="mb-4 rounded border border-[#eab308]/30 bg-[#eab308]/10 px-3 py-2 text-xs text-[#eab308]">
              Supabase env vars are missing. This form stays local until they are
              added.
            </div>
          ) : null}

          {supabaseConfigured && !userId ? (
            <div className="mb-4 rounded border border-[#3b82f6]/30 bg-[#3b82f6]/10 px-3 py-2 text-xs text-[#3b82f6]">
              Supabase is configured, but there is no session yet. Draft mode is
              still available.
            </div>
          ) : null}

          {error ? (
            <div className="mb-4 rounded border border-[#ef4444]/30 bg-[#ef4444]/10 px-3 py-2 text-xs text-[#ef4444]">
              {error}
            </div>
          ) : null}

          {notice ? (
            <div className="mb-4 rounded border border-white/[0.06] bg-[#111111] px-3 py-2 text-xs text-[#777777]">
              {notice}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[#777777] block mb-1">
                Bedtime
              </label>
              <input
                type="time"
                value={form.bedtime}
                onChange={(e) => setForm((p) => ({ ...p, bedtime: e.target.value }))}
                className="input-dark w-full"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[#777777] block mb-1">
                Wake Time
              </label>
              <input
                type="time"
                value={form.wakeTime}
                onChange={(e) => setForm((p) => ({ ...p, wakeTime: e.target.value }))}
                className="input-dark w-full"
              />
            </div>
            <div className="col-span-2">
              <SliderInput
                label="Sleep Quality"
                value={form.sleepQuality}
                onChange={(v) => setForm((p) => ({ ...p, sleepQuality: v }))}
              />
            </div>
            <div className="col-span-2">
              <SliderInput
                label="Wake Energy"
                value={form.wakeEnergy}
                onChange={(v) => setForm((p) => ({ ...p, wakeEnergy: v }))}
              />
            </div>
            <div className="col-span-2">
              <SliderInput
                label="Stress Before Bed"
                value={form.stressBeforeBed}
                onChange={(v) => setForm((p) => ({ ...p, stressBeforeBed: v }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.caffeineAfter3pm}
                onChange={(e) =>
                  setForm((p) => ({ ...p, caffeineAfter3pm: e.target.checked }))
                }
                className="rounded border-white/[0.06] bg-[#1a1a1a]"
              />
              <span className="text-xs text-[#777777]">Caffeine after 3pm</span>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[#777777] block mb-1">
                Nap (min)
              </label>
              <input
                type="number"
                value={form.napMinutes}
                onChange={(e) =>
                  setForm((p) => ({ ...p, napMinutes: Number(e.target.value) }))
                }
                className="input-dark w-full"
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[#777777]">
                Notes
              </label>
              <textarea
                className="input-dark h-24 w-full resize-none"
                placeholder="Anything worth remembering about last night"
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
            <div className="flex items-end">
              <span className="font-mono-data text-xs text-[#777777] pb-2">
                {hoursSlept}h duration
              </span>
            </div>
          </div>

          <button
            onClick={handleSave}
            className="btn-primary mt-4 inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!supabase || !userId || isSaving || isLoading || sessionLoading}
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isSaving ? "Saving..." : "Calculate & Save"}
          </button>
        </div>
      </div>

      <div className="card-surface p-5">
        <h3 className="text-sm font-semibold text-[#eaeaea] mb-4">
          7-DAY TREND
        </h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="day" stroke="#444" fontSize={10} />
              <YAxis domain={[0, 10]} stroke="#444" fontSize={10} />
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
                dot={{ r: 3, fill: "#3b82f6" }}
                name="Readiness"
              />
              <Line
                type="monotone"
                dataKey="hours"
                stroke="#22c55e"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                name="Hours"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-sm text-[#444444]">
            Log sleep data to see trends
          </div>
        )}
        <div className="mt-3 flex items-center justify-between text-xs text-[#777777]">
          <span>7-day debt: {weekDebt.toFixed(1)}h</span>
          <span
            className="font-mono-data"
            style={{ color: weekDebt > 3 ? "#ef4444" : "#22c55e" }}
          >
            {weekDebt > 3 ? "High" : "Manageable"}
          </span>
        </div>
      </div>

      <div className="card-surface p-4">
        <h3 className="text-sm font-semibold text-[#eaeaea] mb-3">
          SLEEP RECOVERY TASKS
        </h3>
        <div className="space-y-2">
          {recoveryTasks.map((task) => (
            <div key={task} className="flex items-center gap-2">
              <Circle size={14} className="text-[#444444] flex-shrink-0" />
              <span className="text-sm text-[#777777]">{task}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card-surface p-4 overflow-x-auto">
        <h3 className="text-sm font-semibold text-[#eaeaea] mb-3">HISTORY</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[#777777] text-left border-b border-white/[0.06]">
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 font-medium">Bedtime</th>
              <th className="pb-2 font-medium">Wake</th>
              <th className="pb-2 font-medium">Hours</th>
              <th className="pb-2 font-medium">Quality</th>
              <th className="pb-2 font-medium">Energy</th>
              <th className="pb-2 font-medium">Stress</th>
              <th className="pb-2 font-medium">Debt</th>
              <th className="pb-2 font-medium">Readiness</th>
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr
                key={row.id}
                className="border-b border-white/[0.04] hover:bg-white/[0.02]"
              >
                <td className="py-2 text-[#eaeaea]">{row.date}</td>
                <td className="py-2 text-[#777777]">{toTimeInputValue(row.bedtime)}</td>
                <td className="py-2 text-[#777777]">{toTimeInputValue(row.wake_time)}</td>
                <td className="py-2 text-[#777777]">
                  {Number(row.hours_slept ?? 0).toFixed(1)}h
                </td>
                <td className="py-2 text-[#777777]">{row.sleep_quality}/10</td>
                <td className="py-2 text-[#777777]">{row.wake_energy}/10</td>
                <td className="py-2 text-[#777777]">{row.stress_before_bed}/10</td>
                <td
                  className="py-2 font-mono-data"
                  style={{ color: Number(row.sleep_debt ?? 0) > 0 ? "#ef4444" : "#22c55e" }}
                >
                  {Number(row.sleep_debt ?? 0).toFixed(1)}h
                </td>
                <td className="py-2">
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-mono-data"
                    style={{
                      backgroundColor: `${getStatusColor(Number(row.sleep_readiness ?? 0))}15`,
                      color: getStatusColor(Number(row.sleep_readiness ?? 0)),
                    }}
                  >
                    {Number(row.sleep_readiness ?? 0).toFixed(1)}
                  </span>
                </td>
              </tr>
            ))}
            {history.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-[#444444]">
                  No sleep logs yet. Log your first night above.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScoreBreakdown({
  label,
  value,
  weight,
}: {
  label: string;
  value: number;
  weight: number;
}) {
  const weighted = Math.round(value * weight * 100) / 100;
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-[#777777]">
        {label}: {value.toFixed(1)} × {weight} = {weighted.toFixed(2)}
      </span>
      <div className="w-16 h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#3b82f6] rounded-full transition-all"
          style={{ width: `${Math.max(0, Math.min(100, (value / 10) * 100))}%` }}
        />
      </div>
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
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] uppercase tracking-wider text-[#777777]">
          {label}
        </label>
        <span className="font-mono-data text-[10px] text-[#3b82f6]">
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
