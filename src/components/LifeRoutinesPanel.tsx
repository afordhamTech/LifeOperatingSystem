import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LIFE_ROUTINE_TEMPLATES,
  getMissingRoutineTasks,
  summarizeRoutineSeedStatus,
  type RoutineSeedStatus,
  type RoutineTemplate,
} from "@/lib/routine-system";
import {
  createRoutineInstance,
  fetchActiveRoutineInstance,
  fetchUniversalTasksByRoutineTemplate,
  pauseRoutineInstance,
  upsertUniversalTask,
  type UserRoutineInstance,
} from "@/lib/lifeee-persistence";
import { makeTask, type Task } from "@/lib/task-system";

type Props = {
  userId: string | null;
  hasSupabaseConfig: boolean;
  sessionLoading: boolean;
};

type CardState = {
  instance: UserRoutineInstance | null;
  tasks: Task[];
  status: RoutineSeedStatus;
  loading: boolean;
  busy: boolean;
  message: string | null;
  error: string | null;
};

const TEMPLATES = LIFE_ROUTINE_TEMPLATES.filter((t) => t.domain !== "MCAT");

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function cadenceLabel(cadence: RoutineTemplate["cadence"]) {
  switch (cadence) {
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "weekdays":
      return "Mon–Fri";
    case "five_x_week":
      return "5×/week";
    case "four_x_week":
      return "4×/week";
  }
}

function emptyStatus(template: RoutineTemplate): RoutineSeedStatus {
  return {
    template_key: template.template_key,
    domain: template.domain,
    cadence: template.cadence,
    generated_count: 0,
    expected_count: 0,
    missing_count: 0,
    completed_count: 0,
    next_occurrence_date: null,
    horizon_end: todayKey(),
  };
}

