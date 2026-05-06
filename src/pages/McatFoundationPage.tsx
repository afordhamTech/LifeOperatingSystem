import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpenCheck,
  CalendarClock,
  Check,
  Clipboard,
  FlaskConical,
  ListChecks,
  RotateCcw,
  Target,
} from "lucide-react";
import {
  CARS_ERROR_TYPES,
  MCAT_ERROR_TYPES,
  MCAT_PRIORITY_LABELS,
  MCAT_TOPIC_STATUSES,
  MCAT_TUTOR_PROMPT,
  MCAT_WEEKLY_REVIEW_PROMPT,
  getMcatDailyNextMove,
  getMcatSummary,
  getTodayDateKey,
  loadMcatFoundationState,
  saveMcatFoundationState,
  type AnyMcatErrorType,
  type CarsErrorType,
  type McatFoundationState,
  type McatPriorityLabel,
  type McatTopic,
  type McatTopicStatus,
} from "@/lib/mcat-foundation";

type CopyState = "tutor" | "weekly" | null;

type SessionForm = {
  topicId: string;
  minutes: number;
  questionsAttempted: number;
  questionsCorrect: number;
  confidenceBefore: number;
  confidenceAfter: number;
  mistakeTypes: AnyMcatErrorType[];
  notes: string;
  flashcardsMade: number;
};

type ErrorForm = {
  topicId: string;
  type: AnyMcatErrorType;
  note: string;
};

type CarsForm = {
  passages: number;
  questionsAttempted: number;
  questionsCorrect: number;
  minutes: number;
  errorTypes: CarsErrorType[];
};

const todayKey = getTodayDateKey();

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function priorityClass(label: McatPriorityLabel) {
  if (label === "Study Now") return "bg-[#6b87ae]/10 text-[#6b87ae] border-[#6b87ae]/25";
  if (label === "CARS Always Available") return "bg-[#9a7bbd]/10 text-[#8b6eb0] border-[#9a7bbd]/25";
  if (label === "Preview Lightly") return "bg-[#c39a4e]/10 text-[#a9813f] border-[#c39a4e]/25";
  if (label === "Passage Practice Later") return "bg-[#8c8478]/10 text-[#6f685f] border-[#8c8478]/20";
  return "bg-[#6f7f8f]/10 text-[#5d6d7e] border-[#6f7f8f]/20";
}

function statusClass(status: McatTopicStatus) {
  if (status === "MCAT ready" || status === "Practice ready") return "text-[#6a9a74]";
  if (status === "Stable" || status === "Practiced") return "text-[#6b87ae]";
  if (status === "Reviewed" || status === "Learning now") return "text-[#c39a4e]";
  return "text-[#8c8478]";
}

function formatAccuracy(correct: number, attempted: number) {
  if (attempted <= 0) return "0%";
  return `${Math.round((correct / attempted) * 100)}%`;
}

function getTopicById(topics: McatTopic[], topicId: string) {
  return topics.find((topic) => topic.id === topicId) ?? topics[0] ?? null;
}

function nextStatusAfterSession(form: SessionForm): McatTopicStatus {
  const accuracy = form.questionsAttempted > 0 ? form.questionsCorrect / form.questionsAttempted : 0;
  if (accuracy >= 0.85 && form.confidenceAfter >= 8) return "Practice ready";
  if (accuracy >= 0.7 && form.confidenceAfter >= 6) return "Practiced";
  if (form.confidenceAfter >= 5) return "Reviewed";
  return "Learning now";
}

function copyText(text: string, onCopied: () => void) {
  navigator.clipboard
    .writeText(text)
    .catch(() => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    })
    .finally(onCopied);
}

