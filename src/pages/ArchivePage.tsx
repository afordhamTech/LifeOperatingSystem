import { useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import { EmptyState } from "@/components/EmptyState";
import { getStatusColor } from "@/components/StatusRing";
import { SyncBadge } from "@/components/SyncBadge";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import {
  deleteDecisionLog,
  fetchDecisionLogs,
  type DecisionLog,
  type LifeeeSyncStatus,
  upsertDecisionLog,
} from "@/lib/lifeee-persistence";
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
  notes: string;
  options_text: string;
};

const emptyDecisionDraft: DecisionDraft = {
  decision: "",
  reason_chosen: "",
  review_date: "",
  notes: "",
  options_text: "",
};

export default function ArchivePage() {
  const today = new Date().toISOString().split("T")[0];
  const { hasSupabaseConfig, isLoading: sessionLoading, userId } = useSupabaseSession();
  const [decisionLogs, setDecisionLogs] = useState<DecisionLog[]>([]);
  const [decisionDraft, setDecisionDraft] = useState<DecisionDraft>(emptyDecisionDraft);
  const [decisionSyncStatus, setDecisionSyncStatus] = useState<LifeeeSyncStatus>("waiting");
  const [decisionSyncError, setDecisionSyncError] = useState<string | null>(null);

  const { data: sleepLogs } = trpc.sleep.getWeek.useQuery({ endDate: today });
  const { data: tasks } = trpc.academics.list.useQuery({});
  const { data: workoutLogs } = trpc.workout.getWeek.useQuery({ endDate: today });
  const { data: nutritionLogs } = trpc.nutrition.getWeek.useQuery({ endDate: today });
  const { data: careerItems } = trpc.career.list.useQuery();

  useEffect(() => {
    let active = true;

    const loadDecisions = async () => {
      if (sessionLoading) {
        setDecisionSyncStatus("loading");
        return;
      }

      if (!hasSupabaseConfig || !userId) {
        setDecisionLogs([]);
        setDecisionSyncStatus(hasSupabaseConfig ? "waiting" : "local");
        setDecisionSyncError(null);
        return;
      }

      setDecisionSyncStatus("loading");
      setDecisionSyncError(null);

      try {
        const rows = await fetchDecisionLogs(userId);
        if (!active) return;
        setDecisionLogs(rows);
        setDecisionSyncStatus("saved");
      } catch (error) {
        if (!active) return;
        setDecisionSyncStatus("error");
        setDecisionSyncError(error instanceof Error ? error.message : "Could not load decisions.");
      }
    };

    void loadDecisions();

    return () => {
      active = false;
    };
  }, [hasSupabaseConfig, sessionLoading, userId]);

  const saveDecision = async () => {
    if (!decisionDraft.decision.trim()) return;
    if (!hasSupabaseConfig || !userId) {
      setDecisionSyncStatus(hasSupabaseConfig ? "waiting" : "local");
      return;
    }

    setDecisionSyncStatus("saving");
    setDecisionSyncError(null);

    try {
      const saved = (await upsertDecisionLog(userId, {
        decision: decisionDraft.decision.trim(),
        decision_date: today,
        options_considered: decisionDraft.options_text
          .split(/\n/)
          .map((option) => option.trim())
          .filter(Boolean),
        reason_chosen: decisionDraft.reason_chosen.trim() || null,
        review_date: decisionDraft.review_date || null,
        notes: decisionDraft.notes.trim() || null,
      })) as DecisionLog;
      setDecisionLogs((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setDecisionDraft(emptyDecisionDraft);
      setDecisionSyncStatus("saved");
    } catch (error) {
      setDecisionSyncStatus("error");
      setDecisionSyncError(error instanceof Error ? error.message : "Could not save decision.");
    }
  };

  const removeDecision = async (id: string) => {
    if (!userId) {
      setDecisionSyncStatus(hasSupabaseConfig ? "waiting" : "local");
      return;
    }

    setDecisionSyncStatus("saving");
    setDecisionSyncError(null);

    try {
      await deleteDecisionLog(userId, id);
      setDecisionLogs((current) => current.filter((row) => row.id !== id));
      setDecisionSyncStatus("saved");
    } catch (error) {
      setDecisionSyncStatus("error");
      setDecisionSyncError(error instanceof Error ? error.message : "Could not delete decision.");
    }
  };

  const sections = [
    {
      title: "Sleep Logs",
      icon: Moon,
      count: sleepLogs?.length ?? 0,
      color: "#6b87ae",
      data: sleepLogs?.map((s) => ({
        label: s.date,
        value: `${Number(s.hoursSlept || 0).toFixed(1)}h`,
        score: Number(s.readinessScore || 0),
      })),
    },
    {
      title: "Academic Tasks",
      icon: GraduationCap,
      count: tasks?.length ?? 0,
      color: "#c39a4e",
      data: tasks?.slice(0, 7).map((t) => ({
        label: t.taskName.slice(0, 20),
        value: t.className,
        score: Number(t.priorityScore || 0),
      })),
    },
    {
      title: "Workouts",
      icon: Dumbbell,
      count: workoutLogs?.length ?? 0,
      color: "#6a9a74",
      data: workoutLogs?.map((w) => ({
        label: w.date,
        value: w.workoutType || "-",
        score: Number(w.readinessScore || 0),
      })),
    },
    {
      title: "Nutrition Logs",
      icon: Apple,
      count: nutritionLogs?.length ?? 0,
      color: "#d38a5d",
      data: nutritionLogs?.map((n) => ({
        label: n.date,
        value: `${n.caloriesEaten ?? 0} cal`,
        score: n.protein ? Math.min(10, (n.protein / 150) * 10) : 0,
      })),
    },
    {
      title: "Career Artifacts",
      icon: Briefcase,
      count: careerItems?.length ?? 0,
      color: "#9a7bbd",
      data: careerItems?.slice(0, 7).map((c) => ({
        label: c.projectName.slice(0, 20),
        value: c.artifactType || "-",
        score: Number(c.proofScore || 0),
      })),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-[#ddd4c6] pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[#25313c]">Archive</h1>
            <p className="text-sm text-[#6f685f] mt-1">
              Historical data from all life modules. Browse and review past entries.
            </p>
          </div>
          <SyncBadge status={decisionSyncStatus} />
        </div>
        {decisionSyncError ? <p className="mt-2 text-xs text-destructive">{decisionSyncError}</p> : null}
      </div>

      <div className="card-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-[#6b87ae]" />
            <h2 className="text-sm font-semibold text-[#25313c]">Decision Log</h2>
          </div>
          <span className="text-xs text-[#6f685f]">Writes to decision_logs</span>
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-2">
            <input
              value={decisionDraft.decision}
              onChange={(event) =>
                setDecisionDraft((draft) => ({ ...draft, decision: event.target.value }))
              }
              placeholder="Decision"
              className="input-dark w-full"
            />
            <textarea
              value={decisionDraft.options_text}
              onChange={(event) =>
                setDecisionDraft((draft) => ({ ...draft, options_text: event.target.value }))
              }
              placeholder="Options considered, one per line"
              className="input-dark min-h-[80px] w-full"
            />
            <input
              value={decisionDraft.reason_chosen}
              onChange={(event) =>
                setDecisionDraft((draft) => ({ ...draft, reason_chosen: event.target.value }))
              }
              placeholder="Reason chosen"
              className="input-dark w-full"
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] uppercase text-[#6f685f]">
                Review date
                <input
                  type="date"
                  value={decisionDraft.review_date}
                  onChange={(event) =>
                    setDecisionDraft((draft) => ({ ...draft, review_date: event.target.value }))
                  }
                  className="input-dark mt-1 w-full"
                />
              </label>
              <button
                onClick={() => void saveDecision()}
                className="btn-primary mt-4 inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!decisionDraft.decision.trim()}
              >
                <Plus size={14} />
                Add Decision
              </button>
            </div>
            <textarea
              value={decisionDraft.notes}
              onChange={(event) =>
                setDecisionDraft((draft) => ({ ...draft, notes: event.target.value }))
              }
              placeholder="Notes"
              className="input-dark min-h-[80px] w-full"
            />
          </div>

          <div>
            {decisionLogs.length === 0 ? (
              <EmptyState
                title={userId ? "No decisions saved yet" : "Waiting for login"}
                description={
                  userId
                    ? "Save a decision to create an audit trail."
                    : "Decision logs are Supabase-only in this implementation."
                }
              />
            ) : (
              <ul className="divide-y divide-[#ddd4c6]">
                {decisionLogs.map((row) => (
                  <li key={row.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-[#25313c]">{row.decision}</div>
                        <div className="mt-1 text-xs text-[#6f685f]">
                          {row.decision_date ?? "No date"}
                          {row.review_date ? ` - review ${row.review_date}` : ""}
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
                      <div className="mt-2 text-xs text-[#25313c]">{row.reason_chosen}</div>
                    ) : null}
                    {row.notes ? <div className="mt-1 text-xs text-[#6f685f]">{row.notes}</div> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

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
  );
}