export function LifeRoutinesPanel({ userId, hasSupabaseConfig, sessionLoading }: Props) {
  const [cards, setCards] = useState<Record<string, CardState>>(() => {
    const initial: Record<string, CardState> = {};
    for (const tpl of TEMPLATES) {
      initial[tpl.template_key] = {
        instance: null,
        tasks: [],
        status: emptyStatus(tpl),
        loading: true,
        busy: false,
        message: null,
        error: null,
      };
    }
    return initial;
  });

  const loggedIn = Boolean(hasSupabaseConfig && userId);

  const loadCard = useCallback(
    async (tpl: RoutineTemplate) => {
      if (!loggedIn || !userId) {
        setCards((prev) => ({
          ...prev,
          [tpl.template_key]: {
            ...prev[tpl.template_key],
            loading: false,
            status: emptyStatus(tpl),
          },
        }));
        return;
      }
      try {
        const [instance, tasks] = await Promise.all([
          fetchActiveRoutineInstance({ userId, templateKey: tpl.template_key }),
          fetchUniversalTasksByRoutineTemplate({ userId, templateKey: tpl.template_key }),
        ]);
        const startDate = instance?.start_date ?? todayKey();
        const status = summarizeRoutineSeedStatus(tpl, tasks, startDate, { today: todayKey() });
        setCards((prev) => ({
          ...prev,
          [tpl.template_key]: {
            ...prev[tpl.template_key],
            instance,
            tasks,
            status,
            loading: false,
            error: null,
          },
        }));
      } catch (err) {
        setCards((prev) => ({
          ...prev,
          [tpl.template_key]: {
            ...prev[tpl.template_key],
            loading: false,
            error: err instanceof Error ? err.message : "Failed to load",
          },
        }));
      }
    },
    [loggedIn, userId],
  );

  useEffect(() => {
    if (sessionLoading) return;
    for (const tpl of TEMPLATES) {
      void loadCard(tpl);
    }
  }, [sessionLoading, loadCard]);

  const handleActivate = useCallback(
    async (tpl: RoutineTemplate) => {
      if (!loggedIn || !userId) return;
      setCards((prev) => ({
        ...prev,
        [tpl.template_key]: { ...prev[tpl.template_key], busy: true, message: null, error: null },
      }));
      try {
        const today = todayKey();
        const instance = await createRoutineInstance({
          userId,
          templateKey: tpl.template_key,
          name: tpl.name,
          domain: tpl.domain,
          cadence: tpl.cadence,
          startDate: today,
          preferredDays: tpl.preferred_weekdays ?? null,
          preferredTime: null,
          estimatedMinutes: tpl.estimated_minutes,
        });
        const missing = getMissingRoutineTasks(tpl, [], today, {
          today,
          instance: { id: instance.id, preferred_time: instance.preferred_time },
        });
        let generated = 0;
        for (const payload of missing) {
          const task = makeTask({ ...payload, routine_instance_id: instance.id });
          await upsertUniversalTask(userId, task, 5);
          generated += 1;
        }
        setCards((prev) => ({
          ...prev,
          [tpl.template_key]: {
            ...prev[tpl.template_key],
            busy: false,
            message:
              generated > 0
                ? `Generated ${generated} task${generated === 1 ? "" : "s"}.`
                : "All routine tasks already generated.",
          },
        }));
        await loadCard(tpl);
      } catch (err) {
        setCards((prev) => ({
          ...prev,
          [tpl.template_key]: {
            ...prev[tpl.template_key],
            busy: false,
            error: err instanceof Error ? err.message : "Activate failed",
          },
        }));
      }
    },
    [loggedIn, userId, loadCard],
  );

  const handleGenerateMissing = useCallback(
    async (tpl: RoutineTemplate) => {
      if (!loggedIn || !userId) return;
      const card = cards[tpl.template_key];
      const instance = card?.instance;
      if (!instance) return;
      setCards((prev) => ({
        ...prev,
        [tpl.template_key]: { ...prev[tpl.template_key], busy: true, message: null, error: null },
      }));
      try {
        const tasks = await fetchUniversalTasksByRoutineTemplate({
          userId,
          templateKey: tpl.template_key,
        });
        const missing = getMissingRoutineTasks(tpl, tasks, instance.start_date, {
          today: todayKey(),
          instance: { id: instance.id, preferred_time: instance.preferred_time },
        });
        for (const payload of missing) {
          const task = makeTask({ ...payload, routine_instance_id: instance.id });
          await upsertUniversalTask(userId, task, 5);
        }
        setCards((prev) => ({
          ...prev,
          [tpl.template_key]: {
            ...prev[tpl.template_key],
            busy: false,
            message:
              missing.length > 0
                ? `Generated ${missing.length} task${missing.length === 1 ? "" : "s"}.`
                : "All routine tasks already generated.",
          },
        }));
        await loadCard(tpl);
      } catch (err) {
        setCards((prev) => ({
          ...prev,
          [tpl.template_key]: {
            ...prev[tpl.template_key],
            busy: false,
            error: err instanceof Error ? err.message : "Generate failed",
          },
        }));
      }
    },
    [loggedIn, userId, cards, loadCard],
  );

  const handlePause = useCallback(
    async (tpl: RoutineTemplate) => {
      const card = cards[tpl.template_key];
      const instance = card?.instance;
      if (!instance) return;
      setCards((prev) => ({
        ...prev,
        [tpl.template_key]: { ...prev[tpl.template_key], busy: true, message: null, error: null },
      }));
      try {
        await pauseRoutineInstance(instance.id);
        setCards((prev) => ({
          ...prev,
          [tpl.template_key]: { ...prev[tpl.template_key], busy: false, message: "Paused." },
        }));
        await loadCard(tpl);
      } catch (err) {
        setCards((prev) => ({
          ...prev,
          [tpl.template_key]: {
            ...prev[tpl.template_key],
            busy: false,
            error: err instanceof Error ? err.message : "Pause failed",
          },
        }));
      }
    },
    [cards, loadCard],
  );

  const grid = useMemo(() => TEMPLATES, []);

  return (
    <div className="space-y-3">
      {!loggedIn ? (
        <p className="text-xs text-muted-foreground">
          Log in to activate routines. Cards below are previews of the available templates.
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {grid.map((tpl) => {
          const card = cards[tpl.template_key];
          const isActive = Boolean(card?.instance && card.instance.status === "active");
          return (
            <div key={tpl.template_key} className="card-surface space-y-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{tpl.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {tpl.domain} · {cadenceLabel(tpl.cadence)} · {tpl.estimated_minutes}m
                  </div>
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                    isActive
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                      : "border-border bg-muted/40 text-muted-foreground"
                  }`}
                >
                  {isActive ? "Active" : "Inactive"}
                </span>
              </div>
              {tpl.optional ? (
                <p className="text-xs text-muted-foreground">
                  Weekly training planning only. Fixed workout sessions are not auto-seeded —
                  pick training days based on readiness.
                </p>
              ) : null}
              <div className="text-xs text-muted-foreground">
                {card?.loading
                  ? "Loading…"
                  : `${card?.status.generated_count ?? 0} / ${card?.status.expected_count ?? 0} generated`}
                {card?.status.next_occurrence_date
                  ? ` · next ${card.status.next_occurrence_date}`
                  : ""}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  className="rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                  disabled={!loggedIn || card?.busy || isActive}
                  onClick={() => void handleActivate(tpl)}
                >
                  Activate
                </button>
                <button
                  type="button"
                  className="rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                  disabled={!loggedIn || card?.busy || !isActive}
                  onClick={() => void handleGenerateMissing(tpl)}
                >
                  Generate Missing
                </button>
                <button
                  type="button"
                  className="rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                  disabled={!loggedIn || card?.busy || !isActive}
                  onClick={() => void handlePause(tpl)}
                >
                  Pause
                </button>
              </div>
              {card?.message ? (
                <p className="text-xs text-emerald-700">{card.message}</p>
              ) : null}
              {card?.error ? <p className="text-xs text-destructive">{card.error}</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default LifeRoutinesPanel;
