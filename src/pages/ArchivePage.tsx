import { useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { getStatusColor } from "@/components/StatusRing";
import { SyncBadge } from "@/components/SyncBadge";
import { EmptyStateCard, SegmentedModeTabs } from "@/components/ui-kit";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import {
  deleteDecisionLog,
  fetchAcademicTasks,
  fetchDecisionLogs,
  fetchNutritionLogs,
  fetchProofItems,
  fetchSleepLogs,
  fetchUniversalTasks,
  fetchWorkoutLogs,
  type DecisionLog,
  type LifeeeSyncStatus,
  type ProofItem,
  upsertUniversalTask,
  upsertDecisionLog,
} from "@/lib/lifeee-persistence";
import {
  isArchivedTask,
  isTrashedTask,
  restoreTask,
  type Task,
} from "@/lib/task-system";
import type {
  AcademicTaskRow,
  NutritionLogRow,
  SleepLogRow,
  WorkoutLogRow,
} from "@/lib/supabase-types";
import {
  Moon,
  GraduationCap,
  Dumbbell,
  Apple,
  Briefcase,
  Brain,
  Plus,
  Trash2,
} from "lucide-react";

type DecisionDraft = {
  decision: string;
  reason_chosen: string;
  review_date: string;
  expected_outcome: string;
  actual_outcome: string;
  lesson_learned: string;
  option_input: string;
  options: string[];
};

const emptyDecisionDraft: DecisionDraft = {
  decision: "",
  reason_chosen: "",
  review_date: "",
  expected_outcome: "",
  actual_outcome: "",
  lesson_learned: "",
  option_input: "",
  options: [],
};

type ArchiveData = {
  sleepLogs: SleepLogRow[];
  academicTasks: AcademicTaskRow[];
  workoutLogs: WorkoutLogRow[];
  nutritionLogs: NutritionLogRow[];
  proofItems: ProofItem[];
  archivedTasks: Task[];
};

const emptyArchiveData: ArchiveData = {
  sleepLogs: [],
  academicTasks: [],
  workoutLogs: [],
  nutritionLogs: [],
  proofItems: [],
  archivedTasks: [],
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().split("T")[0] ?? "";
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next.toISOString().split("T")[0] ?? "";
}

export default function ArchivePage() {
  const today = new Date().toISOString().split("T")[0] ?? "";
  const archiveStart = addDays(new Date(), -90);
  const { hasSupabaseConfig, isLoading: sessionLoading, userId } = useSupabaseSession();
  const [archiveData, setArchiveData] = useState<ArchiveData>(emptyArchiveData);
  const [decisionLogs, setDecisionLogs] = useState<DecisionLog[]>([]);
  const [decisionDraft, setDecisionDraft] = useState<DecisionDraft>(emptyDecisionDraft);
  const [syncStatus, setSyncStatus] = useState<LifeeeSyncStatus>("waiting");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [tab, setTab] = useState<"patterns" | "evidence" | "archive">("patterns");
  const outcomesUnlocked =
    !decisionDraft.review_date || decisionDraft.review_date <= today;

  useEffect(() => {
    let active = true;

    const loadArchive = async () => {
      if (sessionLoading) {
        setSyncStatus("loading");
        return;
      }

      if (!hasSupabaseConfig || !userId) {
        setArchiveData(emptyArchiveData);
        setDecisionLogs([]);
        setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
        setSyncError(null);
        return;
      }

      setSyncStatus("loading");
      setSyncError(null);

      try {
        const [
          sleepLogs,
          academicTasks,
          workoutLogs,
          nutritionLogs,
          proofItems,
          universalTasks,
          decisions,
        ] = await Promise.all([
          fetchSleepLogs(userId, archiveStart, today),
          fetchAcademicTasks(userId),
          fetchWorkoutLogs(userId, archiveStart, today),
          fetchNutritionLogs(userId, archiveStart, today),
          fetchProofItems(userId),
          fetchUniversalTasks(userId),
          fetchDecisionLogs(userId),
        ]);
        if (!active) return;
        setArchiveData({
          sleepLogs,
          academicTasks,
          workoutLogs,
          nutritionLogs,
          proofItems,
          archivedTasks: universalTasks.filter((task) => isArchivedTask(task) || isTrashedTask(task)),
        });
        setDecisionLogs(decisions);
        setSyncStatus("saved");
      } catch (error) {
        if (!active) return;
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Could not load Archive from Supabase.");
      }
    };

    void loadArchive();

    return () => {
      active = false;
    };
  }, [archiveStart, hasSupabaseConfig, sessionLoading, today, userId]);

  const saveDecision = async () => {
    if (!decisionDraft.decision.trim()) return;
    if (!hasSupabaseConfig || !userId) {
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
      return;
    }

    setSyncStatus("saving");
    setSyncError(null);

    try {
      const saved = (await upsertDecisionLog(userId, {
        decision: decisionDraft.decision.trim(),
        decision_date: today,
        options_considered: decisionDraft.options,
        reason_chosen: decisionDraft.reason_chosen.trim() || null,
        review_date: decisionDraft.review_date || null,
        expected_outcome: decisionDraft.expected_outcome.trim() || null,
        actual_outcome: outcomesUnlocked ? decisionDraft.actual_outcome.trim() || null : null,
        lesson_learned: outcomesUnlocked ? decisionDraft.lesson_learned.trim() || null : null,
        notes: null,
      })) as DecisionLog;
      setDecisionLogs((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setDecisionDraft(emptyDecisionDraft);
      setSyncStatus("saved");
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Could not save decision.");
    }
  };

  const addDecisionOption = () => {
    const option = decisionDraft.option_input.trim();
    if (!option) return;
    setDecisionDraft((draft) => ({
      ...draft,
      option_input: "",
      options: draft.options.includes(option) ? draft.options : [...draft.options, option],
    }));
  };

  const removeDecision = async (id: string) => {
    if (!userId) {
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
      return;
    }

    setSyncStatus("saving");
    setSyncError(null);

    try {
      await deleteDecisionLog(userId, id);
      setDecisionLogs((current) => current.filter((row) => row.id !== id));
      setSyncStatus("saved");
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Could not delete decision.");
    }
  };

  const restoreArchivedTask = async (task: Task) => {
    if (!hasSupabaseConfig || !userId) {
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
      return;
    }

    setSyncStatus("saving");
    setSyncError(null);
    try {
      const restored = restoreTask(task);
      await upsertUniversalTask(userId, restored, 7);
      setArchiveData((current) => ({
        ...current,
        archivedTasks: current.archivedTasks.filter((item) => item.id !== task.id),
      }));
      setSyncStatus("saved");
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Could not restore task.");
    }
  };

  const sections = [
    {
      title: "Sleep Logs",
      icon: Moon,
      count: archiveData.sleepLogs.length,
      color: "#6b87ae",
      data: archiveData.sleepLogs.map((s) => ({
        label: s.date,
        value: `${Number(s.hours_slept || 0).toFixed(1)}h`,
        score: Number(s.sleep_readiness || 0),
      })),
    },
    {
      title: "Academic Tasks",
      icon: GraduationCap,
      count: archiveData.academicTasks.length,
      color: "#c39a4e",
      data: archiveData.academicTasks.slice(0, 7).map((t) => ({
        label: t.task_name,
        value: `${t.class_name} - ${t.status}`,
        score: Number(t.priority_score || 0),
      })),
    },
    {
      title: "Workouts",
      icon: Dumbbell,
      count: archiveData.workoutLogs.length,
      color: "#6a9a74",
      data: archiveData.workoutLogs.map((w) => ({
        label: w.date,
        value: w.workout_type || "-",
        score: Number(w.training_readiness || 0),
      })),
    },
    {
      title: "Nutrition Logs",
      icon: Apple,
      count: archiveData.nutritionLogs.length,
      color: "#d38a5d",
      data: archiveData.nutritionLogs.map((n) => ({
        label: n.date,
        value: `${n.calories ?? 0} cal`,
        score: n.protein_g ? Math.min(10, (Number(n.protein_g) / 150) * 10) : 0,
      })),
    },
    {
      title: "Career Artifacts",
      icon: Briefcase,
      count: archiveData.proofItems.length,
      color: "#9a7bbd",
      data: archiveData.proofItems.slice(0, 7).map((c) => ({
        label: c.projectName,
        value: `${c.artifactType || "-"} - ${Number(c.hoursWorked || 0)}h`,
        score: Number(c.proofScore || 0),
      })),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-[#ddd4c6] pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[#25313c]">History</h1>
            <p className="text-sm text-[#6f685f] mt-1">
              Patterns, evidence, and things worth remembering.
            </p>
          </div>
          <SyncBadge status={syncStatus} />
        </div>
        {syncError ? <p className="mt-2 text-xs text-destructive">{syncError}</p> : null}
      </div>

      <SegmentedModeTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "patterns", label: "Patterns" },
          { value: "evidence", label: "Evidence" },
          { value: "archive", label: "Archive" },
        ]}
      />

      {tab === "patterns" ? (
      <div className="space-y-6">
      <div className="card-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-[#6b87ae]" />
            <h2 className="text-sm font-semibold text-[#25313c]">Decision Log</h2>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,48rem)_1fr]">
          <div className="max-w-3xl space-y-3">
            <input
              value={decisionDraft.decision}
              onChange={(event) =>
                setDecisionDraft((draft) => ({ ...draft, decision: event.target.value }))
              }
              placeholder="Decision made"
              className="input-dark w-full"
            />
            <div>
              <input
                value={decisionDraft.option_input}
                onChange={(event) =>
                  setDecisionDraft((draft) => ({ ...draft, option_input: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addDecisionOption();
                  }
                }}
                placeholder="Option considered, then press Enter"
                className="input-dark w-full"
              />
              {decisionDraft.options.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {decisionDraft.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() =>
                        setDecisionDraft((draft) => ({
                          ...draft,
                          options: draft.options.filter((item) => item !== option),
                        }))
                      }
                      className="rounded-full border border-[#ddd4c6] bg-white px-2 py-0.5 text-xs text-[#25313c] hover:bg-[#f7f3ec]"
                    >
                      {option} ×
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <input
              value={decisionDraft.reason_chosen}
              onChange={(event) =>
                setDecisionDraft((draft) => ({ ...draft, reason_chosen: event.target.value }))
              }
              placeholder="Why I chose it"
              className="input-dark w-full"
            />
            <textarea
              value={decisionDraft.expected_outcome}
              onChange={(event) =>
                setDecisionDraft((draft) => ({ ...draft, expected_outcome: event.target.value }))
              }
              placeholder="Expected outcome"
              className="input-dark min-h-[80px] w-full"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[10px] uppercase text-[#6f685f]">
                Review date — when to revisit
                <input
                  type="date"
                  value={decisionDraft.review_date}
                  onChange={(event) =>
                    setDecisionDraft((draft) => ({ ...draft, review_date: event.target.value }))
                  }
                  className="input-dark mt-1 w-full"
                />
              </label>
              <div className="flex flex-wrap items-end gap-1">
                {[1, 3, 6].map((months) => (
                  <button
                    key={months}
                    type="button"
                    onClick={() =>
                      setDecisionDraft((draft) => ({
                        ...draft,
                        review_date: addMonths(new Date(), months),
                      }))
                    }
                    className="rounded-md border border-[#ddd4c6] bg-white px-2 py-1.5 text-xs text-[#25313c] hover:bg-[#f7f3ec]"
                  >
                    +{months} Month{months === 1 ? "" : "s"}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-[10px] uppercase text-[#6f685f]">
                Actual outcome
                <textarea
                  value={decisionDraft.actual_outcome}
                  onChange={(event) =>
                    setDecisionDraft((draft) => ({ ...draft, actual_outcome: event.target.value }))
                  }
                  disabled={!outcomesUnlocked}
                  placeholder={outcomesUnlocked ? "What actually happened?" : "Unlocks on review date."}
                  className="input-dark mt-1 min-h-[80px] w-full disabled:opacity-60"
                />
              </label>
              <label className="block text-[10px] uppercase text-[#6f685f]">
                Lesson learned
                <textarea
                  value={decisionDraft.lesson_learned}
                  onChange={(event) =>
                    setDecisionDraft((draft) => ({ ...draft, lesson_learned: event.target.value }))
                  }
                  disabled={!outcomesUnlocked}
                  placeholder={outcomesUnlocked ? "What will you do differently?" : "Unlocks on review date."}
                  className="input-dark mt-1 min-h-[80px] w-full disabled:opacity-60"
                />
              </label>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => void saveDecision()}
                className="btn-primary inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!decisionDraft.decision.trim()}
              >
                <Plus size={14} />
                Add Decision
              </button>
            </div>
          </div>

          <div>
            {decisionLogs.length === 0 ? (
              <EmptyState
                title="No decisions saved yet"
                description="Save a decision to create an audit trail. Draft mode is shown globally when you are logged out."
              />
            ) : (
              <ul className="divide-y divide-[#ddd4c6]">
                {decisionLogs.map((row) => (
                  <li key={row.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-[#9b938a]">
                          Decision made
                        </div>
                        <div className="text-sm font-medium text-[#25313c]">{row.decision}</div>
                        <div className="mt-1 text-xs text-[#6f685f]">
                          {row.decision_date ?? "No date"}
                          {row.review_date ? ` · Review date ${row.review_date}` : ""}
                        </div>
                      </div>
                      <button
                        onClick={() => void removeDecision(row.id)}
                        className="rounded-md p-1 text-[#8c8478] hover:bg-[#f0ebe2] hover:text-destructive"
                        title="Delete decision"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {row.reason_chosen ? (
                      <div className="mt-2 text-xs text-[#25313c]">
                        <span className="text-[10px] uppercase tracking-wider text-[#9b938a]">
                          Why I chose it:{" "}
                        </span>
                        {row.reason_chosen}
                      </div>
                    ) : null}
                    {Array.isArray(row.options_considered) && row.options_considered.length > 0 ? (
                      <div className="mt-1 text-xs text-[#6f685f]">
                        <span className="text-[10px] uppercase tracking-wider text-[#9b938a]">
                          Options:{" "}
                        </span>
                        {row.options_considered.join(", ")}
                      </div>
                    ) : null}
                    {row.expected_outcome || row.notes ? (
                      <div className="mt-1 text-xs text-[#6f685f]">
                        <span className="text-[10px] uppercase tracking-wider text-[#9b938a]">
                          Expected outcome:{" "}
                        </span>
                        {row.expected_outcome ?? row.notes}
                      </div>
                    ) : null}
                    {row.actual_outcome ? (
                      <div className="mt-1 text-xs text-[#6f685f]">
                        <span className="text-[10px] uppercase tracking-wider text-[#9b938a]">
                          Actual outcome:{" "}
                        </span>
                        {row.actual_outcome}
                      </div>
                    ) : null}
                    {row.lesson_learned ? (
                      <div className="mt-1 text-xs text-[#6f685f]">
                        <span className="text-[10px] uppercase tracking-wider text-[#9b938a]">
                          Lesson learned:{" "}
                        </span>
                        {row.lesson_learned}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      </div>
      ) : null}

      {tab === "evidence" ? (
      <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <div key={section.title} className="card-surface p-4 text-center">
              <Icon size={18} style={{ color: section.color }} className="mx-auto mb-2" />
              <div className="text-xl font-bold text-[#25313c]">{section.count}</div>
              <div className="text-[10px] text-[#6f685f]">{section.title}</div>
            </div>
          );
        })}
      </div>

      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.title} className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#25313c] mb-3">{section.title}</h3>
            {section.data && section.data.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[#6f685f] text-left border-b border-[#ddd4c6]">
                      <th className="pb-2 font-medium">Entry</th>
                      <th className="pb-2 font-medium">Details</th>
                      <th className="pb-2 font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.data.map((row, i) => (
                      <tr key={i} className="border-b border-[#e3d8c9]">
                        <td className="py-2 text-[#25313c]">{String(row.label)}</td>
                        <td className="py-2 text-[#6f685f]">{String(row.value)}</td>
                        <td className="py-2">
                          <span
                            className="font-mono-data px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: `${getStatusColor(row.score)}15`,
                              color: getStatusColor(row.score),
                            }}
                          >
                            {row.score.toFixed(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-[#8c8478] py-4 text-center">
                No entries yet. Start logging sleep, tasks, workouts, nutrition, or career proof.
              </div>
            )}
          </div>
        ))}
      </div>
      </div>
      ) : null}

      {tab === "archive" ? (
      <div className="space-y-6">
      <div className="card-surface p-4">
        <h2 className="text-sm font-semibold text-[#25313c] mb-3">Archived / Trashed Tasks</h2>
        {archiveData.archivedTasks.length === 0 ? (
          <div className="text-sm text-[#8c8478] py-4 text-center">
            No archived or trashed universal tasks.
          </div>
        ) : (
          <ul className="divide-y divide-[#ddd4c6]">
            {archiveData.archivedTasks.map((task) => (
              <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono-data rounded border border-[#ddd4c6] bg-white px-1.5 py-0.5 text-[10px] text-[#6f685f]">
                      {task.task_code}
                    </span>
                    <span className="text-sm font-medium text-[#25313c]">{task.title}</span>
                    <span className="text-[10px] uppercase tracking-wider text-[#8c8478]">
                      {isTrashedTask(task) ? "trashed" : "archived"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-[#6f685f]">
                    {task.task_type} · previous {task.previous_status ?? "inbox"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void restoreArchivedTask(task)}
                  className="rounded-md border border-[#ddd4c6] bg-white px-3 py-1.5 text-xs text-[#25313c] hover:bg-[#f7f3ec]"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <EmptyStateCard
        missing="Old logs archive is not wired yet."
        nextAction="Archived daily logs and snapshots will collect here over time."
        why="Keeps long-term records out of the active modules without losing them."
      />
      </div>
      ) : null}
    </div>
  );
}
