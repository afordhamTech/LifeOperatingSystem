import { useMemo, useRef, useState } from "react";
import { CheckCircle2, ClipboardCheck, Loader2 } from "lucide-react";
import {
  type DecisionLog,
  type LifeeeSyncStatus,
  getSyncLabel,
  getSyncTone,
  upsertDecisionLog,
} from "@/lib/lifeee-persistence";
import { splitDecisionsByReview } from "@/lib/decision-log-summary";

export type DecisionsDueReviewPanelProps = {
  today: string;
  weekStart: string;
  weekEnd: string;
  decisions: DecisionLog[];
  userId: string | null;
  hasSupabaseConfig: boolean;
  sessionLoading: boolean;
  remoteLoaded: boolean;
  onDecisionReviewed: (decision: DecisionLog) => void;
};

export default function DecisionsDueReviewPanel({
  today,
  weekStart,
  weekEnd,
  decisions,
  userId,
  hasSupabaseConfig,
  sessionLoading,
  remoteLoaded,
  onDecisionReviewed,
}: DecisionsDueReviewPanelProps) {
  const buckets = useMemo(
    () => splitDecisionsByReview(decisions, today, weekStart, weekEnd),
    [decisions, today, weekStart, weekEnd],
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [syncStatus, setSyncStatus] = useState<LifeeeSyncStatus>("local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const seqRef = useRef(0);

  const visibleStatus: LifeeeSyncStatus = sessionLoading
    ? "loading"
    : !hasSupabaseConfig
      ? "local"
      : !userId
        ? "waiting"
        : syncStatus;

  const updateDraft = (id: string, value: string) =>
    setDrafts((current) => ({ ...current, [id]: value }));

  const markReviewed = async (decision: DecisionLog) => {
    const draft = (drafts[decision.id] ?? "").trim();
    if (!draft) return;
    if (savingIds.has(decision.id)) return;
    if (!hasSupabaseConfig) {
      setSyncStatus("local");
      return;
    }
    if (!userId || !remoteLoaded) {
      setSyncStatus("waiting");
      return;
    }

    const seq = seqRef.current + 1;
    seqRef.current = seq;
    setSavingIds((current) => {
      const next = new Set(current);
      next.add(decision.id);
      return next;
    });
    setSyncStatus("saving");
    setSyncError(null);

    try {
      const saved = await upsertDecisionLog(userId, {
        id: decision.id,
        decision: decision.decision,
        decision_date: decision.decision_date ?? null,
        reason_chosen: decision.reason_chosen ?? null,
        expected_outcome: decision.expected_outcome ?? null,
        review_date: decision.review_date ?? null,
        result_later: draft,
        notes: decision.notes ?? null,
      });
      if (seqRef.current !== seq) return;
      if (saved) {
        onDecisionReviewed(saved as DecisionLog);
      } else {
        onDecisionReviewed({
          ...decision,
          result_later: draft,
          updated_at: new Date().toISOString(),
        });
      }
      setSyncStatus("saved");
      setDrafts((current) => {
        const next = { ...current };
        delete next[decision.id];
        return next;
      });
    } catch (error) {
      if (seqRef.current !== seq) return;
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Decision review save failed.");
    } finally {
      setSavingIds((current) => {
        const next = new Set(current);
        next.delete(decision.id);
        return next;
      });
    }
  };

  return (
    <section className="card-surface p-4 space-y-3 border-l-2 border-[#c39a4e]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={14} className="text-[#c39a4e]" />
          <h2 className="text-sm font-semibold text-[#25313c] uppercase tracking-wider">
            Decisions Due Review
          </h2>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-wider font-semibold ${getSyncTone(
            visibleStatus,
          )}`}
          title={syncError ?? undefined}
        >
          {getSyncLabel(visibleStatus)}
        </span>
      </div>
      <p className="text-xs text-[#6f685f]">
        Decisions whose review_date is today or past. Record a short result_later
        to close the loop; it persists to decision_logs.
      </p>

      {buckets.dueForReview.length === 0 ? (
        <div className="text-xs text-[#9b938a]">Nothing due for review.</div>
      ) : (
        <ul className="space-y-2">
          {buckets.dueForReview.map((decision) => {
            const draft = drafts[decision.id] ?? "";
            const saving = savingIds.has(decision.id);
            const overdue = (decision.review_date ?? "") < today;
            return (
              <li
                key={decision.id}
                className="rounded-md border border-[#ece5da] bg-white/80 p-3 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-[#25313c]">{decision.decision}</span>
                  {decision.review_date ? (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        overdue
                          ? "border-rose-200 bg-rose-100 text-rose-700"
                          : "border-amber-200 bg-amber-100 text-amber-700"
                      }`}
                    >
                      Review {decision.review_date}
                    </span>
                  ) : null}
                </div>
                {decision.reason_chosen ? (
                  <div className="text-[11px] text-[#6f685f]">
                    Why: {decision.reason_chosen}
                  </div>
                ) : null}
                {decision.expected_outcome ? (
                  <div className="text-[11px] text-[#6f685f]">
                    Expected: {decision.expected_outcome}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={draft}
                    onChange={(event) => updateDraft(decision.id, event.target.value)}
                    placeholder="What actually happened? (result_later)"
                    className="flex-1 min-w-[200px] rounded-md border border-[#ddd4c6] bg-white px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void markReviewed(decision)}
                    disabled={saving || !draft.trim()}
                    className="inline-flex items-center gap-2 rounded-md bg-[#25313c] px-3 py-2 text-sm text-white hover:bg-[#3a4754] disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Mark reviewed
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
