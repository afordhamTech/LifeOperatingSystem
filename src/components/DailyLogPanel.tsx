import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  CloudOff,
  Loader2,
  Save,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { DailyLogRow } from "@/lib/supabase-types";
import { toDateKey } from "@/lib/date-helpers";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";

type DailyLogForm = {
  mustDo: string;
  shouldDo1: string;
  shouldDo2: string;
  maintenance: string;
  energy: number;
  mood: number;
  notes: string;
};

const defaultForm: DailyLogForm = {
  mustDo: "",
  shouldDo1: "",
  shouldDo2: "",
  maintenance: "",
  energy: 7,
  mood: 7,
  notes: "",
};

const migrationTodos = [
  "Auth: replace the current Kimi flow with Supabase Auth or a server-side bridge.",
  "Modules: wire sleep, academics, workout, nutrition, and weekly reviews next.",
  "Backend: remove the MySQL/Drizzle placeholder layer after the Supabase routes land.",
];

function rowToForm(
  row: Pick<
    DailyLogRow,
    | "must_do"
    | "should_do_1"
    | "should_do_2"
    | "maintenance"
    | "energy"
    | "mood"
    | "notes"
  >,
): DailyLogForm {
  return {
    mustDo: row.must_do ?? "",
    shouldDo1: row.should_do_1 ?? "",
    shouldDo2: row.should_do_2 ?? "",
    maintenance: row.maintenance ?? "",
    energy: row.energy ?? 7,
    mood: row.mood ?? 7,
    notes: row.notes ?? "",
  };
}

function formToPayload(form: DailyLogForm) {
  return {
    must_do: form.mustDo.trim() || null,
    should_do_1: form.shouldDo1.trim() || null,
    should_do_2: form.shouldDo2.trim() || null,
    maintenance: form.maintenance.trim() || null,
    energy: form.energy,
    mood: form.mood,
    notes: form.notes.trim() || null,
  };
}