export default function McatFoundationPage() {
  const [state, setState] = useState<McatFoundationState>(() => loadMcatFoundationState());
  const firstTopicId = state.topics[0]?.id ?? "";
  const [copied, setCopied] = useState<CopyState>(null);
  const [sessionForm, setSessionForm] = useState<SessionForm>({
    topicId: firstTopicId,
    minutes: 35,
    questionsAttempted: 10,
    questionsCorrect: 0,
    confidenceBefore: 3,
    confidenceAfter: 5,
    mistakeTypes: [],
    notes: "",
    flashcardsMade: 5,
  });
  const [errorForm, setErrorForm] = useState<ErrorForm>({
    topicId: firstTopicId,
    type: "Never learned",
    note: "",
  });
  const [carsForm, setCarsForm] = useState<CarsForm>({
    passages: 1,
    questionsAttempted: 6,
    questionsCorrect: 0,
    minutes: 12,
    errorTypes: [],
  });

  useEffect(() => {
    saveMcatFoundationState(state);
  }, [state]);

  const summary = useMemo(() => getMcatSummary(state), [state]);
  const todayMove = useMemo(
    () => getMcatDailyNextMove(state, { academicRisk: 0, sleepReadiness: 8 }),
    [state],
  );
  const selectedTopic = getTopicById(state.topics, sessionForm.topicId);
  const topicById = useMemo(
    () => new Map(state.topics.map((topic) => [topic.id, topic])),
    [state.topics],
  );
  const topicsByUnit = useMemo(() => {
    return state.topics.reduce<Record<string, McatTopic[]>>((groups, topic) => {
      groups[topic.unit] = [...(groups[topic.unit] ?? []), topic];
      return groups;
    }, {});
  }, [state.topics]);
  const studyQueue = summary.scoredTopics
    .filter(({ topic }) => topic.priorityLabel !== "Delay Until Coursework")
    .slice(0, 10);
  const delayedTopics = state.topics.filter(
    (topic) => topic.priorityLabel === "Delay Until Coursework",
  );
  const retestQueue = [...summary.scoredTopics]
    .filter(({ topic }) => topic.priorityLabel !== "Delay Until Coursework")
    .sort((a, b) => b.retestPriority - a.retestPriority)
    .slice(0, 8);

  const weeklyStats = {
    topicsStudied: summary.topicsStudiedThisWeek.join(", ") || "None yet",
    sessions: summary.sessionsThisWeek.length,
    minutes: summary.minutesThisWeek,
    accuracy: formatAccuracy(summary.questionsCorrect, summary.questionsAttempted),
    mistakeTypes: Object.entries(summary.mistakeTypeCounts)
      .map(([type, count]) => `${type}: ${count}`)
      .join(", ") || "None logged",
  };

  const updateTopic = (topicId: string, patch: Partial<McatTopic>) => {
    setState((current) => ({
      ...current,
      topics: current.topics.map((topic) =>
        topic.id === topicId ? { ...topic, ...patch } : topic,
      ),
    }));
  };

  const addSession = () => {
    if (!selectedTopic) return;
    const attempted = Math.max(0, sessionForm.questionsAttempted);
    const correct = Math.min(Math.max(0, sessionForm.questionsCorrect), attempted);
    const session = {
      ...sessionForm,
      id: makeId("mcat-session"),
      date: todayKey,
      questionsAttempted: attempted,
      questionsCorrect: correct,
    };

    setState((current) => ({
      ...current,
      sessions: [session, ...current.sessions],
      topics: current.topics.map((topic) => {
        if (topic.id !== session.topicId) return topic;
        const nextAttempted = topic.questionsAttempted + attempted;
        const nextCorrect = topic.questionsCorrect + correct;
        const accuracy = attempted > 0 ? correct / attempted : 0;
        return {
          ...topic,
          status: nextStatusAfterSession(sessionForm),
          questionsAttempted: nextAttempted,
          questionsCorrect: nextCorrect,
          explanationConfidence: sessionForm.confidenceAfter,
          weakness: Math.max(1, topic.weakness + (accuracy < 0.6 ? 1 : -0.5)),
          retestUrgency: Math.min(10, topic.retestUrgency + (accuracy < 0.7 ? 1 : 0)),
          flashcardsDue: topic.flashcardsDue + sessionForm.flashcardsMade,
          lastReviewed: todayKey,
        };
      }),
    }));

    setSessionForm((current) => ({
      ...current,
      questionsCorrect: 0,
      mistakeTypes: [],
      notes: "",
    }));
  };

  const addError = () => {
    if (!errorForm.topicId) return;
    setState((current) => ({
      ...current,
      errors: [
        {
          id: makeId("mcat-error"),
          date: todayKey,
          topicId: errorForm.topicId,
          type: errorForm.type,
          note: errorForm.note,
          resolved: false,
        },
        ...current.errors,
      ],
      topics: current.topics.map((topic) =>
        topic.id === errorForm.topicId
          ? {
              ...topic,
              status: topic.status === "Not learned yet" ? "Learning now" : topic.status,
              weakness: Math.min(10, topic.weakness + 1),
              retestUrgency: Math.min(10, topic.retestUrgency + 1),
            }
          : topic,
      ),
    }));
    setErrorForm((current) => ({ ...current, note: "" }));
  };

  const addCarsEntry = () => {
    setState((current) => ({
      ...current,
      carsEntries: [
        {
          id: makeId("cars"),
          date: todayKey,
          passages: carsForm.passages,
          questionsAttempted: carsForm.questionsAttempted,
          questionsCorrect: Math.min(carsForm.questionsCorrect, carsForm.questionsAttempted),
          errorTypes: carsForm.errorTypes,
          minutes: carsForm.minutes,
        },
        ...current.carsEntries,
      ],
    }));
    setCarsForm((current) => ({ ...current, questionsCorrect: 0, errorTypes: [] }));
  };

  const markRetested = (topicId: string) => {
    updateTopic(topicId, {
      status: "Stable",
      lastRetested: todayKey,
      lastReviewed: todayKey,
      retestSuccess: 8,
      retestUrgency: 2,
      weakness: Math.max(1, (topicById.get(topicId)?.weakness ?? 5) - 1),
      flashcardsDue: Math.max(0, (topicById.get(topicId)?.flashcardsDue ?? 0) - 5),
    });
  };

  const toggleSessionMistake = (type: AnyMcatErrorType) => {
    setSessionForm((current) => ({
      ...current,
      mistakeTypes: current.mistakeTypes.includes(type)
        ? current.mistakeTypes.filter((item) => item !== type)
        : [...current.mistakeTypes, type],
    }));
  };

  const toggleCarsError = (type: CarsErrorType) => {
    setCarsForm((current) => ({
      ...current,
      errorTypes: current.errorTypes.includes(type)
        ? current.errorTypes.filter((item) => item !== type)
        : [...current.errorTypes, type],
    }));
  };

  const handleCopy = (kind: Exclude<CopyState, null>, text: string) => {
    copyText(text, () => {
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1800);
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="border-b border-[#ddd4c6] pb-4">
        <h1 className="text-2xl font-semibold text-[#25313c]">MCAT Foundation OS</h1>
        <p className="mt-1 text-sm text-[#6f685f]">
          Foundation Builder mode for Khan MCAT topics, early coursework, mistake review, CARS reps, and retests.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="card-surface p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Target size={16} className="text-[#6b87ae]" />
                <h2 className="text-sm font-semibold text-[#25313c]">Current Stage</h2>
              </div>
              <p className="mt-1 text-xs text-[#6f685f]">
                Rising sophomore after freshman year. Assume Gen Chem and light intro psych/science only.
              </p>
            </div>
            <span className="rounded-full border border-[#6b87ae]/25 bg-[#6b87ae]/10 px-3 py-1 text-xs font-semibold text-[#6b87ae]">
              {state.stage}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Metric label="Today's MCAT move" value={todayMove.title} />
            <Metric label="Current best topic" value={summary.currentBestTopic?.title ?? "No topic"} />
            <Metric label="Weakest topic" value={summary.weakestTopic?.title ?? "No topic"} />
            <Metric label="Next retest" value={summary.nextRetest?.title ?? "No retest"} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="CARS passages" value={String(summary.carsPassageCountThisWeek)} />
            <Metric label="Accuracy trend" value={`${summary.accuracyTrend >= 0 ? "+" : ""}${summary.accuracyTrend}%`} />
            <Metric label="Flashcards due" value={String(summary.flashcardsDue)} />
            <Metric label="This week" value={`${summary.minutesThisWeek} min`} />
          </div>
        </div>

        <div className="card-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertCircle size={15} className="text-[#c39a4e]" />
            <h2 className="text-sm font-semibold text-[#25313c]">What Not To Study Yet</h2>
          </div>
          <p className="mb-3 text-xs text-[#6f685f]">
            These stay delayed until coursework gives you the scaffolding.
          </p>
          <div className="flex flex-wrap gap-2">
            {delayedTopics.slice(0, 12).map((topic) => (
              <span
                key={topic.id}
                className="rounded-full border border-[#6f7f8f]/20 bg-[#6f7f8f]/10 px-2.5 py-1 text-xs text-[#5d6d7e]"
              >
                {topic.title}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_0.9fr]">
        <div className="card-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ListChecks size={16} className="text-[#6b87ae]" />
              <h2 className="text-sm font-semibold text-[#25313c]">Study Queue</h2>
            </div>
            <span className="text-xs text-[#6f685f]">Decision = study priority + retest - delay</span>
          </div>
          <div className="space-y-2">
            {studyQueue.map(({ topic, studyDecision, topicMastery, retestPriority }) => (
              <div key={topic.id} className="rounded-lg border border-[#ddd4c6] bg-[#fdfaf4] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-[#25313c]">{topic.title}</div>
                    <div className="mt-0.5 text-xs text-[#6f685f]">{topic.unit}</div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs ${priorityClass(topic.priorityLabel)}`}>
                    {topic.priorityLabel}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-[#6f685f]">
                  <span>Decision {studyDecision.toFixed(1)}</span>
                  <span>Mastery {topicMastery.toFixed(1)}</span>
                  <span>Retest {retestPriority.toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <BookOpenCheck size={16} className="text-[#6b87ae]" />
            <h2 className="text-sm font-semibold text-[#25313c]">Session Log</h2>
          </div>
          <div className="space-y-3">
            <label className="block text-[10px] uppercase tracking-wider text-[#6f685f]">
              Topic
              <select
                className="input-dark mt-1 w-full"
                value={sessionForm.topicId}
                onChange={(event) =>
                  setSessionForm((current) => ({ ...current, topicId: event.target.value }))
                }
              >
                {state.topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Minutes" value={sessionForm.minutes} onChange={(minutes) => setSessionForm((current) => ({ ...current, minutes }))} />
              <NumberField label="Attempted" value={sessionForm.questionsAttempted} onChange={(questionsAttempted) => setSessionForm((current) => ({ ...current, questionsAttempted }))} />
              <NumberField label="Correct" value={sessionForm.questionsCorrect} onChange={(questionsCorrect) => setSessionForm((current) => ({ ...current, questionsCorrect }))} />
              <NumberField label="Flashcards" value={sessionForm.flashcardsMade} onChange={(flashcardsMade) => setSessionForm((current) => ({ ...current, flashcardsMade }))} />
            </div>
            <RangeField label="Confidence before" value={sessionForm.confidenceBefore} onChange={(confidenceBefore) => setSessionForm((current) => ({ ...current, confidenceBefore }))} />
            <RangeField label="Confidence after" value={sessionForm.confidenceAfter} onChange={(confidenceAfter) => setSessionForm((current) => ({ ...current, confidenceAfter }))} />
            <div>
              <div className="mb-2 text-[10px] uppercase tracking-wider text-[#6f685f]">Mistake types</div>
              <ToggleList
                values={[...MCAT_ERROR_TYPES, ...CARS_ERROR_TYPES]}
                selected={sessionForm.mistakeTypes}
                onToggle={toggleSessionMistake}
              />
            </div>
            <textarea
              className="input-dark min-h-20 w-full"
              placeholder="What happened in this session?"
              value={sessionForm.notes}
              onChange={(event) =>
                setSessionForm((current) => ({ ...current, notes: event.target.value }))
              }
            />
            <button className="btn-primary flex w-full items-center justify-center gap-2" onClick={addSession}>
              <Check size={15} />
              Log Session
            </button>
            <div className="space-y-2">
              {state.sessions.slice(0, 3).map((session) => (
                <div
                  key={session.id}
                  className="rounded-lg border border-[#ddd4c6] bg-[#fdfaf4] p-3 text-xs"
                >
                  <div className="font-semibold text-[#25313c]">
                    {topicById.get(session.topicId)?.title ?? "Unknown topic"}
                  </div>
                  <div className="mt-1 text-[#6f685f]">
                    {session.minutes} min -{" "}
                    {formatAccuracy(session.questionsCorrect, session.questionsAttempted)} -{" "}
                    {session.notes || "No notes"}
                  </div>
                </div>
              ))}
              {state.sessions.length === 0 ? (
                <p className="rounded-lg border border-[#ddd4c6] bg-[#fdfaf4] p-3 text-sm text-[#8c8478]">
                  No MCAT session yet. Start with a foundation topic or CARS passage.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-[0.9fr_1fr]">
        <div className="card-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertCircle size={16} className="text-[#c39a4e]" />
            <h2 className="text-sm font-semibold text-[#25313c]">Error Log</h2>
          </div>
          <div className="space-y-3">
            <select
              className="input-dark w-full"
              value={errorForm.topicId}
              onChange={(event) =>
                setErrorForm((current) => ({ ...current, topicId: event.target.value }))
              }
            >
              {state.topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </select>
            <select
              className="input-dark w-full"
              value={errorForm.type}
              onChange={(event) =>
                setErrorForm((current) => ({
                  ...current,
                  type: event.target.value as AnyMcatErrorType,
                }))
              }
            >
              {[...MCAT_ERROR_TYPES, ...CARS_ERROR_TYPES].map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <textarea
              className="input-dark min-h-20 w-full"
              placeholder="Write the exact miss or gap."
              value={errorForm.note}
              onChange={(event) => setErrorForm((current) => ({ ...current, note: event.target.value }))}
            />
            <button className="btn-secondary flex w-full items-center justify-center gap-2" onClick={addError}>
              <AlertCircle size={15} />
              Add Error
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {state.errors.slice(0, 5).map((error) => (
              <div key={error.id} className="rounded-lg border border-[#ddd4c6] bg-[#fdfaf4] p-3 text-xs">
                <div className="font-semibold text-[#25313c]">{error.type}</div>
                <div className="mt-1 text-[#6f685f]">
                  {topicById.get(error.topicId)?.title ?? "Unknown topic"} - {error.note || "No note"}
                </div>
              </div>
            ))}
            {state.errors.length === 0 ? (
              <p className="text-sm text-[#8c8478]">
                No MCAT errors logged yet. When you miss something, classify why immediately.
              </p>
            ) : null}
          </div>
        </div>

        <div className="card-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <CalendarClock size={16} className="text-[#6b87ae]" />
            <h2 className="text-sm font-semibold text-[#25313c]">Retest Schedule</h2>
          </div>
          <div className="space-y-2">
            {retestQueue.map(({ topic, retestPriority }) => (
              <div key={topic.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#ddd4c6] bg-[#fdfaf4] p-3">
                <div>
                  <div className="text-sm font-semibold text-[#25313c]">{topic.title}</div>
                  <div className="text-xs text-[#6f685f]">
                    Retest priority {retestPriority.toFixed(1)} - last reviewed {topic.lastReviewed ?? "never"}
                  </div>
                </div>
                <button className="btn-secondary flex items-center gap-2 whitespace-nowrap" onClick={() => markRetested(topic.id)}>
                  <RotateCcw size={14} />
                  Retested
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="card-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <FlaskConical size={16} className="text-[#9a7bbd]" />
            <h2 className="text-sm font-semibold text-[#25313c]">CARS Tracker</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Passages" value={carsForm.passages} onChange={(passages) => setCarsForm((current) => ({ ...current, passages }))} />
            <NumberField label="Minutes" value={carsForm.minutes} onChange={(minutes) => setCarsForm((current) => ({ ...current, minutes }))} />
            <NumberField label="Attempted" value={carsForm.questionsAttempted} onChange={(questionsAttempted) => setCarsForm((current) => ({ ...current, questionsAttempted }))} />
            <NumberField label="Correct" value={carsForm.questionsCorrect} onChange={(questionsCorrect) => setCarsForm((current) => ({ ...current, questionsCorrect }))} />
          </div>
          <div className="mt-3">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-[#6f685f]">CARS miss types</div>
            <ToggleList values={[...CARS_ERROR_TYPES]} selected={carsForm.errorTypes} onToggle={toggleCarsError} />
          </div>
          <button className="btn-primary mt-3 flex w-full items-center justify-center gap-2" onClick={addCarsEntry}>
            <Check size={15} />
            Log CARS Passage
          </button>
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-[#6f685f]">
            <Metric label="This week" value={`${summary.carsPassageCountThisWeek} passages`} />
            <Metric label="CARS risk" value={summary.carsRisk.toFixed(1)} />
            <Metric label="CARS accuracy" value={formatAccuracy(
              state.carsEntries.reduce((sum, entry) => sum + entry.questionsCorrect, 0),
              state.carsEntries.reduce((sum, entry) => sum + entry.questionsAttempted, 0),
            )} />
          </div>
        </div>

        <div className="card-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <Clipboard size={16} className="text-[#6b87ae]" />
            <h2 className="text-sm font-semibold text-[#25313c]">Weekly MCAT Review</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="Topics studied" value={weeklyStats.topicsStudied} />
            <Metric label="Sessions" value={String(weeklyStats.sessions)} />
            <Metric label="Minutes" value={String(weeklyStats.minutes)} />
            <Metric label="Accuracy" value={weeklyStats.accuracy} />
          </div>
          <div className="mt-3 rounded-lg border border-[#ddd4c6] bg-[#fdfaf4] p-3 text-xs text-[#6f685f]">
            Mistake types: {weeklyStats.mistakeTypes}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="btn-primary flex items-center gap-2"
              onClick={() => handleCopy("tutor", MCAT_TUTOR_PROMPT)}
            >
              {copied === "tutor" ? <Check size={15} /> : <Clipboard size={15} />}
              {copied === "tutor" ? "Copied Tutor Prompt" : "Copy ChatGPT Tutor Prompt"}
            </button>
            <button
              className="btn-secondary flex items-center gap-2"
              onClick={() => handleCopy("weekly", MCAT_WEEKLY_REVIEW_PROMPT)}
            >
              {copied === "weekly" ? <Check size={15} /> : <Clipboard size={15} />}
              {copied === "weekly" ? "Copied Weekly Prompt" : "Copy Weekly Review Prompt"}
            </button>
          </div>
        </div>
      </section>

      <section className="card-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <ListChecks size={16} className="text-[#6b87ae]" />
          <h2 className="text-sm font-semibold text-[#25313c]">Topic Map</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Object.entries(topicsByUnit).map(([unit, topics]) => (
            <div key={unit} className="rounded-lg border border-[#ddd4c6] bg-[#fdfaf4] p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#25313c]">
                {unit}
              </div>
              <div className="space-y-2">
                {topics.map((topic) => (
                  <div key={topic.id} className="grid grid-cols-1 gap-2 border-t border-[#ece5da] pt-2 md:grid-cols-[1fr_150px]">
                    <div>
                      <div className="text-sm text-[#25313c]">{topic.title}</div>
                      <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] ${priorityClass(topic.priorityLabel)}`}>
                        {topic.priorityLabel}
                      </div>
                    </div>
                    <select
                      className={`input-dark text-xs ${statusClass(topic.status)}`}
                      value={topic.status}
                      onChange={(event) =>
                        updateTopic(topic.id, {
                          status: event.target.value as McatTopicStatus,
                        })
                      }
                    >
                      {MCAT_TOPIC_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card-surface p-4">
        <div className="mb-3 text-sm font-semibold text-[#25313c]">Priority Labels</div>
        <div className="flex flex-wrap gap-2">
          {MCAT_PRIORITY_LABELS.map((label) => (
            <span key={label} className={`rounded-full border px-2.5 py-1 text-xs ${priorityClass(label)}`}>
              {label}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-[#6f685f]">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-[#25313c]" title={value}>
        {value}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-[10px] uppercase tracking-wider text-[#6f685f]">
      {label}
      <input
        className="input-dark mt-1 w-full"
        type="number"
        value={value}
        min={0}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function RangeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-[10px] uppercase tracking-wider text-[#6f685f]">
      <span className="flex items-center justify-between">
        {label}
        <span>{value}/10</span>
      </span>
      <input
        className="slider-dark mt-2"
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ToggleList<T extends string>({
  values,
  selected,
  onToggle,
}: {
  values: T[];
  selected: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => {
        const active = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => onToggle(value)}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              active
                ? "border-[#6b87ae]/30 bg-[#6b87ae]/10 text-[#6b87ae]"
                : "border-[#ddd4c6] bg-[#fdfaf4] text-[#6f685f] hover:bg-[#f0ebe2]"
            }`}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}
