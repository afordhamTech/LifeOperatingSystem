import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import {
  AlertCircle,
  BookOpenCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clipboard,
  Clock,
  Filter,
  Flag,
  FlaskConical,
  Layers,
  Pause,
  Play,
  Plus,
  Search,
  Square,
  Target,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CARS_ERROR_TYPES,
  MCAT_ERROR_TYPES,
  MCAT_PRIORITY_LABELS,
  MCAT_TOPIC_STATUSES,
  MCAT_TUTOR_PROMPT,
  MCAT_WEEKLY_REVIEW_PROMPT,
  activeSessionElapsedMs,
  applyMcatSrsReview,
  getFoundationProgress,
  getDailyMinutes,
  getDailyMinutesSeries,
  getHighLeverageQueue,
  getMcatDailyNextMove,
  getMcatSummary,
  getMistakeBreakdown,
  getStudyStreak,
  getTodayDateKey,
  getTopicAccuracy,
  getTopicErrors,
  getTopicSessions,
  getWeeklyAccuracySeries,
  hasMcatFoundationProgress,
  isCarsTopic,
  loadActiveSession,
  loadMcatFoundationState,
  normalizeActiveMcatSession,
  normalizeMcatFoundationState,
  saveActiveSession,
  saveMcatFoundationState,
  type ActiveMcatSession,
  type AnyMcatErrorType,
  type CarsErrorType,
  type McatFoundationState,
  type McatPriorityLabel,
  type McatTopic,
  type McatSrsRating,
  type McatTopicStatus,
} from "@/lib/mcat-foundation";
import {
  MCAT_PHASE_0_TEMPLATE,
  MCAT_PHASE_0_TEMPLATE_KEY,
  MCAT_PHASE_REGISTRY,
  MCAT_PREP_SYSTEM_TAGLINE,
  MCAT_PHASE_0_SOURCE,
} from "@/lib/mcat-phase-0-template";
import {
  MCAT_COMMITTED_STUDY_SOURCE,
  buildMcatTodayCommand,
  commitMcatPlanOccurrenceToTask,
  formatMcatAccuracyTrendLabel,
  generateMcatPhase0PlanOccurrences,
  pickTodayMcatOccurrence,
  summarizeMcatPlanOccurrenceStatus,
  type McatPlanOccurrence,
  type McatPlanOccurrenceSummary,
  type McatTodayCommand,
} from "@/lib/mcat-plan-occurrences";
import {
  createMcatPlanInstance,
  fetchActiveMcatPlanInstance,
  fetchMcatPlanOccurrences,
  fetchUniversalTasks,
  fetchUniversalTasksByTemplate,
  updateMcatPlanOccurrence,
  upsertMcatPlanOccurrences,
  upsertUniversalTask,
  type McatPlanInstance,
} from "@/lib/lifeee-persistence";
import { loadTasks, saveTasks, type Task } from "@/lib/task-system";
import { supabase } from "@/lib/supabase-client";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CollapsibleSection, PageDecisionHeader } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

const DAILY_GOAL_MINUTES = 60;

type LogDialogPrefill = {
  topicId: string;
  minutes: number;
} | null;