export default function DailyLogPanel() {
  const today = useMemo(() => toDateKey(), []);
  const { hasSupabaseConfig: supabaseConfigured, isLoading: sessionLoading, userId } =
    useSupabaseSession();
  const [form, setForm] = useState<DailyLogForm>(defaultForm);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canPersist = supabaseConfigured && Boolean(userId);

  useEffect(() => {
    let active = true;

    const loadDailyLog = async () => {
      if (!supabase) {
        if (active) {
          setIsLoading(false);
          setNotice("Supabase env vars are missing. Using local draft mode.");
        }
        return;
      }

      if (!userId) {
        if (active) {
          setIsLoading(false);
          setForm(defaultForm);
          setNotice("Sign in with Supabase later to sync this log.");
        }
        return;
      }

      setIsLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from("daily_logs")
        .select(
          "must_do,should_do_1,should_do_2,maintenance,energy,mood,notes",
        )
        .eq("user_id", userId)
        .eq("date", today)
        .maybeSingle();

      if (!active) return;

      if (queryError) {
        setError(queryError.message);
        setForm(defaultForm);
      } else if (data) {
        setForm(
          rowToForm(
            data as Pick<
              DailyLogRow,
              | "must_do"
              | "should_do_1"
              | "should_do_2"
              | "maintenance"
              | "energy"
              | "mood"
              | "notes"
            >,
          ),
        );
        setNotice("Loaded from Supabase.");
      } else {
        setForm(defaultForm);
      }

      setIsLoading(false);
    };

    void loadDailyLog();

    return () => {
      active = false;
    };
  }, [supabaseConfigured, today, userId]);

  const updateField = <K extends keyof DailyLogForm>(
    key: K,
    value: DailyLogForm[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveLog = async () => {
    if (!supabase || !userId) return;

    setIsSaving(true);
    setError(null);
    setNotice(null);

    const payload = {
      user_id: userId,
      date: today,
      ...formToPayload(form),
    };

    const { data, error: saveError } = await supabase
      .from("daily_logs")
      .upsert(payload, { onConflict: "user_id,date" })
      .select(
        "must_do,should_do_1,should_do_2,maintenance,energy,mood,notes",
      )
      .maybeSingle();

    if (saveError) {
      setError(saveError.message);
    } else if (data) {
      setForm(
        rowToForm(
          data as Pick<
            DailyLogRow,
            | "must_do"
            | "should_do_1"
            | "should_do_2"
            | "maintenance"
            | "energy"
            | "mood"
            | "notes"
          >,
        ),
      );
      setNotice("Daily log saved to Supabase.");
    } else {
      setNotice("Daily log saved.");
    }

    setIsSaving(false);
  };

  const statusLabel = canPersist
    ? "Supabase-backed"
    : supabaseConfigured
      ? "Waiting for auth"
      : "Local draft mode";

  return (
    <div className="card-surface p-4 mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[#9a7bbd]" />
            <span className="text-sm font-semibold text-[#25313c]">
              Daily Log
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#ece5da] text-[#6f685f] uppercase tracking-wider">
              {statusLabel}
            </span>
          </div>
          <p className="text-xs text-[#6f685f] mt-1">
            Capture the plan for today. This is the first Supabase-backed page
            in the migration.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#6f685f]">
          <CalendarDays size={14} />
          <span>{today}</span>
        </div>
      </div>

      {sessionLoading ? (
        <div className="flex items-center gap-2 text-sm text-[#6f685f]">
          <Loader2 size={14} className="animate-spin" />
          Checking Supabase session...
        </div>
      ) : null}

      {!supabaseConfigured ? (
        <div className="flex items-start gap-2 rounded border border-[#c39a4e]/30 bg-[#c39a4e]/10 px-3 py-2 text-xs text-[#c39a4e]">
          <CloudOff size={14} className="mt-0.5" />
          <span>
            Supabase env vars are missing. The form still works locally, but
            saving to the database is disabled.
          </span>
        </div>
      ) : null}

      {supabaseConfigured && !userId ? (
        <div className="flex items-start gap-2 rounded border border-[#6b87ae]/30 bg-[#6b87ae]/10 px-3 py-2 text-xs text-[#6b87ae]">
          <ShieldAlert size={14} className="mt-0.5" />
          <span>
            No Supabase session yet. You can still draft the log here, and it
            will be ready to sync after auth is connected.
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded border border-[#c97a73]/30 bg-[#c97a73]/10 px-3 py-2 text-xs text-[#c97a73]">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded border border-[#ddd4c6] bg-[#f0ebe2] px-3 py-2 text-xs text-[#6f685f]">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field
              label="Must do"
              value={form.mustDo}
              onChange={(value) => updateField("mustDo", value)}
              placeholder="The one thing that matters today"
              className="md:col-span-2"
            />
            <Field
              label="Should do 1"
              value={form.shouldDo1}
              onChange={(value) => updateField("shouldDo1", value)}
              placeholder="Secondary priority"
            />
            <Field
              label="Should do 2"
              value={form.shouldDo2}
              onChange={(value) => updateField("shouldDo2", value)}
              placeholder="Second secondary priority"
            />
            <Field
              label="Maintenance"
              value={form.maintenance}
              onChange={(value) => updateField("maintenance", value)}
              placeholder="Sleep, admin, reset, repeat"
              className="md:col-span-2"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <SliderField
              label="Energy"
              value={form.energy}
              onChange={(value) => updateField("energy", value)}
            />
            <SliderField
              label="Mood"
              value={form.mood}
              onChange={(value) => updateField("mood", value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[#6f685f]">
              Notes
            </label>
            <textarea
              className="input-dark h-24 w-full resize-none"
              placeholder="Anything worth remembering about today"
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={saveLog}
              disabled={!canPersist || isSaving || isLoading}
            >
              {isSaving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              Save Daily Log
            </button>
            <span className="text-xs text-[#6f685f]">
              {canPersist
                ? "RLS will scope this row to the signed-in Supabase user."
                : "Saving is disabled until Supabase auth is connected."}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded border border-[#ddd4c6] bg-[#f8f4ed] p-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[#6f685f]">
              <CheckCircle2 size={12} className="text-[#6a9a74]" />
              Snapshot
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <SummaryLine label="Must do" value={form.mustDo || "Unset"} />
              <SummaryLine
                label="Should do 1"
                value={form.shouldDo1 || "Unset"}
              />
              <SummaryLine
                label="Should do 2"
                value={form.shouldDo2 || "Unset"}
              />
              <SummaryLine
                label="Maintenance"
                value={form.maintenance || "Unset"}
              />
              <SummaryLine label="Energy" value={`${form.energy}/10`} />
              <SummaryLine label="Mood" value={`${form.mood}/10`} />
            </div>
          </div>

          <div className="rounded border border-[#ddd4c6] bg-[#f8f4ed] p-3">
            <div className="text-xs font-medium uppercase tracking-wider text-[#6f685f]">
              Migration TODO
            </div>
            <ul className="mt-2 space-y-1 text-xs text-[#6f685f]">
              {migrationTodos.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[#6f685f]">
        {label}
      </label>
      <input
        className="input-dark w-full"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function SliderField({
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
      <div className="mb-1 flex items-center justify-between">
        <label className="text-[10px] font-medium uppercase tracking-wider text-[#6f685f]">
          {label}
        </label>
        <span className="font-mono-data text-[10px] text-[#6b87ae]">
          {value}/10
        </span>
      </div>
      <input
        className="slider-dark"
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function SummaryLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs uppercase tracking-wider text-[#6f685f]">
        {label}
      </span>
      <span className="text-right text-xs text-[#25313c]">{value}</span>
    </div>
  );
}
