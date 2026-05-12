import { useRef, useState } from "react";
import { BookmarkCheck, ClipboardList, Plus } from "lucide-react";
import {
  type DecisionLog,
  type DecisionLogPayload,
  type LifeeeSyncStatus,
  createLifeeeId,
  getSyncLabel,
  getSyncTone,
  upsertDecisionLog,
} from "@/lib/lifeee-persistence";
import { classifyReviewDate } from "@/lib/decision-log-summary";

export type DecisionLogCardProps = {
  today: string;
  decisions: DecisionLog[];
  userId: string | null;
  hasSupabaseConfig: boolean;
  sessionLoading: boolean;
  remoteLoaded: boolean;
  onDecisionSaved: (decision: DecisionLog) => void;
};

type DecisionDraft = {
  decision: string;
  reason_chosen: string;
  expected_outcome: string;
  review_date: string;
};

const EMPTY_DRAFT: DecisionDraft = {
  decision: "",
  reason_chosen: "",
  expected_outcome: "",
  review_date: "",
};

export default function DecisionLogCard({
  today,
  decisions,
  userId,
  hasSupabaseConfig,
  sessionLoading,
  remoteLoaded,
  onDecisionSaved,
}: DecisionLogCardProps) {
  const [draft, setDraft] = useState<DecisionDraft>(EMPTY_DRAFT);
  const [syncStatus, setSyncStatus] = useState<LifeeeSyncStatus>("local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const saveSeqRef = useRef(0);

  const visibleStatus: LifeeeSyncStatus = sessionLoading
    ? "loading"
    : !hasSupabaseConfig
      ? "local"
      : !userId
        ? "waiting"
        : syncStatus;

  const recent = decisions.slice(0, 5);

  const submit = async () => {
    const decisionText = draft.decision.trim();
    if (!decisionText) return;

    const payload: DecisionLogPayload = {
      id: createLifeeeId(),
      decision: decisionText,
      decision_date: today,
      reason_chosen: draft.reason_chosen.trim() || null,
      expected_outcome: draft.expected_outcome.trim() || null,
      review_date: draft.review_date.trim() || null,
    };

    if (!hasSupabaseConfig || !userId || !remoteLoaded) {
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
      return;
    }

    const seq = saveSeqRef.current + 1;
    saveSeqRef.current = seq;
    setSyncStatus("saving");
    setSyncError(null);

    try {
      const saved = await upsertDecisionLog(userId, payload);
      if (saveSeqRef.current !== seq) return;
      if (saved) {
        onDecisionSaved(saved as DecisionLog);
      } else {
        onDecisionSaved({
          ...payload,
          id: payload.id ?? createLifeeeId(),
          options_considered: payload.options_considered ?? [],
        } as DecisionLog);
      }
      setSyncStatus("saved");
      setDraft(EMPTY_DRAFT);
    } catch (error) {
      if (saveSeqRef.current !== seq) return;
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Decision log save failed.");
    }
  };

  return (
    <section className="card-surface p-4 space-y-3 border-l-2 border-[#2f4f6f]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList size={14} className="text-[#2f4f6f]" />
          <h2 className="text-sm font-semibold text-[#25313c] uppercase tracking-wider">
            Decision Log
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
        One-line decisions persist to decision_logs. Add a review date if it needs follow-up.
      </p>

      <div className="grid gap-2 md:grid-cols-2">
        <input
          value={draft.decision}
          onChange={(event) => setDraft({ ...draft, decision: event.target.value })}
          placeholder="Decision (e.g. Skip social tonight)"
          className="rounded-md border border-[#ddd4c6] bg-white px-3 py-2 text-sm md:col-span-2"
        />
        <input
          value={draft.reason_chosen}
          onChange={(event) => setDraft({ ...draft, reason_chosen: event.target.value })}
          placeholder="Why (reason_chosen)"
          className="rounded-md border border-[#ddd4c6] bg-white px-3 py-2 text-sm"
        />
        <input
          value={draft.expected_outcome}
          onChange={(event) => setDraft({ ...draft, expected_outcome: event.target.value })}
          placeholder="Expected outcome"
          className="rounded-md border border-[#ddd4c6] bg-white px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={draft.review_date}
          onChange={(event) => setDraft({ ...draft, review_date: event.target.value })}
          className="rounded-md border border-[#ddd4c6] bg-white px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!draft.decision.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#25313c] px-3 py-2 text-sm text-white hover:bg-[#3a4754] disabled:opacity-50"
        >
          <Plus size={14} />
          Log decision
        </button>
      </div>

      {syncError ? (
        <p className="text-[11px] text-destructive">{syncError}</p>
      ) : null}

      <div className="rounded-xl border border-[#ddd4c6] bg-white/60 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <BookmarkCheck size={12} className="text-[#6f685f]" />
          <div className="text-[11px] uppercase tracking-wider text-[#6f685f] font-semibold">
            Recent decisions
          </div>
        </div>
        {recent.length === 0 ? (
          <div className="text-xs text-[#9b938a]">
            Nothing logged yet. Capture one decision so review dates can carry forward.
          </div>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {recent.map((decision) => {
              const status = classifyReviewDate(decision.review_date ?? null, today);
              return (
                <li
                  key={decision.id}
                  className="rounded-md border border-[#ece5da] bg-white/80 p-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-[#25313c]">{decision.decision}</span>
                    {decision.review_date ? (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          status === "overdue"
                            ? "border-rose-200 bg-rose-100 text-rose-700"
                            : status === "today"
                              ? "border-amber-200 bg-amber-100 text-amber-700"
                              : "border-sky-200 bg-sky-100 text-sky-700"
                        }`}
                      >
                        Review {decision.review_date}
                      </span>
                    ) : null}
                  </div>
                  {decision.reason_chosen ? (
                    <div className="mt-0.5 text-[11px] text-[#6f685f]">
                      Why: {decision.reason_chosen}
                    </div>
                  ) : null}
                  {decision.expected_outcome ? (
                    <div className="text-[11px] text-[#6f685f]">
                      Expect: {decision.expected_outcome}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