type SessionFormState = {
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

type ErrorFormState = {
  topicId: string;
  type: AnyMcatErrorType;
  note: string;
};

type CarsFormState = {
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
  if (label === "Study Now") return "bg-primary/10 text-primary border-primary/25";
  if (label === "CARS Always Available") return "bg-violet-500/10 text-violet-600 border-violet-500/25 dark:text-violet-300";
  if (label === "Preview Lightly") return "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-300";
  if (label === "Passage Practice Later") return "bg-muted text-muted-foreground border-border";
  return "bg-muted text-muted-foreground border-border";
}

function statusBadge(status: McatTopicStatus) {
  if (status === "MCAT ready" || status === "Practice ready") return "bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-300";
  if (status === "Stable" || status === "Practiced") return "bg-primary/10 text-primary border-primary/25";
  if (status === "Reviewed" || status === "Learning now") return "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-300";
  return "bg-muted text-muted-foreground border-border";
}

function formatAccuracy(correct: number, attempted: number) {
  if (attempted <= 0) return "—";
  return `${Math.round((correct / attempted) * 100)}%`;
}

function formatHms(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (v: number) => v.toString().padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function nextStatusAfterSession(form: SessionFormState): McatTopicStatus {
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

const CHART_COLORS = ["#6b87ae", "#9a7bbd", "#c39a4e", "#6a9a74", "#c97a73", "#8c8478", "#5d6d7e"];

const MCAT_SYNC_DEBOUNCE_MS = 700;

type McatSyncStatus = "local" | "loading" | "saving" | "synced" | "error";
type McatPhaseSeedStatus = "idle" | "loading" | "seeding" | "saved" | "error";
type McatCommitStatus = "idle" | "committing" | "saved" | "error";

type McatRemoteRow = {
  state: unknown;
  active_session: unknown | null;
};

function stateUpdatedAtMs(state: McatFoundationState) {
  const time = new Date(state.updatedAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function shouldUseRemoteSnapshot(
  remote: McatFoundationState,
  local: McatFoundationState,
  remoteActiveSession: ActiveMcatSession | null,
  localActiveSession: ActiveMcatSession | null,
) {
  const remoteHasProgress = hasMcatFoundationProgress(remote) || Boolean(remoteActiveSession);
  const localHasProgress = hasMcatFoundationProgress(local) || Boolean(localActiveSession);
  if (remoteHasProgress && !localHasProgress) return true;
  if (!remoteHasProgress && localHasProgress) return false;
  return stateUpdatedAtMs(remote) >= stateUpdatedAtMs(local);
}

function syncLabel(status: McatSyncStatus, hasConfig: boolean, userId: string | null) {
  if (!hasConfig) return "Local only";
  if (status === "loading") return userId ? "Loading" : "Checking auth";
  if (!userId) return "Sign in to sync";
  if (status === "saving") return "Saving";
  if (status === "synced") return "Synced";
  if (status === "error") return "Sync error";
  return "Local only";
}

function syncClass(status: McatSyncStatus, userId: string | null) {
  if (!userId) return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (status === "error") return "border-destructive/25 bg-destructive/10 text-destructive";
  if (status === "synced") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  return "border-primary/25 bg-primary/10 text-primary";
}

function mergeTasksIntoLocalCache(tasks: Task[]) {
  if (tasks.length === 0) return;
  const localTasks = loadTasks();
  const savedIds = new Set(tasks.map((task) => task.id));
  saveTasks([...tasks, ...localTasks.filter((task) => !savedIds.has(task.id))]);
}

function sortTemplateTasks(tasks: Task[]) {
  return [...tasks].sort(
    (a, b) => (a.template_day_index ?? 999) - (b.template_day_index ?? 999),
  );
}

function sortTemplateOccurrences(occurrences: McatPlanOccurrence[]) {
  return [...occurrences].sort((a, b) => a.template_day_index - b.template_day_index);
}

function readErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}

function topicRecommendationReason(topic: McatTopic | null) {
  if (!topic) return "Start with one foundation topic so the study queue has real data.";
  if (topic.title === "Acid base chemistry") {
    return "Acid-base chemistry supports buffers, titrations, and equilibrium.";
  }
  if (topic.priorityLabel === "CARS Always Available") {
    return "CARS improves through frequent passages and exact miss classification.";
  }
  if (topic.flashcardsDue > 0) {
    return `${topic.flashcardsDue} flashcards are due, so review will pay off quickly.`;
  }
  if (!topic.lastReviewed) {
    return "This topic has not been revisited yet, so it needs a first clean pass.";
  }
  if (topic.weakness >= 7) {
    return "It is still a weak foundation topic and can unlock related passages.";
  }
  return `${topic.unit} is useful enough to keep warm without overbuilding analytics.`;
}

function McatRoadmapCard() {
  return (
    <section className="card-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">MCAT Roadmap</h2>
        <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
          Phase 0 active · later phases locked
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Dedicated MCAT prep system. Phase 0 builds the foundation; later phases unlock
        after the Phase 0 checkpoint.
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {MCAT_PHASE_REGISTRY.map((phase) => {
          const isActive = phase.status === "active";
          return (
            <li
              key={phase.template_key}
              className={cn(
                "rounded-md border p-3",
                isActive
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-muted/30",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-foreground">
                  {phase.phase_name}
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-muted-foreground",
                  )}
                >
                  {isActive ? "Active · Seedable" : "Locked"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{phase.purpose}</p>
              {!phase.can_seed ? (
                <p className="mt-1 text-[11px] italic text-muted-foreground">
                  {phase.unlock_hint ?? "Locked until Phase 0 checkpoint."}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 rounded-md border border-dashed border-border bg-background/40 p-3 text-xs text-muted-foreground">
        Phase 0 checkpoint unlocks next-phase planning. Lifeee will use completed hours,
        CARS passages, error-log entries, flashcards, and topic status to recommend the
        next phase — not implemented yet.
      </div>
    </section>
  );
}

function McatPhase0ScheduleCard({
  summary,
  seedStatus,
  seedMessage,
  seedError,
  hasSupabaseConfig,
  userId,
  sessionLoading,
  todayOccurrence,
  todayCommittedTask,
  legacySeededTaskCount,
  activePlan,
  todayKey,
  onSeed,
}: {
  summary: McatPlanOccurrenceSummary;
  seedStatus: McatPhaseSeedStatus;
  seedMessage: string | null;
  seedError: string | null;
  hasSupabaseConfig: boolean;
  userId: string | null;
  sessionLoading: boolean;
  todayOccurrence: McatPlanOccurrence | null;
  todayCommittedTask: Task | null;
  legacySeededTaskCount: number;
  activePlan: McatPlanInstance | null;
  todayKey: string;
  onSeed: () => void;
}) {
  const authMessage = !hasSupabaseConfig
    ? "Saved MCAT plan storage is unavailable right now."
    : !userId
      ? "Log in to start the MCAT plan."
      : null;
  const canSeed =
    Boolean(userId) &&
    hasSupabaseConfig &&
    !sessionLoading &&
    summary.generatedPlanDayCount < summary.totalPlanDayCount &&
    seedStatus !== "loading" &&
    seedStatus !== "seeding";
  const seedButtonLabel =
    seedStatus === "error"
      ? "Retry plan start"
      : summary.generatedPlanDayCount > 0
        ? "Repair Phase 0 Plan"
        : "Start Phase 0 Plan";
  const remainingHours = Math.round((summary.remainingPlannedMinutes / 60) * 10) / 10;

  return (
    <section className="card-surface p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <BookOpenCheck size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">MCAT Phase 0 Schedule</h2>
            <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
              {summary.statusLabel}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground" data-phase-count={MCAT_PHASE_REGISTRY.length}>
            Phase 0 of the MCAT prep system · later phases add on top
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {activePlan
              ? `${activePlan.seed_start_date} → ${activePlan.seed_end_date} · 78 total hours · ${activePlan.phase_name}`
              : `Starts today when started · 70 days · 78 total hours · ${MCAT_PHASE_0_TEMPLATE.phase_name}`}
          </p>
          <p className="mt-1 text-xs italic text-muted-foreground">{MCAT_PREP_SYSTEM_TAGLINE}</p>
          {!activePlan ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Week 1 begins on {todayKey}.
            </p>
          ) : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <MiniMetric
              label="Current week"
              value={
                summary.currentWeekIndex
                  ? `Week ${summary.currentWeekIndex}`
                  : "Outside phase"
              }
            />
            <MiniMetric
              label="Generated"
              value={`${summary.generatedPlanDayCount}/${summary.totalPlanDayCount} plan days`}
            />
            <MiniMetric label="Committed to Tasks" value={`${summary.committedTaskCount}`} />
            <MiniMetric label="Completed" value={`${summary.completedCount}`} />
            <MiniMetric label="Remaining" value={`${summary.remainingPlannedMinutes}m`} />
            <MiniMetric label="Hours left" value={`${remainingHours}h`} />
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            {todayCommittedTask
              ? `Today's committed task: ${todayCommittedTask.task_code} · ${todayCommittedTask.title}`
              : todayOccurrence
                ? `Today's plan move: ${todayOccurrence.title}`
                : "No Phase 0 plan move is due today."}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <button
            type="button"
            onClick={onSeed}
            disabled={!canSeed}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={14} />
            {seedStatus === "seeding" ? "Seeding..." : seedButtonLabel}
          </button>
          <Link
            to="/tasks"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <Clipboard size={14} />
            View in Tasks
          </Link>
          <Link
            to="/tasks"
            aria-disabled={!todayCommittedTask}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted",
              !todayCommittedTask && "pointer-events-none opacity-50",
            )}
          >
            <CalendarClock size={14} />
            View Today's MCAT Task
          </Link>
        </div>
      </div>

      {authMessage ? (
        <div className="mt-3 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {authMessage}
        </div>
      ) : null}
      {seedMessage ? (
        <div className="mt-3 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          {seedMessage}
        </div>
      ) : null}
      {seedError ? (
        <div className="mt-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {seedError}
        </div>
      ) : null}
      {legacySeededTaskCount > 0 ? (
        <div className="mt-3 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Old MCAT seeded tasks detected: {legacySeededTaskCount}. They are hidden from normal task planning unless you commit/adopt one.
        </div>
      ) : null}
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/70 p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function McatTodayCommandCard({
  command,
  isCommitted,
  canCommit,
  commitStatus,
  commitMessage,
  onStart,
  onCommit,
  onViewDetails,
}: {
  command: McatTodayCommand;
  isCommitted: boolean;
  canCommit: boolean;
  commitStatus: McatCommitStatus;
  commitMessage: string | null;
  onStart: () => void;
  onCommit: () => void;
  onViewDetails: () => void;
}) {
  return (
    <section className="card-elevated border-primary/25 bg-primary/5 p-5">
      <div className="mb-4 rounded-md border border-primary/20 bg-background/80 px-3 py-2 text-xs font-semibold text-primary">
        {command.disciplineText}
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {command.heading}
          </div>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            Do this now: {command.action}
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <MiniMetric label="Time" value={`${command.estimatedMinutes}m`} />
            <div className="rounded-md border border-border bg-background/70 p-2 md:col-span-2">
              <div className="text-[10px] uppercase text-muted-foreground">Why this</div>
              <div className="mt-1 text-sm text-foreground">{command.why}</div>
            </div>
          </div>
          <div className="mt-3 rounded-md border border-border bg-background/70 p-3">
            <div className="text-[10px] uppercase text-muted-foreground">Success</div>
            <div className="mt-1 text-sm text-foreground">{command.successCondition}</div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-[240px] lg:justify-end">
          <button className="btn-primary flex items-center gap-2" onClick={onStart}>
            <Play size={15} />
            Start session
          </button>
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={onCommit}
            disabled={!canCommit || isCommitted || commitStatus === "committing"}
          >
            <CalendarClock size={15} />
            {isCommitted
              ? "Already committed"
              : commitStatus === "committing"
                ? "Committing..."
                : "Commit to Daily OS"}
          </button>
          <button className="btn-secondary flex items-center gap-2" onClick={onViewDetails}>
            <BookOpenCheck size={15} />
            View details
          </button>
        </div>
      </div>
      {commitMessage ? (
        <div
          className={cn(
            "mt-4 rounded-md border px-3 py-2 text-xs",
            commitStatus === "error"
              ? "border-destructive/25 bg-destructive/10 text-destructive"
              : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
          )}
        >
          {commitMessage}
        </div>
      ) : null}
    </section>
  );
}

export default function McatFoundationPage() {
  const { hasSupabaseConfig, isLoading: sessionLoading, userId } = useSupabaseSession();
  const [state, setState] = useState<McatFoundationState>(() => loadMcatFoundationState());
  const [activeSession, setActiveSession] = useState<ActiveMcatSession | null>(() => loadActiveSession());
  const [syncStatus, setSyncStatus] = useState<McatSyncStatus>("local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [phase0Occurrences, setPhase0Occurrences] = useState<McatPlanOccurrence[]>([]);
  const [legacySeededPhaseTasks, setLegacySeededPhaseTasks] = useState<Task[]>([]);
  const [committedMcatTasks, setCommittedMcatTasks] = useState<Task[]>([]);
  const [activePhase0Plan, setActivePhase0Plan] = useState<McatPlanInstance | null>(null);
  const [phaseSeedStatus, setPhaseSeedStatus] = useState<McatPhaseSeedStatus>("idle");
  const [phaseSeedMessage, setPhaseSeedMessage] = useState<string | null>(null);
  const [phaseSeedError, setPhaseSeedError] = useState<string | null>(null);
  const [commitStatus, setCommitStatus] = useState<McatCommitStatus>("idle");
  const [commitMessage, setCommitMessage] = useState<string | null>(null);
  const stateRef = useRef(state);
  const activeSessionRef = useRef(activeSession);
  const remoteLoadedForUserRef = useRef<string | null>(null);
  const saveSequenceRef = useRef(0);
  const [tickNonce, setTickNonce] = useState(0);
  const [activeTab, setActiveTab] = useState("today");
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [logPrefill, setLogPrefill] = useState<LogDialogPrefill>(null);
  const [topicDetailId, setTopicDetailId] = useState<string | null>(null);
  const [copied, setCopied] = useState<"tutor" | "weekly" | null>(null);
  const tickRef = useRef<number | null>(null);

  const firstTopicId = state.topics[0]?.id ?? "";
  const studyNowTopic =
    state.topics.find((t) => t.priorityLabel === "Study Now") ?? state.topics[0] ?? null;

  const [sessionForm, setSessionForm] = useState<SessionFormState>(() => ({
    topicId: firstTopicId,
    minutes: 35,
    questionsAttempted: 10,
    questionsCorrect: 0,
    confidenceBefore: 3,
    confidenceAfter: 5,
    mistakeTypes: [],
    notes: "",
    flashcardsMade: 5,
  }));
  const [errorForm, setErrorForm] = useState<ErrorFormState>(() => ({
    topicId: firstTopicId,
    type: "Never learned",
    note: "",
  }));
  const [carsForm, setCarsForm] = useState<CarsFormState>(() => ({
    passages: 1,
    questionsAttempted: 6,
    questionsCorrect: 0,
    minutes: 12,
    errorTypes: [],
  }));

  // Persist data state
  useEffect(() => {
    stateRef.current = state;
    saveMcatFoundationState(state);
  }, [state]);

  // Persist active session locally so an interrupted timer can resume.
  useEffect(() => {
    activeSessionRef.current = activeSession;
    saveActiveSession(activeSession);
  }, [activeSession]);

  useEffect(() => {
    let active = true;

    const createRemoteSnapshot = async () => {
      if (!supabase || !userId) return;
      setSyncStatus("saving");
      const snapshot = {
        user_id: userId,
        state: { ...stateRef.current, updatedAt: new Date().toISOString() },
        active_session: activeSessionRef.current,
      };
      const { error } = await supabase
        .from("mcat_foundation_states")
        .upsert(snapshot, { onConflict: "user_id" });

      if (!active) return;
      if (error) {
        remoteLoadedForUserRef.current = null;
        setSyncStatus("error");
        setSyncError(error.message);
        return;
      }

      setSyncStatus("synced");
      setSyncError(null);
    };

    const loadRemoteSnapshot = async () => {
      if (!supabase || !userId) return;
      setSyncStatus("loading");
      setSyncError(null);

      const { data, error } = await supabase
        .from("mcat_foundation_states")
        .select("state,active_session")
        .eq("user_id", userId)
        .maybeSingle<McatRemoteRow>();

      if (!active) return;

      if (error) {
        remoteLoadedForUserRef.current = null;
        setSyncStatus("error");
        setSyncError(error.message);
        return;
      }

      remoteLoadedForUserRef.current = userId;

      if (!data) {
        await createRemoteSnapshot();
        return;
      }

      const remoteState = normalizeMcatFoundationState(data.state);
      const remoteActiveSession = normalizeActiveMcatSession(data.active_session);
      const localState = stateRef.current;
      const localActiveSession = activeSessionRef.current;
      if (shouldUseRemoteSnapshot(remoteState, localState, remoteActiveSession, localActiveSession)) {
        setState(remoteState);
        saveMcatFoundationState(remoteState);
        setActiveSession(remoteActiveSession);
        saveActiveSession(remoteActiveSession);
        setSyncStatus("synced");
        return;
      }

      await createRemoteSnapshot();
    };

    if (sessionLoading) {
      return () => {
        active = false;
      };
    }

    if (!supabase || !hasSupabaseConfig || !userId) {
      remoteLoadedForUserRef.current = null;
      return () => {
        active = false;
      };
    }

    void loadRemoteSnapshot();

    return () => {
      active = false;
    };
  }, [hasSupabaseConfig, sessionLoading, userId]);

  useEffect(() => {
    let active = true;

    const loadPhase0Plan = async () => {
      if (sessionLoading) return;
      if (!supabase || !hasSupabaseConfig || !userId) {
        setPhase0Occurrences([]);
        setLegacySeededPhaseTasks([]);
        setCommittedMcatTasks([]);
        setActivePhase0Plan(null);
        setPhaseSeedStatus("idle");
        setPhaseSeedError(null);
        return;
      }

      setPhaseSeedStatus("loading");
      setPhaseSeedError(null);
      try {
        const [legacyTasks, committedTasks, plan] = await Promise.all([
          fetchUniversalTasksByTemplate({
            userId,
            source: MCAT_PHASE_0_SOURCE,
            templateKey: MCAT_PHASE_0_TEMPLATE_KEY,
          }),
          fetchUniversalTasksByTemplate({
            userId,
            source: MCAT_COMMITTED_STUDY_SOURCE,
            templateKey: MCAT_PHASE_0_TEMPLATE_KEY,
          }),
          fetchActiveMcatPlanInstance({
            userId,
            templateKey: MCAT_PHASE_0_TEMPLATE_KEY,
          }),
        ]);
        const occurrences = plan
          ? await fetchMcatPlanOccurrences({ userId, planInstanceId: plan.id })
          : [];
        if (!active) return;
        setLegacySeededPhaseTasks(sortTemplateTasks(legacyTasks));
        setCommittedMcatTasks(sortTemplateTasks(committedTasks));
        setPhase0Occurrences(sortTemplateOccurrences(occurrences));
        setActivePhase0Plan(plan);
        setPhaseSeedStatus("saved");
      } catch (error) {
        if (!active) return;
        setPhaseSeedStatus("error");
        setPhaseSeedError(readErrorMessage(error, "Unable to load MCAT Phase 0 plan."));
      }
    };

    void loadPhase0Plan();

    return () => {
      active = false;
    };
  }, [hasSupabaseConfig, sessionLoading, userId]);

  useEffect(() => {
    if (!supabase || !userId || sessionLoading || remoteLoadedForUserRef.current !== userId) {
      return;
    }

    const supabaseClient = supabase;
    const saveSequence = saveSequenceRef.current + 1;
    saveSequenceRef.current = saveSequence;

    const timeout = window.setTimeout(() => {
      setSyncStatus("saving");
      setSyncError(null);

      void (async () => {
        const { error } = await supabaseClient
          .from("mcat_foundation_states")
          .upsert(
            {
              user_id: userId,
              state: { ...state, updatedAt: new Date().toISOString() },
              active_session: activeSession,
            },
            { onConflict: "user_id" },
          );

        if (saveSequenceRef.current !== saveSequence) return;

        if (error) {
          setSyncStatus("error");
          setSyncError(error.message);
          return;
        }

        setSyncStatus("synced");
      })();
    }, MCAT_SYNC_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeSession, sessionLoading, state, userId]);

  useEffect(() => {
    if (!activeSession?.isRunning) {
      if (tickRef.current != null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    tickRef.current = window.setInterval(() => setTickNonce((n) => n + 1), 1000);
    return () => {
      if (tickRef.current != null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [activeSession?.isRunning]);

  const summary = useMemo(() => getMcatSummary(state), [state]);
  const todayMove = useMemo(
    () => getMcatDailyNextMove(state, { academicRisk: 0, sleepReadiness: 8 }),
    [state],
  );
  const todayMoveTopic = useMemo(
    () => state.topics.find((topic) => topic.title === todayMove.topic) ?? studyNowTopic,
    [state.topics, studyNowTopic, todayMove.topic],
  );
  const streak = useMemo(() => getStudyStreak(state), [state]);
  const todayMinutes = useMemo(() => getDailyMinutes(state, todayKey), [state]);
  const dailySeries = useMemo(() => getDailyMinutesSeries(state, 14), [state]);
  const weeklyAccuracy = useMemo(() => getWeeklyAccuracySeries(state, 6), [state]);
  const mistakeBreakdown = useMemo(() => getMistakeBreakdown(state, 30), [state]);
  const topicById = useMemo(
    () => new Map(state.topics.map((topic) => [topic.id, topic])),
    [state.topics],
  );
  const todaySessions = useMemo(
    () => state.sessions.filter((s) => s.date === todayKey),
    [state.sessions],
  );
  const todayCars = useMemo(
    () => state.carsEntries.filter((e) => e.date === todayKey),
    [state.carsEntries],
  );
  const retestQueue = [...summary.scoredTopics]
    .filter(({ topic }) => topic.priorityLabel !== "Delay Until Coursework")
    .sort((a, b) => b.retestPriority - a.retestPriority)
    .slice(0, 8);
  const highLeverageQueue = useMemo(() => getHighLeverageQueue(state).slice(0, 8), [state]);
  const foundationProgress = useMemo(() => getFoundationProgress(state), [state]);

  const elapsedMs = activeSession ? activeSessionElapsedMs(activeSession) : 0;
  const activeTopic = activeSession ? topicById.get(activeSession.topicId) ?? null : null;
  // touch tickNonce so ESLint doesn't think it's unused — re-render is the side effect
  void tickNonce;

  const updateTopic = (topicId: string, patch: Partial<McatTopic>) => {
    setState((current) => ({
      ...current,
      topics: current.topics.map((topic) =>
        topic.id === topicId ? { ...topic, ...patch } : topic,
      ),
    }));
  };

  const startSession = (topicId: string) => {
    setActiveSession({
      topicId,
      elapsedMs: 0,
      isRunning: true,
      lastResumedAt: Date.now(),
      startedAt: Date.now(),
    });
    setActiveTab("today");
  };

  const pauseSession = () => {
    setActiveSession((current) => {
      if (!current || !current.isRunning) return current;
      return {
        ...current,
        elapsedMs: activeSessionElapsedMs(current),
        isRunning: false,
        lastResumedAt: null,
      };
    });
  };

  const resumeSession = () => {
    setActiveSession((current) => {
      if (!current || current.isRunning) return current;
      return {
        ...current,
        isRunning: true,
        lastResumedAt: Date.now(),
      };
    });
  };

  const stopSession = () => {
    if (!activeSession) return;
    const elapsed = activeSessionElapsedMs(activeSession);
    const minutes = Math.max(1, Math.round(elapsed / 60000));
    setLogPrefill({ topicId: activeSession.topicId, minutes });
    setSessionForm((current) => ({ ...current, topicId: activeSession.topicId, minutes }));
    setLogDialogOpen(true);
  };

  const cancelSession = () => {
    setActiveSession(null);
  };

  const openLogDialog = (prefill?: LogDialogPrefill) => {
    if (prefill) {
      setLogPrefill(prefill);
      setSessionForm((current) => ({
        ...current,
        topicId: prefill.topicId,
        minutes: prefill.minutes,
      }));
    } else {
      setLogPrefill(null);
    }
    setLogDialogOpen(true);
  };

  const submitLogSession = () => {
    const topic = topicById.get(sessionForm.topicId);
    if (!topic) return;
    const attempted = Math.max(0, Math.floor(sessionForm.questionsAttempted));
    const correct = Math.min(Math.max(0, Math.floor(sessionForm.questionsCorrect)), attempted);
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
      topics: current.topics.map((t) => {
        if (t.id !== session.topicId) return t;
        const nextAttempted = t.questionsAttempted + attempted;
        const nextCorrect = t.questionsCorrect + correct;
        const accuracy = attempted > 0 ? correct / attempted : 0;
        return {
          ...t,
          status: nextStatusAfterSession(sessionForm),
          questionsAttempted: nextAttempted,
          questionsCorrect: nextCorrect,
          explanationConfidence: sessionForm.confidenceAfter,
          weakness: Math.max(1, t.weakness + (accuracy < 0.6 ? 1 : -0.5)),
          retestUrgency: Math.min(10, t.retestUrgency + (accuracy < 0.7 ? 1 : 0)),
          flashcardsDue: t.flashcardsDue + sessionForm.flashcardsMade,
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
    setLogPrefill(null);
    setLogDialogOpen(false);
    setActiveSession(null);
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
          passages: Math.max(1, Math.floor(carsForm.passages)),
          questionsAttempted: Math.max(0, Math.floor(carsForm.questionsAttempted)),
          questionsCorrect: Math.max(
            0,
            Math.min(Math.floor(carsForm.questionsCorrect), Math.floor(carsForm.questionsAttempted)),
          ),
          errorTypes: carsForm.errorTypes,
          minutes: Math.max(0, Math.floor(carsForm.minutes)),
        },
        ...current.carsEntries,
      ],
    }));
    setCarsForm((current) => ({ ...current, questionsCorrect: 0, errorTypes: [] }));
  };

  const deleteSession = (id: string) => {
    setState((current) => ({ ...current, sessions: current.sessions.filter((s) => s.id !== id) }));
  };
  const deleteError = (id: string) => {
    setState((current) => ({ ...current, errors: current.errors.filter((e) => e.id !== id) }));
  };
  const toggleErrorResolved = (id: string) => {
    setState((current) => ({
      ...current,
      errors: current.errors.map((e) => (e.id === id ? { ...e, resolved: !e.resolved } : e)),
    }));
  };
  const deleteCarsEntry = (id: string) => {
    setState((current) => ({
      ...current,
      carsEntries: current.carsEntries.filter((e) => e.id !== id),
    }));
  };

  const markRetested = (topicId: string, rating: McatSrsRating) => {
    const topic = topicById.get(topicId);
    if (!topic) return;
    updateTopic(topicId, applyMcatSrsReview(topic, rating, todayKey));
  };

  const handleCopy = (kind: "tutor" | "weekly", text: string) => {
    copyText(text, () => {
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1800);
    });
  };

  // Prefer the active plan instance; otherwise recover from old generated task
  // metadata; otherwise the earliest old due_date; finally fall back to today.
  const recoveredSeedStartDate = useMemo(() => {
    if (activePhase0Plan?.seed_start_date) return activePhase0Plan.seed_start_date;
    if (!legacySeededPhaseTasks.length) return null;
    for (const task of legacySeededPhaseTasks) {
      const meta = task.generated_from as { seed_start_date?: unknown } | null | undefined;
      const candidate = meta && typeof meta.seed_start_date === "string" ? meta.seed_start_date : null;
      if (candidate) return candidate;
    }
    const earliest = legacySeededPhaseTasks
      .map((task) => task.due_date)
      .filter((d): d is string => Boolean(d))
      .sort()[0];
    return earliest ?? null;
  }, [activePhase0Plan, legacySeededPhaseTasks]);
  const effectiveSeedStartDate = recoveredSeedStartDate ?? todayKey;
  const phase0SeedSummary = useMemo(
    () =>
      summarizeMcatPlanOccurrenceStatus(phase0Occurrences, {
        today: todayKey,
      }),
    [phase0Occurrences],
  );
  const previewOccurrence = useMemo(
    () => {
      const generated = generateMcatPhase0PlanOccurrences(effectiveSeedStartDate, {
        today: todayKey,
        planInstanceId: activePhase0Plan?.id ?? null,
      });
      return pickTodayMcatOccurrence(generated, todayKey);
    },
    [effectiveSeedStartDate, activePhase0Plan?.id],
  );
  const todayPlanOccurrence = useMemo(
    () => pickTodayMcatOccurrence(phase0Occurrences, todayKey) ?? previewOccurrence,
    [phase0Occurrences, previewOccurrence],
  );
  const todayCommittedTask = useMemo(
    () =>
      committedMcatTasks.find((task) => task.id === todayPlanOccurrence?.linked_task_id) ??
      committedMcatTasks.find((task) => task.due_date === todayKey) ??
      null,
    [committedMcatTasks, todayPlanOccurrence?.linked_task_id],
  );
  const todayCommand = useMemo(
    () =>
      buildMcatTodayCommand({
        occurrence: todayPlanOccurrence,
        fallbackTitle: todayMove.title,
        fallbackDetail: todayMove.detail,
        hasActiveSession: Boolean(activeSession),
        hasLoggedToday: todaySessions.length > 0 || todayCars.length > 0,
      }),
    [activeSession, todayCars.length, todayMove.detail, todayMove.title, todayPlanOccurrence, todaySessions.length],
  );

  const handleSeedPhase0Tasks = async () => {
    if (!hasSupabaseConfig || !userId) {
      setPhaseSeedMessage(null);
      setPhaseSeedError("Log in to start the MCAT Phase 0 plan.");
      return;
    }

    setPhaseSeedStatus("seeding");
    setPhaseSeedMessage(null);
    setPhaseSeedError(null);

    try {
      let plan = activePhase0Plan;
      if (!plan) {
        const seedStartDate = todayKey;
        const seedStart = new Date(`${seedStartDate}T00:00:00Z`);
        const seedEnd = new Date(seedStart.getTime() + 69 * 24 * 60 * 60 * 1000);
        const seedEndDate = `${seedEnd.getUTCFullYear()}-${String(
          seedEnd.getUTCMonth() + 1,
        ).padStart(2, "0")}-${String(seedEnd.getUTCDate()).padStart(2, "0")}`;
        plan = await createMcatPlanInstance({
          userId,
          templateKey: MCAT_PHASE_0_TEMPLATE_KEY,
          phaseName: MCAT_PHASE_0_TEMPLATE.phase_name,
          seedStartDate,
          seedEndDate,
          totalPlannedMinutes: MCAT_PHASE_0_TEMPLATE.total_planned_minutes,
        });
        setActivePhase0Plan(plan);
      }
      const seedStartDate = plan.seed_start_date;

      const existingOccurrences = await fetchMcatPlanOccurrences({
        userId,
        planInstanceId: plan.id,
      });
      const existingDays = new Set(existingOccurrences.map((occurrence) => occurrence.template_day_index));
      const missingOccurrences = generateMcatPhase0PlanOccurrences(seedStartDate, {
        today: todayKey,
        planInstanceId: plan.id,
      }).filter((occurrence) => !existingDays.has(occurrence.template_day_index));

      if (missingOccurrences.length === 0) {
        setPhase0Occurrences(sortTemplateOccurrences(existingOccurrences));
        setPhaseSeedStatus("saved");
        setPhaseSeedMessage("MCAT Phase 0 plan already started.");
        return;
      }

      const savedOccurrences = await upsertMcatPlanOccurrences(userId, missingOccurrences);
      const nextOccurrences = sortTemplateOccurrences([
        ...existingOccurrences,
        ...savedOccurrences.filter(
          (saved) =>
            !existingOccurrences.some(
              (existing) => existing.template_day_index === saved.template_day_index,
            ),
        ),
      ]);
      setPhase0Occurrences(nextOccurrences);
      setPhaseSeedStatus("saved");
      setPhaseSeedMessage(
        savedOccurrences.length === 70
          ? "Generated 70 MCAT Phase 0 plan days."
          : `Generated ${savedOccurrences.length} missing MCAT Phase 0 plan day(s).`,
      );
    } catch (error) {
      setPhaseSeedStatus("error");
      setPhaseSeedError(readErrorMessage(error, "Unable to start MCAT Phase 0 plan."));
    }
  };

  const handleCommitTodayOccurrence = async () => {
    if (!hasSupabaseConfig || !userId) {
      setCommitStatus("error");
      setCommitMessage("Log in to commit MCAT work to Daily OS.");
      return;
    }
    if (!todayPlanOccurrence || !activePhase0Plan || phase0Occurrences.length === 0) {
      setCommitStatus("error");
      setCommitMessage("Start the Phase 0 plan before committing a study block.");
      return;
    }
    if (todayPlanOccurrence.linked_task_id && todayCommittedTask) {
      setCommitStatus("saved");
      setCommitMessage("Already committed.");
      return;
    }

    setCommitStatus("committing");
    setCommitMessage(null);
    try {
      const existingTasks = await fetchUniversalTasks(userId);
      const result = commitMcatPlanOccurrenceToTask(todayPlanOccurrence, existingTasks, {
        today: todayKey,
      });
      const savedTask = await upsertUniversalTask(userId, result.task, 6);
      const occurrenceToSave: McatPlanOccurrence = {
        ...result.occurrence,
        linked_task_id: savedTask.id,
        status: "committed",
        generated_from: {
          ...result.occurrence.generated_from,
          committed_task_id: savedTask.id,
        },
      };
      const savedOccurrence = await updateMcatPlanOccurrence(userId, occurrenceToSave);
      setPhase0Occurrences((current) =>
        sortTemplateOccurrences(
          current.map((occurrence) =>
            occurrence.id === savedOccurrence.id ? savedOccurrence : occurrence,
          ),
        ),
      );
      setCommittedMcatTasks((current) =>
        sortTemplateTasks([
          savedTask,
          ...current.filter((task) => task.id !== savedTask.id),
        ]),
      );
      setLegacySeededPhaseTasks((current) =>
        current.filter((task) => task.id !== savedTask.id),
      );
      mergeTasksIntoLocalCache([savedTask]);
      setCommitStatus("saved");
      setCommitMessage("Committed to Daily OS.");
    } catch (error) {
      setCommitStatus("error");
      setCommitMessage(readErrorMessage(error, "Unable to commit MCAT work to Daily OS."));
    }
  };

  const carsAccuracy = useMemo(() => {
    const attempted = state.carsEntries.reduce((sum, e) => sum + e.questionsAttempted, 0);
    const correct = state.carsEntries.reduce((sum, e) => sum + e.questionsCorrect, 0);
    return formatAccuracy(correct, attempted);
  }, [state.carsEntries]);

  const goalPct = Math.min(100, Math.round((todayMinutes / DAILY_GOAL_MINUTES) * 100));
  const visibleSyncStatus: McatSyncStatus =
    sessionLoading || syncStatus === "loading"
      ? "loading"
      : !hasSupabaseConfig || !userId
        ? "local"
        : syncStatus;
  const commandTopicId = todayMoveTopic?.id ?? studyNowTopic?.id ?? firstTopicId;
  const isTodayOccurrenceCommitted = Boolean(
    todayPlanOccurrence?.linked_task_id && todayCommittedTask,
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageDecisionHeader title="MCAT" question="What should I study right now?">
        <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {state.stage}
        </span>
        <span
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold",
            syncClass(visibleSyncStatus, userId),
          )}
          title={visibleSyncStatus === "error" ? syncError ?? undefined : undefined}
        >
          {syncLabel(visibleSyncStatus, hasSupabaseConfig, userId)}
        </span>
      </PageDecisionHeader>

      <McatTodayCommandCard
        command={todayCommand}
        isCommitted={isTodayOccurrenceCommitted}
        canCommit={Boolean(activePhase0Plan && phase0Occurrences.length > 0 && todayPlanOccurrence)}
        commitStatus={commitStatus}
        commitMessage={commitMessage}
        onStart={() => commandTopicId && startSession(commandTopicId)}
        onCommit={handleCommitTodayOccurrence}
        onViewDetails={() => commandTopicId && setTopicDetailId(commandTopicId)}
      />

      <ActiveSessionCard
        activeSession={activeSession}
        elapsedMs={elapsedMs}
        activeTopic={activeTopic}
        topics={state.topics}
        onStart={startSession}
        onPause={pauseSession}
        onResume={resumeSession}
        onStop={stopSession}
        onCancel={cancelSession}
        onChangeTopic={(topicId) =>
          setActiveSession((current) =>
            current ? { ...current, topicId } : current,
          )
        }
        defaultTopicId={commandTopicId}
      />

      <McatPhase0ScheduleCard
        summary={phase0SeedSummary}
        seedStatus={phaseSeedStatus}
        seedMessage={phaseSeedMessage}
        seedError={phaseSeedError}
        hasSupabaseConfig={hasSupabaseConfig}
        userId={userId}
        sessionLoading={sessionLoading}
        todayOccurrence={todayPlanOccurrence}
        todayCommittedTask={todayCommittedTask}
        legacySeededTaskCount={legacySeededPhaseTasks.length}
        activePlan={activePhase0Plan}
        todayKey={todayKey}
        onSeed={handleSeedPhase0Tasks}
      />

      <CollapsibleSection title="Roadmap" subtitle="Phase gates and locked future phases" defaultOpen={false}>
        <McatRoadmapCard />
      </CollapsibleSection>

      <CollapsibleSection title="Metrics" subtitle="Study pace, accuracy, CARS, and cards" defaultOpen={false}>
        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <HeroStat
            icon={<Flag size={14} />}
            label="Streak"
            value={`${streak} day${streak === 1 ? "" : "s"}`}
            tone={streak >= 3 ? "good" : streak === 0 ? "muted" : "warn"}
          />
          <HeroStat
            icon={<Clock size={14} />}
            label="Today"
            value={`${todayMinutes} / ${DAILY_GOAL_MINUTES} min`}
            tone={goalPct >= 100 ? "good" : goalPct >= 50 ? "warn" : "muted"}
            progress={goalPct}
          />
          <HeroStat
            icon={<TrendingUp size={14} />}
            label="Week accuracy"
            value={summary.questionsAttempted > 0 ? `${summary.accuracy}%` : "Not enough data yet"}
            sub={
              summary.questionsAttempted > 0
                ? formatMcatAccuracyTrendLabel({
                    currentAttempted: summary.questionsAttempted,
                    previousAttempted: summary.previousQuestionsAttempted,
                    trend: summary.accuracyTrend,
                  })
                : undefined
            }
          />
          <HeroStat
            icon={<FlaskConical size={14} />}
            label="CARS this wk"
            value={`${summary.carsPassageCountThisWeek}`}
            tone={summary.carsPassageCountThisWeek === 0 ? "warn" : "good"}
          />
          <HeroStat
            icon={<Layers size={14} />}
            label="Flashcards due"
            value={`${summary.flashcardsDue}`}
          />
        </section>
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Foundation</span>
            <span>{foundationProgress}% complete</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${foundationProgress}%` }}
            />
          </div>
        </div>
      </CollapsibleSection>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-flex">
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="practice">Practice</TabsTrigger>
          <TabsTrigger value="topics">Topics</TabsTrigger>
          <TabsTrigger value="cars">CARS</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="card-surface p-4">
              <div className="mb-3 flex items-center gap-2">
                <Target size={16} className="text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Review Queue</h2>
              </div>
              <div className="space-y-2">
                {highLeverageQueue.slice(0, 4).map(({ topic, leverage }) => (
                  <button
                    key={topic.id}
                    onClick={() => setTopicDetailId(topic.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/60"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{topic.title}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {topicRecommendationReason(topic)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px]", priorityClass(topic.priorityLabel))}>
                        {topic.priorityLabel}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Leverage {leverage.toFixed(2)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="card-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpenCheck size={16} className="text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Today's Log</h2>
                </div>
                <button
                  className="btn-secondary px-2.5 py-1 text-xs"
                  onClick={() => openLogDialog()}
                >
                  <Plus size={13} className="mr-1" />
                  Log session
                </button>
              </div>

              {todaySessions.length === 0 && todayCars.length === 0 ? (
                <div className="empty-state">
                  Nothing logged yet today. Start the timer above or log a session manually.
                </div>
              ) : (
                <div className="space-y-2">
                  {todaySessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {topicById.get(session.topicId)?.title ?? "Unknown topic"}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {session.minutes} min · {formatAccuracy(session.questionsCorrect, session.questionsAttempted)} ·{" "}
                          {session.questionsAttempted}Q
                        </div>
                      </div>
                      <button
                        className="text-muted-foreground hover:text-rose-600"
                        onClick={() => deleteSession(session.id)}
                        aria-label="Delete session"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {todayCars.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">
                          CARS · {entry.passages} passage{entry.passages === 1 ? "" : "s"}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {entry.minutes} min · {formatAccuracy(entry.questionsCorrect, entry.questionsAttempted)}
                        </div>
                      </div>
                      <button
                        className="text-muted-foreground hover:text-rose-600"
                        onClick={() => deleteCarsEntry(entry.id)}
                        aria-label="Delete CARS entry"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card-surface p-4">
            <div className="mb-3 flex items-center gap-2">
              <CalendarClock size={16} className="text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Retest queue</h2>
            </div>
            {retestQueue.length === 0 ? (
              <div className="empty-state">
                Nothing to retest yet. Log a few sessions and retest priorities will fill in.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {retestQueue.slice(0, 6).map(({ topic, retestPriority }) => (
                  <div
                    key={topic.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
                  >
                    <button
                      className="min-w-0 text-left"
                      onClick={() => setTopicDetailId(topic.id)}
                    >
                      <div className="truncate text-sm font-semibold text-foreground">{topic.title}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {retestPriority >= 7 ? "Needs reinforcement" : "Keep warm"} ·{" "}
                        {topic.lastReviewed ? `last revisited ${topic.lastReviewed}` : "never revisited"}
                      </div>
                    </button>
                    <div className="flex flex-wrap justify-end gap-1">
                      {([1, 2, 3, 4] as const).map((rating) => (
                        <button
                          key={rating}
                          className="rounded-md border border-border bg-muted/40 px-2 py-1 text-[10px] text-foreground hover:bg-muted"
                          onClick={() => markRetested(topic.id, rating)}
                        >
                          {rating}-{rating === 1 ? "Again" : rating === 2 ? "Hard" : rating === 3 ? "Good" : "Easy"}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="practice" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="card-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpenCheck size={16} className="text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">All sessions</h2>
                </div>
                <button className="btn-secondary px-2.5 py-1 text-xs" onClick={() => openLogDialog()}>
                  <Plus size={13} className="mr-1" />
                  Log session
                </button>
              </div>
              {state.sessions.length === 0 ? (
                <div className="empty-state">
                  No sessions yet. Use the timer on Today or click "Log session".
                </div>
              ) : (
                <div className="max-h-[480px] space-y-2 overflow-auto pr-1">
                  {state.sessions.map((session) => (
                    <div
                      key={session.id}
                      className="rounded-lg border border-border bg-card p-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <button
                          className="text-left"
                          onClick={() => setTopicDetailId(session.topicId)}
                        >
                          <div className="text-sm font-semibold text-foreground">
                            {topicById.get(session.topicId)?.title ?? "Unknown topic"}
                          </div>
                          <div className="mt-0.5 text-muted-foreground">
                            {session.date} · {session.minutes} min ·{" "}
                            {formatAccuracy(session.questionsCorrect, session.questionsAttempted)} ·{" "}
                            {session.questionsAttempted}Q
                          </div>
                        </button>
                        <button
                          className="text-muted-foreground hover:text-rose-600"
                          onClick={() => deleteSession(session.id)}
                          aria-label="Delete session"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {session.mistakeTypes.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {session.mistakeTypes.map((t) => (
                            <span
                              key={t}
                              className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {session.notes ? (
                        <div className="mt-2 text-muted-foreground">{session.notes}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card-surface p-4">
              <div className="mb-3 flex items-center gap-2">
                <AlertCircle size={16} className="text-amber-600" />
                <h2 className="text-sm font-semibold text-foreground">Error log</h2>
              </div>
              <div className="space-y-3">
                <select
                  className="input-dark w-full"
                  value={errorForm.topicId}
                  onChange={(event) =>
                    setErrorForm((current) => ({ ...current, topicId: event.target.value }))
                  }
                >
                  {[...state.topics]
                    .sort((a, b) => a.title.localeCompare(b.title))
                    .map((topic) => (
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
                  <optgroup label="MCAT">
                    {MCAT_ERROR_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="CARS">
                    {CARS_ERROR_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <textarea
                  className="input-dark min-h-20 w-full"
                  placeholder="Write the exact miss or gap."
                  value={errorForm.note}
                  onChange={(event) => setErrorForm((current) => ({ ...current, note: event.target.value }))}
                />
                <button className="btn-secondary flex w-full items-center justify-center gap-2" onClick={addError}>
                  <Plus size={15} />
                  Add error
                </button>
              </div>

              <div className="mt-4 max-h-[280px] space-y-2 overflow-auto pr-1">
                {state.errors.length === 0 ? (
                  <div className="empty-state">
                    No errors logged. Classify each miss when it happens.
                  </div>
                ) : (
                  state.errors.map((error) => (
                    <div
                      key={error.id}
                      className={cn(
                        "rounded-lg border p-3 text-xs",
                        error.resolved
                          ? "border-emerald-500/25 bg-emerald-500/5"
                          : "border-border bg-card",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleErrorResolved(error.id)}
                            aria-label={error.resolved ? "Mark unresolved" : "Mark resolved"}
                            className={cn(
                              "transition-colors",
                              error.resolved ? "text-emerald-600" : "text-muted-foreground hover:text-emerald-600",
                            )}
                          >
                            {error.resolved ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                          </button>
                          <span className="font-semibold text-foreground">{error.type}</span>
                        </div>
                        <button
                          className="text-muted-foreground hover:text-rose-600"
                          onClick={() => deleteError(error.id)}
                          aria-label="Delete error"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        <button onClick={() => setTopicDetailId(error.topicId)} className="underline-offset-2 hover:underline">
                          {topicById.get(error.topicId)?.title ?? "Unknown topic"}
                        </button>{" "}
                        · {error.date}
                      </div>
                      {error.note ? <div className="mt-1 text-foreground/80">{error.note}</div> : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="topics" className="mt-4 space-y-4">
          <TopicsTab
            state={state}
            onSelectTopic={setTopicDetailId}
            onUpdateTopic={updateTopic}
          />
        </TabsContent>

        <TabsContent value="cars" className="mt-4 space-y-4">
          <CarsTab
            state={state}
            carsForm={carsForm}
            setCarsForm={setCarsForm}
            onSubmit={addCarsEntry}
            onDelete={deleteCarsEntry}
            carsAccuracy={carsAccuracy}
            summary={summary}
          />
        </TabsContent>

        <TabsContent value="review" className="mt-4 space-y-4">
          <ReviewTab
            summary={summary}
            dailySeries={dailySeries}
            weeklyAccuracy={weeklyAccuracy}
            mistakeBreakdown={mistakeBreakdown}
            onCopy={handleCopy}
            copied={copied}
          />
        </TabsContent>
      </Tabs>

      <LogSessionDialog
        open={logDialogOpen}
        onOpenChange={(open) => {
          setLogDialogOpen(open);
          if (!open) setLogPrefill(null);
        }}
        form={sessionForm}
        setForm={setSessionForm}
        topics={state.topics}
        prefill={logPrefill}
        onSubmit={submitLogSession}
      />

      <TopicDetailDialog
        topicId={topicDetailId}
        state={state}
        onClose={() => setTopicDetailId(null)}
        onStart={(id) => {
          setTopicDetailId(null);
          startSession(id);
        }}
        onRetest={(id, rating) => markRetested(id, rating)}
        onUpdateStatus={(id, status) => updateTopic(id, { status })}
      />
    </div>
  );
}

/* ------------------------------- Hero stat ------------------------------- */

function HeroStat({
  icon,
  label,
  value,
  sub,
  tone = "neutral",
  progress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn" | "muted" | "neutral";
  progress?: number;
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "warn"
        ? "text-amber-700 dark:text-amber-300"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="card-surface p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="text-primary">{icon}</span>
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className={cn("mt-1.5 text-base font-semibold", toneClass)}>{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div> : null}
      {typeof progress === "number" ? (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              progress >= 100 ? "bg-emerald-600" : "bg-primary",
            )}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------- Active session ---------------------------- */

function ActiveSessionCard({
  activeSession,
  elapsedMs,
  activeTopic,
  topics,
  onStart,
  onPause,
  onResume,
  onStop,
  onCancel,
  onChangeTopic,
  defaultTopicId,
}: {
  activeSession: ActiveMcatSession | null;
  elapsedMs: number;
  activeTopic: McatTopic | null;
  topics: McatTopic[];
  onStart: (topicId: string) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onCancel: () => void;
  onChangeTopic: (topicId: string) => void;
  defaultTopicId: string;
}) {
  if (!activeSession) {
    return <IdleStartCard topics={topics} defaultTopicId={defaultTopicId} onStart={onStart} />;
  }

  return (
    <div className="card-elevated p-5">
      <div className="flex flex-wrap items-center gap-4">
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl",
            activeSession.isRunning
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
          )}
        >
          {activeSession.isRunning ? <Play size={20} /> : <Pause size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {activeSession.isRunning ? "In session" : "Paused"}
          </div>
          <div className="mt-1 text-base font-semibold text-foreground">
            {activeTopic?.title ?? "Unknown topic"}
          </div>
          {activeTopic ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className={cn("rounded-full border px-2 py-0.5", priorityClass(activeTopic.priorityLabel))}>
                {activeTopic.priorityLabel}
              </span>
              <span>{activeTopic.unit}</span>
            </div>
          ) : null}
          <CollapsibleSection title="Browse all topics" className="mt-3">
            <label htmlFor="mcat-active-topic-picker" className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
              Topic
            </label>
            <select
              id="mcat-active-topic-picker"
              className="input-dark w-full max-w-md text-sm"
              value={activeSession.topicId}
              onChange={(e) => onChangeTopic(e.target.value)}
            >
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </CollapsibleSection>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="font-mono-data text-3xl font-semibold tabular-nums text-foreground">
            {formatHms(elapsedMs)}
          </div>
          <div className="flex items-center gap-2">
            {activeSession.isRunning ? (
              <button className="btn-secondary px-3 py-1.5 text-xs" onClick={onPause}>
                <Pause size={13} className="mr-1" />
                Pause
              </button>
            ) : (
              <button className="btn-secondary px-3 py-1.5 text-xs" onClick={onResume}>
                <Play size={13} className="mr-1" />
                Resume
              </button>
            )}
            <button className="btn-primary px-3 py-1.5 text-xs" onClick={onStop}>
              <Square size={13} className="mr-1" />
              Log
            </button>
            <button
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-rose-600"
              onClick={onCancel}
              aria-label="Cancel session"
              title="Cancel without logging"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IdleStartCard({
  topics,
  defaultTopicId,
  onStart,
}: {
  topics: McatTopic[];
  defaultTopicId: string;
  onStart: (topicId: string) => void;
}) {
  const [pickerTopicId, setPickerTopicId] = useState(defaultTopicId);
  const defaultTopic = topics.find((t) => t.id === defaultTopicId) ?? null;
  return (
    <div className="card-elevated p-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Play size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">Start a focused session</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {defaultTopic
              ? `Recommended: ${defaultTopic.title}. Start the timer and log it when you're done.`
              : "Pick a topic, start the timer, and log it when you're done."}
          </p>
        </div>
        <button
          className="btn-primary whitespace-nowrap"
          onClick={() => onStart(pickerTopicId)}
          disabled={!pickerTopicId}
        >
          <Play size={15} className="mr-1.5" />
          Study Now
        </button>
      </div>
      <CollapsibleSection title="Browse all topics" className="mt-3">
        <label htmlFor="mcat-topic-picker" className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
          Topic
        </label>
        <select
          id="mcat-topic-picker"
          className="input-dark w-full"
          value={pickerTopicId}
          onChange={(e) => setPickerTopicId(e.target.value)}
        >
          {topics
            .filter((t) => t.priorityLabel !== "Delay Until Coursework")
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          Changing this updates what "Start session" launches.
        </p>
      </CollapsibleSection>
    </div>
  );
}

/* -------------------------------- Topics tab ------------------------------ */

const SORT_OPTIONS = [
  { value: "decision", label: "Study decision" },
  { value: "weakness", label: "Weakness" },
  { value: "alpha", label: "A → Z" },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]["value"];

function TopicsTab({
  state,
  onSelectTopic,
  onUpdateTopic,
}: {
  state: McatFoundationState;
  onSelectTopic: (id: string) => void;
  onUpdateTopic: (id: string, patch: Partial<McatTopic>) => void;
}) {
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<McatPriorityLabel | "all">("all");
  const [statusFilter, setStatusFilter] = useState<McatTopicStatus | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("decision");
  const [openUnits, setOpenUnits] = useState<Record<string, boolean>>({});

  const summary = useMemo(() => getMcatSummary(state), [state]);
  const decisionByTopicId = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of summary.scoredTopics) map.set(s.topic.id, s.studyDecision);
    return map;
  }, [summary.scoredTopics]);

  const filtered = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return state.topics.filter((topic) => {
      if (lower && !topic.title.toLowerCase().includes(lower) && !topic.unit.toLowerCase().includes(lower)) return false;
      if (priorityFilter !== "all" && topic.priorityLabel !== priorityFilter) return false;
      if (statusFilter !== "all" && topic.status !== statusFilter) return false;
      return true;
    });
  }, [state.topics, search, priorityFilter, statusFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, McatTopic[]> = {};
    for (const topic of filtered) {
      groups[topic.unit] = groups[topic.unit] ? [...groups[topic.unit], topic] : [topic];
    }
    for (const unit of Object.keys(groups)) {
      groups[unit] = [...groups[unit]].sort((a, b) => {
        if (sortKey === "weakness") return b.weakness - a.weakness;
        if (sortKey === "alpha") return a.title.localeCompare(b.title);
        return (decisionByTopicId.get(b.id) ?? 0) - (decisionByTopicId.get(a.id) ?? 0);
      });
    }
    return groups;
  }, [filtered, sortKey, decisionByTopicId]);

  const toggleUnit = (unit: string) =>
    setOpenUnits((current) => ({ ...current, [unit]: !current[unit] }));

  const expandAll = () => {
    const all: Record<string, boolean> = {};
    for (const unit of Object.keys(grouped)) all[unit] = true;
    setOpenUnits(all);
  };
  const collapseAll = () => setOpenUnits({});

  const totalShown = filtered.length;

  return (
    <>
      <div className="card-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              placeholder="Search topics or units"
              className="input-dark pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input-dark w-[180px]"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as typeof priorityFilter)}
          >
            <option value="all">All priorities</option>
            {MCAT_PRIORITY_LABELS.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="input-dark w-[160px]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="all">All statuses</option>
            {MCAT_TOPIC_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select
            className="input-dark w-[160px]"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Sort: {opt.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <button className="btn-secondary px-2.5 py-1 text-xs" onClick={expandAll}>
              Expand all
            </button>
            <button className="btn-secondary px-2.5 py-1 text-xs" onClick={collapseAll}>
              Collapse
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Filter size={12} />
          <span>{totalShown} topic{totalShown === 1 ? "" : "s"} shown</span>
          {(search || priorityFilter !== "all" || statusFilter !== "all") && (
            <button
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => {
                setSearch("");
                setPriorityFilter("all");
                setStatusFilter("all");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {Object.entries(grouped).map(([unit, topics]) => {
          const isOpen = openUnits[unit] ?? false;
          const studyNowCount = topics.filter((t) => t.priorityLabel === "Study Now").length;
          const delayedCount = topics.filter((t) => t.priorityLabel === "Delay Until Coursework").length;
          return (
            <Collapsible key={unit} open={isOpen} onOpenChange={() => toggleUnit(unit)}>
              <div className="card-surface overflow-hidden">
                <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/40">
                  <div className="flex min-w-0 items-center gap-3">
                    <ChevronDown
                      size={14}
                      className={cn(
                        "text-muted-foreground transition-transform",
                        isOpen ? "rotate-0" : "-rotate-90",
                      )}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{unit}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                        <span>{topics.length} topics</span>
                        {studyNowCount > 0 ? <span>· {studyNowCount} study now</span> : null}
                        {delayedCount > 0 ? <span>· {delayedCount} delayed</span> : null}
                      </div>
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t border-border bg-muted/20 p-2">
                    {topics.map((topic) => (
                      <div
                        key={topic.id}
                        className="grid grid-cols-1 gap-2 rounded-lg p-2 text-sm transition-colors hover:bg-card md:grid-cols-[1fr_180px_140px_36px] md:items-center"
                      >
                        <button
                          className="min-w-0 text-left"
                          onClick={() => onSelectTopic(topic.id)}
                        >
                          <div className="truncate font-medium text-foreground">{topic.title}</div>
                          <div className="mt-0.5 flex flex-wrap gap-1.5">
                            <span className={cn("rounded-full border px-2 py-0.5 text-[10px]", priorityClass(topic.priorityLabel))}>
                              {topic.priorityLabel}
                            </span>
                            <span className={cn("rounded-full border px-2 py-0.5 text-[10px]", statusBadge(topic.status))}>
                              {topic.status}
                            </span>
                          </div>
                        </button>
                        <select
                          className="input-dark text-xs"
                          value={topic.status}
                          onChange={(event) =>
                            onUpdateTopic(topic.id, { status: event.target.value as McatTopicStatus })
                          }
                          onClick={(e) => e.stopPropagation()}
                        >
                          {MCAT_TOPIC_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                        <div className="font-mono-data text-xs text-muted-foreground">
                          {topic.questionsAttempted > 0
                            ? `${formatAccuracy(topic.questionsCorrect, topic.questionsAttempted)} · ${topic.questionsAttempted}Q`
                            : "no data"}
                        </div>
                        <div className="text-right">
                          <span className="font-mono-data text-xs text-primary">
                            {(decisionByTopicId.get(topic.id) ?? 0).toFixed(1)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
        {totalShown === 0 ? (
          <div className="empty-state">No topics match your filters.</div>
        ) : null}
      </div>
    </>
  );
}

/* --------------------------------- CARS tab ------------------------------- */

function CarsTab({
  state,
  carsForm,
  setCarsForm,
  onSubmit,
  onDelete,
  carsAccuracy,
  summary,
}: {
  state: McatFoundationState;
  carsForm: CarsFormState;
  setCarsForm: React.Dispatch<React.SetStateAction<CarsFormState>>;
  onSubmit: () => void;
  onDelete: (id: string) => void;
  carsAccuracy: string;
  summary: ReturnType<typeof getMcatSummary>;
}) {
  const passagesPerWeek = useMemo(() => {
    const out: Array<{ label: string; passages: number }> = [];
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const ref = new Date(today);
      ref.setDate(ref.getDate() - i * 7);
      const start = new Date(ref);
      const day = start.getDay();
      start.setDate(start.getDate() - day + (day === 0 ? -6 : 1));
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      let passages = 0;
      for (const entry of state.carsEntries) {
        const d = new Date(`${entry.date}T00:00:00`);
        if (d >= start && d < end) passages += entry.passages;
      }
      out.push({
        label: start.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }),
        passages,
      });
    }
    return out;
  }, [state.carsEntries]);

  const toggleErr = (t: CarsErrorType) =>
    setCarsForm((current) => ({
      ...current,
      errorTypes: current.errorTypes.includes(t)
        ? current.errorTypes.filter((x) => x !== t)
        : [...current.errorTypes, t],
    }));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.1fr]">
      <div className="card-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <FlaskConical size={16} className="text-violet-500" />
          <h2 className="text-sm font-semibold text-foreground">Log a CARS session</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Passages"
            value={carsForm.passages}
            onChange={(passages) => setCarsForm((c) => ({ ...c, passages }))}
          />
          <NumberField
            label="Minutes"
            value={carsForm.minutes}
            onChange={(minutes) => setCarsForm((c) => ({ ...c, minutes }))}
          />
          <NumberField
            label="Questions attempted"
            value={carsForm.questionsAttempted}
            onChange={(questionsAttempted) => setCarsForm((c) => ({ ...c, questionsAttempted }))}
          />
          <NumberField
            label="Questions correct"
            value={carsForm.questionsCorrect}
            onChange={(questionsCorrect) => setCarsForm((c) => ({ ...c, questionsCorrect }))}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Accuracy is optional. Set questions attempted to 0 if you only want to track passages and miss types.
        </p>
        <div className="mt-3">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">CARS miss types</div>
          <div className="flex flex-wrap gap-2">
            {CARS_ERROR_TYPES.map((t) => {
              const active = carsForm.errorTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleErr(t)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    active
                      ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <button className="btn-primary mt-3 flex w-full items-center justify-center gap-2" onClick={onSubmit}>
          <Check size={15} />
          Log CARS passage
        </button>

        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <Metric label="This week" value={`${summary.carsPassageCountThisWeek}`} />
          <Metric label="CARS risk" value={summary.carsRisk.toFixed(1)} />
          <Metric label="All-time accuracy" value={carsAccuracy} />
        </div>
      </div>

      <div className="card-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp size={16} className="text-violet-500" />
          <h2 className="text-sm font-semibold text-foreground">Passages per week</h2>
        </div>
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={passagesPerWeek} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="rgba(111, 104, 95, 0.14)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} width={28} />
              <RechartsTooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                cursor={{ fill: "rgba(154, 123, 189, 0.08)" }}
              />
              <Bar dataKey="passages" fill="#9a7bbd" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 max-h-[300px] space-y-2 overflow-auto pr-1">
          {state.carsEntries.length === 0 ? (
            <div className="empty-state">
              No CARS entries yet. Log one untimed passage to start a baseline.
            </div>
          ) : (
            state.carsEntries.map((entry) => (
              <div key={entry.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3 text-xs">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">
                    {entry.date} · {entry.passages} passage{entry.passages === 1 ? "" : "s"}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {entry.minutes} min · {formatAccuracy(entry.questionsCorrect, entry.questionsAttempted)} · {entry.questionsAttempted}Q
                  </div>
                  {entry.errorTypes.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {entry.errorTypes.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-violet-500/20 bg-violet-500/5 px-2 py-0.5 text-[10px] text-violet-700 dark:text-violet-300"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button
                  className="text-muted-foreground hover:text-rose-600"
                  onClick={() => onDelete(entry.id)}
                  aria-label="Delete CARS entry"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Review tab ------------------------------ */

function ReviewTab({
  summary,
  dailySeries,
  weeklyAccuracy,
  mistakeBreakdown,
  onCopy,
  copied,
}: {
  summary: ReturnType<typeof getMcatSummary>;
  dailySeries: ReturnType<typeof getDailyMinutesSeries>;
  weeklyAccuracy: ReturnType<typeof getWeeklyAccuracySeries>;
  mistakeBreakdown: ReturnType<typeof getMistakeBreakdown>;
  onCopy: (kind: "tutor" | "weekly", text: string) => void;
  copied: "tutor" | "weekly" | null;
}) {
  const weeklyStats = {
    topicsStudied: summary.topicsStudiedThisWeek.join(", ") || "None yet",
    sessions: summary.sessionsThisWeek.length,
    minutes: summary.minutesThisWeek,
    accuracy: summary.questionsAttempted > 0 ? `${summary.accuracy}%` : "—",
    mistakeTypes:
      Object.entries(summary.mistakeTypeCounts)
        .map(([type, count]) => `${type}: ${count}`)
        .join(", ") || "None logged",
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Sessions" value={String(weeklyStats.sessions)} />
        <Metric label="Minutes" value={String(weeklyStats.minutes)} />
        <Metric label="Accuracy" value={weeklyStats.accuracy} />
        <Metric label="Topics studied" value={String(summary.topicsStudiedThisWeek.length)} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="card-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Accuracy by week</h2>
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyAccuracy} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="rgba(111, 104, 95, 0.14)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis domain={[0, 100]} tickLine={false} axisLine={false} fontSize={11} width={32} />
                <RechartsTooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [`${value}%`, "Accuracy"]}
                />
                <Line
                  type="monotone"
                  dataKey="accuracy"
                  stroke="#6b87ae"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#6b87ae" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <Clock size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Daily minutes (14 days)</h2>
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailySeries} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="rgba(111, 104, 95, 0.14)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={28} />
                <RechartsTooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  cursor={{ fill: "rgba(107, 135, 174, 0.08)" }}
                  formatter={(value: number) => [`${value} min`, "Minutes"]}
                />
                <Bar dataKey="minutes" fill="#6b87ae" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="card-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-600" />
            <h2 className="text-sm font-semibold text-foreground">Mistakes (last 30 days)</h2>
          </div>
          {mistakeBreakdown.length === 0 ? (
            <div className="empty-state">No mistakes logged yet. Classify each miss when it happens.</div>
          ) : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={mistakeBreakdown.slice(0, 8)}
                  margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
                  layout="vertical"
                >
                  <CartesianGrid stroke="rgba(111, 104, 95, 0.14)" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis
                    dataKey="type"
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    width={140}
                    fontSize={11}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    cursor={{ fill: "rgba(195, 154, 78, 0.08)" }}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {mistakeBreakdown.slice(0, 8).map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <Clipboard size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Weekly summary</h2>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
            <div className="text-foreground"><span className="text-muted-foreground">Topics studied: </span>{weeklyStats.topicsStudied}</div>
            <div className="mt-1.5 text-foreground"><span className="text-muted-foreground">Mistake types: </span>{weeklyStats.mistakeTypes}</div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary flex items-center gap-2" onClick={() => onCopy("tutor", MCAT_TUTOR_PROMPT)}>
              {copied === "tutor" ? <Check size={15} /> : <Clipboard size={15} />}
              {copied === "tutor" ? "Copied tutor prompt" : "Copy ChatGPT tutor prompt"}
            </button>
            <button className="btn-secondary flex items-center gap-2" onClick={() => onCopy("weekly", MCAT_WEEKLY_REVIEW_PROMPT)}>
              {copied === "weekly" ? <Check size={15} /> : <Clipboard size={15} />}
              {copied === "weekly" ? "Copied weekly prompt" : "Copy weekly review prompt"}
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Paste into ChatGPT after filling in the blanks at the top of each prompt.
          </p>
        </div>
      </div>
    </>
  );
}

/* ----------------------------- Log dialog -------------------------------- */

function LogSessionDialog({
  open,
  onOpenChange,
  form,
  setForm,
  topics,
  prefill,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: SessionFormState;
  setForm: React.Dispatch<React.SetStateAction<SessionFormState>>;
  topics: McatTopic[];
  prefill: LogDialogPrefill;
  onSubmit: () => void;
}) {
  const selectedTopic = topics.find((t) => t.id === form.topicId) ?? null;
  const showCarsErrors = isCarsTopic(selectedTopic);
  const errorChoices: AnyMcatErrorType[] = showCarsErrors
    ? [...CARS_ERROR_TYPES]
    : [...MCAT_ERROR_TYPES];

  const toggleMistake = (t: AnyMcatErrorType) =>
    setForm((current) => ({
      ...current,
      mistakeTypes: current.mistakeTypes.includes(t)
        ? current.mistakeTypes.filter((x) => x !== t)
        : [...current.mistakeTypes, t],
    }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Log session</DialogTitle>
          <DialogDescription>
            {prefill ? `Pre-filled from your ${prefill.minutes}-minute timer.` : "Capture the session so the queue can recalibrate."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">
            Topic
            <select
              className="input-dark mt-1 w-full"
              value={form.topicId}
              onChange={(e) => setForm((c) => ({ ...c, topicId: e.target.value }))}
            >
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NumberField label="Minutes" value={form.minutes} onChange={(minutes) => setForm((c) => ({ ...c, minutes }))} />
            <NumberField label="Attempted" value={form.questionsAttempted} onChange={(questionsAttempted) => setForm((c) => ({ ...c, questionsAttempted }))} />
            <NumberField label="Correct" value={form.questionsCorrect} onChange={(questionsCorrect) => setForm((c) => ({ ...c, questionsCorrect }))} />
            <NumberField label="Flashcards" value={form.flashcardsMade} onChange={(flashcardsMade) => setForm((c) => ({ ...c, flashcardsMade }))} />
          </div>
          <RangeField label="Confidence before" value={form.confidenceBefore} onChange={(confidenceBefore) => setForm((c) => ({ ...c, confidenceBefore }))} />
          <RangeField label="Confidence after" value={form.confidenceAfter} onChange={(confidenceAfter) => setForm((c) => ({ ...c, confidenceAfter }))} />
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              Mistake types {showCarsErrors ? "(CARS)" : "(MCAT)"}
            </div>
            <div className="flex flex-wrap gap-2">
              {errorChoices.map((t) => {
                const active = form.mistakeTypes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleMistake(t)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      active
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
          <textarea
            className="input-dark min-h-20 w-full"
            placeholder="What happened in this session?"
            value={form.notes}
            onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))}
          />
        </div>
        <DialogFooter>
          <button className="btn-secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={onSubmit}>
            <Check size={15} className="mr-1.5" />
            Log session
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- Topic detail ------------------------------ */

function TopicDetailDialog({
  topicId,
  state,
  onClose,
  onStart,
  onRetest,
  onUpdateStatus,
}: {
  topicId: string | null;
  state: McatFoundationState;
  onClose: () => void;
  onStart: (id: string) => void;
  onRetest: (id: string, rating: McatSrsRating) => void;
  onUpdateStatus: (id: string, status: McatTopicStatus) => void;
}) {
  const topic = topicId ? state.topics.find((t) => t.id === topicId) ?? null : null;
  const sessions = topic ? getTopicSessions(state, topic.id) : [];
  const errors = topic ? getTopicErrors(state, topic.id) : [];
  const accuracy = topic ? getTopicAccuracy(state, topic.id) : { attempted: 0, correct: 0, accuracy: 0 };

  return (
    <Dialog open={Boolean(topic)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        {topic ? (
          <>
            <DialogHeader>
              <DialogTitle>{topic.title}</DialogTitle>
              <DialogDescription>{topic.unit}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full border px-2.5 py-1 text-xs", priorityClass(topic.priorityLabel))}>
                  {topic.priorityLabel}
                </span>
                <span className={cn("rounded-full border px-2.5 py-1 text-xs", statusBadge(topic.status))}>
                  {topic.status}
                </span>
                <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
                  Weakness {topic.weakness.toFixed(1)}
                </span>
                <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
                  Last reviewed {topic.lastReviewed ?? "never"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric label="Accuracy" value={accuracy.attempted ? `${accuracy.accuracy}%` : "—"} />
                <Metric label="Questions" value={String(accuracy.attempted)} />
                <Metric label="Sessions" value={String(sessions.length)} />
                <Metric label="Errors" value={String(errors.length)} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => onStart(topic.id)}>
                  <Play size={13} className="mr-1.5" />
                  Start session
                </button>
                <div className="flex flex-wrap gap-1">
                  {([1, 2, 3, 4] as const).map((rating) => (
                    <button
                      key={rating}
                      className="btn-secondary px-2 py-1.5 text-xs"
                      onClick={() => onRetest(topic.id, rating)}
                    >
                      {rating}-{rating === 1 ? "Again" : rating === 2 ? "Hard" : rating === 3 ? "Good" : "Easy"}
                    </button>
                  ))}
                </div>
                <select
                  className="input-dark h-9 w-[200px] text-xs"
                  value={topic.status}
                  onChange={(e) => onUpdateStatus(topic.id, e.target.value as McatTopicStatus)}
                >
                  {MCAT_TOPIC_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Recent sessions
                  </div>
                  {sessions.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                      No sessions on this topic yet.
                    </div>
                  ) : (
                    <div className="max-h-[220px] space-y-2 overflow-auto pr-1">
                      {sessions.slice(0, 10).map((s) => (
                        <div key={s.id} className="rounded-lg border border-border bg-card p-2.5 text-xs">
                          <div className="font-mono-data text-foreground">{s.date}</div>
                          <div className="mt-0.5 text-muted-foreground">
                            {s.minutes} min · {formatAccuracy(s.questionsCorrect, s.questionsAttempted)} · {s.questionsAttempted}Q
                          </div>
                          {s.notes ? <div className="mt-1 text-foreground/80">{s.notes}</div> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Recent errors
                  </div>
                  {errors.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                      No errors logged on this topic.
                    </div>
                  ) : (
                    <div className="max-h-[220px] space-y-2 overflow-auto pr-1">
                      {errors.slice(0, 10).map((e) => (
                        <div
                          key={e.id}
                          className={cn(
                            "rounded-lg border p-2.5 text-xs",
                            e.resolved ? "border-emerald-500/25 bg-emerald-500/5" : "border-border bg-card",
                          )}
                        >
                          <div className="font-semibold text-foreground">{e.type}</div>
                          <div className="mt-0.5 font-mono-data text-muted-foreground">{e.date}</div>
                          {e.note ? <div className="mt-1 text-foreground/80">{e.note}</div> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- Small atoms ----------------------------- */

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-xs">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-foreground" title={value}>
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
    <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">
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
    <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">
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
