import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ListChecks,
  Plus,
  Trash2,
  Copy,
  CheckCheck,
  AlertTriangle,
  Clock,
  Repeat,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router";
import {
  ANCHOR_CATEGORIES,
  PRIVACY_LEVELS,
  type AnchorCategory,
  type CalendarAnchor,
  type PrivacyLevel,
  type TimeBlock,
  CATEGORY_COLORS,
  loadAnchors,
  saveAnchors,
  makeAnchor,
  parseTimeToMinutes,
  minutesToTime,
  anchorDuration,
  buildTodayTimeline,
  buildPlanningExportValidation,
  detectConflicts,
  buildCalendarPlanningPrompt,
  buildWeeklyCalendarReviewPrompt,
  calculateRealityScore,
  listRecurringLoops,
  loadTimeBlocks,
  makeTimeBlock,
  saveTimeBlocks,
} from "@/lib/calendar-system";
import {
  buildTaskSmartViews,
  buildDayPlan,
  isDoneStatus,
  loadTasks,
  makeTask,
  saveTasks,
  scheduleTask,
  type Task,
  type TaskType,
} from "@/lib/task-system";
import { toDateKey } from "@/lib/date-helpers";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import ExecutionTruthPanel from "@/components/ExecutionTruthPanel";
import CapacityTimeline from "@/components/CapacityTimeline";
import {
  buildPlanningSnapshot,
  evaluateImportRealism,
  type RealismReport,
  type PlanningSnapshot,
} from "@/lib/planning-engine";
import {
  buildDailyPlanPayload,
  createLifeeeId,
  deleteCalendarAnchor,
  deleteImportedTimeBlocksForDate,
  deleteTimeBlock,
  fetchCalendarAnchors,
  fetchTimeBlocks,
  fetchUniversalTasks,
  getSyncLabel,
  getSyncTone,
  insertScheduleImport,
  markScheduleImportApplied,
  type LifeeeSyncStatus,
  upsertCalendarAnchor,
  upsertDailyPlan,
  upsertTimeBlock,
  upsertUniversalTask,
} from "@/lib/lifeee-persistence";
import {
  buildPreviewFromEditableRows,
  editableRowsFromParsed,
  makeBlankEditableRow,
  parseScheduleImport,
  resetEditableRow,
  rowMatchesOriginal,
  SCHEDULE_BLOCK_TYPES,
  schedulePreviewRowsToApply,
  serializeEditableRowsToScheduleText,
  type EditableScheduleRow,
  type ScheduleImportParsed,
  type ScheduleImportPreview,
  type ScheduleImportPreviewRow,
} from "@/lib/schedule-import";
import { LifeRoutinesPanel } from "@/components/LifeRoutinesPanel";
import {
  AdvancedOnly,
  AIActionButton,
  CollapsibleSection,
  EmptyStateCard,
  PageDecisionHeader,
  PrimaryActionBar,
  SegmentedModeTabs,
  StatusPill,
} from "@/components/ui-kit";
import {
  formatDecimalHours,
  getOpenTimeMinutes,
  minutesToDecimalHours,
} from "@/lib/calendar-capacity";

type View = "today" | "week" | "month" | "agenda";
type WorkflowMode = "reality" | "plan" | "execute" | "details";

const WORKFLOW_OPTIONS: { value: WorkflowMode; label: string }[] = [
  { value: "reality", label: "Reality" },
  { value: "plan", label: "Plan" },
  { value: "execute", label: "Execute" },
  { value: "details", label: "Details" },
];

const VIEW_TABS: { key: View; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "today", label: "Today", icon: CalendarClock },
  { key: "week", label: "Week", icon: CalendarRange },
  { key: "month", label: "Month", icon: CalendarDays },
  { key: "agenda", label: "Agenda", icon: ListChecks },
];

function readEnergy(): number {
  if (typeof window === "undefined") return 7;
  try {
    const raw = window.localStorage.getItem("lifeee.daily.energy");
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
  } catch {
    // ignore
  }
  return 7;
}

function taskTypeFromAnchor(category: CalendarAnchor["category"]): TaskType {
  if (category === "Connex") return "Connex / Project";
  if (category === "MCAT") return "Academic";
  if (category === "Recovery") return "Health";
  return category;
}

function makeBlockTimestamp(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

export default function CalendarPage() {
  const { hasSupabaseConfig, isLoading: sessionLoading, userId } = useSupabaseSession();
  const today = useMemo(() => toDateKey(), []);
  const [anchors, setAnchors] = useState<CalendarAnchor[]>(() => loadAnchors());
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks());
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>(() => loadTimeBlocks());
  const remoteLoadedRef = useRef(false);
  const saveSequenceRef = useRef(0);
  const [syncStatus, setSyncStatus] = useState<LifeeeSyncStatus>("local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("reality");
  const [view, setView] = useState<View>("today");
  const [activeDate, setActiveDate] = useState<string>(today);
  const [currentEnergy] = useState<number>(readEnergy());
  const [copied, setCopied] = useState<string | null>(null);
  const [scheduleImportText, setScheduleImportText] = useState("");
  const [scheduleParsed, setScheduleParsed] = useState<ScheduleImportParsed | null>(null);
  const [scheduleEditableRows, setScheduleEditableRows] = useState<EditableScheduleRow[] | null>(null);
  const [schedulePreview, setSchedulePreview] = useState<ScheduleImportPreview | null>(null);
  const [replaceExistingImported, setReplaceExistingImported] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const [draft, setDraft] = useState<Omit<CalendarAnchor, "id" | "created_at" | "updated_at">>({
    title: "",
    date: today,
    start_time: "09:00",
    end_time: "10:00",
    category: "Personal",
    location: "",
    link: "",
    people: "",
    prep: "",
    follow_up: "",
    notes: "",
    privacy: "Private",
    recurring: false,
  });

  useEffect(() => {
    saveAnchors(anchors);
  }, [anchors]);

  useEffect(() => {
    saveTimeBlocks(timeBlocks);
  }, [timeBlocks]);

  useEffect(() => {
    let active = true;

    const loadPersistedCalendar = async () => {
      if (sessionLoading) return;

      if (!hasSupabaseConfig || !userId) {
        remoteLoadedRef.current = false;
        if (!active) return;
        setAnchors(loadAnchors());
        setTasks(loadTasks());
        setTimeBlocks(loadTimeBlocks());
        setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
        setSyncError(null);
        return;
      }

      setSyncStatus("loading");
      setSyncError(null);

      try {
        const [remoteAnchors, remoteTasks, remoteTimeBlocks] = await Promise.all([
          fetchCalendarAnchors(userId),
          fetchUniversalTasks(userId),
          fetchTimeBlocks(userId),
        ]);
        const localAnchors = loadAnchors();
        const localTimeBlocks = loadTimeBlocks();
        const nextAnchors =
          remoteAnchors.length === 0 && localAnchors.length > 0
            ? await Promise.all(
                localAnchors.map((anchor) => upsertCalendarAnchor(userId, anchor)),
              )
            : remoteAnchors;
        const nextTimeBlocks =
          remoteTimeBlocks.length === 0 && localTimeBlocks.length > 0
            ? await Promise.all(
                localTimeBlocks.map((block) => upsertTimeBlock(userId, block)),
              )
            : remoteTimeBlocks;

        if (!active) return;
        remoteLoadedRef.current = true;
        setAnchors(nextAnchors);
        setTasks(remoteTasks);
        setTimeBlocks(nextTimeBlocks);
        saveAnchors(nextAnchors);
        saveTimeBlocks(nextTimeBlocks);
        setSyncStatus("saved");
      } catch (error) {
        if (!active) return;
        remoteLoadedRef.current = false;
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Unable to load calendar.");
      }
    };

    void loadPersistedCalendar();

    return () => {
      active = false;
    };
  }, [hasSupabaseConfig, sessionLoading, userId]);

  const onDayAnchors = useMemo(
    () =>
      [...anchors]
        .filter((a) => a.date === activeDate)
        .sort((a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time)),
    [anchors, activeDate],
  );
  const onDayTimeBlocks = useMemo(
    () =>
      [...timeBlocks]
        .filter((block) => block.date === activeDate)
        .sort((a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time)),
    [activeDate, timeBlocks],
  );

  const planningSnapshot = useMemo(
    () =>
      buildPlanningSnapshot({
        date: activeDate,
        anchors: onDayAnchors,
        timeBlocks: onDayTimeBlocks,
      }),
    [activeDate, onDayAnchors, onDayTimeBlocks],
  );
  const available = useMemo(
    () => ({
      totalOpenMinutes: planningSnapshot.capacity.totalAvailableMinutes,
      largestOpenBlock: planningSnapshot.largestWindow
        ? {
            start: planningSnapshot.largestWindow.start,
            end: planningSnapshot.largestWindow.end,
            durationMinutes: planningSnapshot.largestWindow.durationMinutes,
          }
        : null,
      bestDeepWork: planningSnapshot.deepWorkWindows[0]
        ? {
            start: planningSnapshot.deepWorkWindows[0].start,
            end: planningSnapshot.deepWorkWindows[0].end,
            durationMinutes: planningSnapshot.deepWorkWindows[0].durationMinutes,
          }
        : null,
      bestWorkout: null,
      bestShutdownTarget: planningSnapshot.shutdownReserve.start,
      openBlocks: planningSnapshot.openWindows.map((window) => ({
        start: window.start,
        end: window.end,
        durationMinutes: window.durationMinutes,
      })),
    }),
    [planningSnapshot],
  );
  const plan = useMemo(() => buildDayPlan(tasks, currentEnergy, activeDate), [activeDate, tasks, currentEnergy]);
  const smartViews = useMemo(
    () => buildTaskSmartViews(tasks, { today: activeDate, currentEnergy }),
    [activeDate, currentEnergy, tasks],
  );
  const terminalExcludedCount = useMemo(
    () =>
      tasks.filter(
        (task) =>
          isDoneStatus(task.status) ||
          task.status === "archived" ||
          task.status === "trashed" ||
          task.archived_at != null ||
          task.deleted_at != null,
      ).length,
    [tasks],
  );
  const planningValidation = useMemo(
    () =>
      buildPlanningExportValidation({
        tasks: smartViews.exportablePlanningSet,
        mustDo: plan.mustDo,
        availableMinutes: available.totalOpenMinutes,
        openWindowCount: available.openBlocks.length,
        ignoredExcludedCount: smartViews.ignoreToday.length,
        parkingLotExcludedCount: smartViews.parkingLot.length,
        terminalExcludedCount,
      }),
    [available.openBlocks.length, available.totalOpenMinutes, plan.mustDo, smartViews, terminalExcludedCount],
  );
  const conflicts = useMemo(() => detectConflicts(onDayAnchors), [onDayAnchors]);
  const timeline = useMemo(
    () => buildTodayTimeline(onDayAnchors, available, { timeBlocks: onDayTimeBlocks }),
    [onDayAnchors, onDayTimeBlocks, available],
  );
  const reality = useMemo(
    () =>
      calculateRealityScore({
        available,
        plan,
        currentEnergy,
        sleepReadiness: 7,
        academicPressure: 6,
        workoutReadiness: 6,
      }),
    [available, plan, currentEnergy],
  );

  const addAnchor = () => {
    if (!draft.title.trim()) return;
    const next = makeAnchor({ ...draft, title: draft.title.trim() });
    setAnchors((prev) => [next, ...prev]);
    setDraft((d) => ({ ...d, title: "", prep: "", follow_up: "", notes: "" }));
    void persistAnchor(next);
  };

  const persistAnchor = async (anchor: CalendarAnchor) => {
    if (!userId || !remoteLoadedRef.current) {
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
      return;
    }

    const saveSequence = saveSequenceRef.current + 1;
    saveSequenceRef.current = saveSequence;
    setSyncStatus("saving");
    setSyncError(null);

    try {
      const savedAnchor = await upsertCalendarAnchor(userId, anchor);
      if (saveSequenceRef.current !== saveSequence) return;
      setAnchors((current) =>
        current.map((item) => (item.id === savedAnchor.id ? savedAnchor : item)),
      );
      setSyncStatus("saved");
    } catch (error) {
      if (saveSequenceRef.current !== saveSequence) return;
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Unable to save calendar anchor.");
    }
  };

  const removeAnchor = (id: string) => {
    setAnchors((prev) => prev.filter((a) => a.id !== id));
    if (!userId || !remoteLoadedRef.current) {
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
      return;
    }

    setSyncStatus("saving");
    setSyncError(null);
    void deleteCalendarAnchor(userId, id)
      .then(() => setSyncStatus("saved"))
      .catch((error: unknown) => {
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Unable to delete calendar anchor.");
      });
  };

  const updateAnchor = (id: string, patch: Partial<CalendarAnchor>) => {
    const current = anchors.find((anchor) => anchor.id === id);
    if (!current) return;
    const nextAnchor = { ...current, ...patch, updated_at: new Date().toISOString() };
    setAnchors((prev) => prev.map((a) => (a.id === id ? nextAnchor : a)));
    void persistAnchor(nextAnchor);
  };

  const generateFollowUpTask = (anchor: CalendarAnchor) => {
    const title = anchor.follow_up.trim() || `Follow up: ${anchor.title}`;
    const reference = `Calendar anchor reference: ${anchor.title} on ${anchor.date} ${anchor.start_time}-${anchor.end_time}. Anchor id: ${anchor.id}.`;
    const task = makeTask({
      title,
      task_type: taskTypeFromAnchor(anchor.category),
      due_date: anchor.date,
      estimated_minutes: 20,
      energy_required: 4,
      urgency: anchor.date <= today ? 7 : 5,
      importance: 6,
      consequence_if_delayed: 6,
      trust_impact: 6,
      time_efficiency: 7,
      status: "inbox",
      daily_role: "Should Do",
      linked_anchor_id: anchor.id,
      notes: [reference, anchor.follow_up ? `Follow up: ${anchor.follow_up}` : null, anchor.notes]
        .filter(Boolean)
        .join("\n"),
    });

    const optimistic = [task, ...tasks];
    setTasks(optimistic);

    if (!userId || !remoteLoadedRef.current) {
      saveTasks(optimistic);
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
      return;
    }

    setSyncStatus("saving");
    setSyncError(null);
    void upsertUniversalTask(userId, task, currentEnergy)
      .then((savedTask) => {
        setTasks((current) => current.map((item) => (item.id === task.id ? savedTask : item)));
        setSyncStatus("saved");
      })
      .catch((error: unknown) => {
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Unable to save follow-up task.");
      });
  };

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyPlanningPrompt = () => {
    if (!planningValidation.canExport) {
      setSyncStatus("error");
      setSyncError(planningValidation.blockers.join(" "));
      return;
    }
    void copy(
      "planning",
      buildCalendarPlanningPrompt({
        date: activeDate,
        currentTime: new Date().toLocaleString(),
        operatingMode: "Calendar Planning",
        planRealityScore: Number(reality.score.toFixed(1)),
        anchors: onDayAnchors,
        available,
        plan,
        trustProtectors: smartViews.trustProtectors,
        inboxCandidates: smartViews.inboxCandidates,
        ignoredExcludedCount: smartViews.ignoreToday.length,
        parkingLotExcludedCount: smartViews.parkingLot.length,
        terminalExcludedCount,
        currentEnergy,
        mood: "Not supplied",
        sleepReadiness: 7,
        academicPressure: 6,
        workoutReadiness: 6,
        mcatNextMove: "(see MCAT page)",
      }),
    );
  };

  const copyWeeklyReviewPrompt = () => {
    const weekStart = (() => {
      const d = new Date(activeDate);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      return toDateKey(d);
    })();
    const weekEnd = (() => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + 6);
      return toDateKey(d);
    })();
    const weekAnchors = anchors.filter((a) => a.date >= weekStart && a.date <= weekEnd);
    const meetings = weekAnchors.filter((a) =>
      ["Connex", "Work", "Career", "Academic"].includes(a.category),
    );
    copy(
      "weekly",
      buildWeeklyCalendarReviewPrompt({
        weekStart,
        anchors: weekAnchors,
        completedTasks: tasks.filter((t) => isDoneStatus(t.status)),
        missedTasks: tasks.filter((t) => t.due_date && t.due_date < today && !isDoneStatus(t.status)),
        overloadedDays: [],
        bestWorkBlocks: [],
        worstWorkBlocks: [],
        sleepEnergyPattern: "Captured in Sleep + Daily Log pages.",
        meetings,
        prepFailures: weekAnchors.filter((a) => a.prep && a.date < today).map((a) => `${a.date} ${a.title}`),
        followUpFailures: weekAnchors.filter((a) => a.follow_up && a.date < today).map((a) => `${a.date} ${a.title}`),
        movedTasks: [],
      }),
    );
  };

  const computePreviewForRows = (rows: EditableScheduleRow[], parsed: ScheduleImportParsed | null) => {
    return buildPreviewFromEditableRows({
      date: activeDate,
      rows,
      tasks,
      anchors: onDayAnchors,
      existingTimeBlocks: replaceExistingImported
        ? onDayTimeBlocks.filter((block) => block.source !== "chatgpt_import")
        : onDayTimeBlocks,
      unscheduled: parsed?.unscheduled,
      risks: parsed?.risks,
      firstAction: parsed?.firstAction,
      planRealism: parsed?.planRealism,
    });
  };

  const parseScheduleImportText = () => {
    if (scheduleEditableRows && scheduleEditableRows.some((row) => row.edited)) {
      const ok =
        typeof window === "undefined" ||
        window.confirm(
          "You have inline edits in the preview. Re-parsing will discard them. Continue?",
        );
      if (!ok) return;
    }
    const parsed = parseScheduleImport(scheduleImportText);
    const rows = editableRowsFromParsed(parsed);
    const preview = computePreviewForRows(rows, parsed);
    setScheduleParsed(parsed);
    setScheduleEditableRows(rows);
    setSchedulePreview(preview);
    setImportNotice(
      parsed.unparsed.length > 0
        ? `${parsed.unparsed.length} line${parsed.unparsed.length === 1 ? "" : "s"} could not be parsed.`
        : "Schedule parsed. Edit rows inline if needed, then Apply.",
    );
  };

  const previewScheduleImport = () => {
    let rows = scheduleEditableRows;
    let parsed = scheduleParsed;
    if (!rows) {
      parsed = parseScheduleImport(scheduleImportText);
      rows = editableRowsFromParsed(parsed);
      setScheduleParsed(parsed);
      setScheduleEditableRows(rows);
    }
    const preview = computePreviewForRows(rows, parsed);
    setSchedulePreview(preview);
    setImportNotice(
      preview.hasBlockingIssues
        ? "Preview has warnings. Apply non-conflicting rows only unless you explicitly continue."
        : "Preview ready.",
    );
  };

  const updateScheduleRow = (id: string, patch: Partial<EditableScheduleRow>) => {
    setScheduleEditableRows((current) => {
      if (!current) return current;
      const next = current.map((row) => {
        if (row.id !== id) return row;
        const merged: EditableScheduleRow = { ...row, ...patch };
        merged.edited = !rowMatchesOriginal(merged);
        return merged;
      });
      setSchedulePreview(computePreviewForRows(next, scheduleParsed));
      return next;
    });
  };

  const deleteScheduleRow = (id: string) => {
    setScheduleEditableRows((current) => {
      if (!current) return current;
      const next = current.filter((row) => row.id !== id);
      setSchedulePreview(computePreviewForRows(next, scheduleParsed));
      return next;
    });
  };

  const duplicateScheduleRow = (id: string) => {
    setScheduleEditableRows((current) => {
      if (!current) return current;
      const sourceIndex = current.findIndex((row) => row.id === id);
      if (sourceIndex === -1) return current;
      const source = current[sourceIndex];
      const copy = makeBlankEditableRow({
        start: source.start,
        end: source.end,
        task_code: source.task_code,
        imported_title: source.imported_title,
        block_type: source.block_type,
        reason: source.reason,
      });
      const next = [...current.slice(0, sourceIndex + 1), copy, ...current.slice(sourceIndex + 1)];
      setSchedulePreview(computePreviewForRows(next, scheduleParsed));
      return next;
    });
  };

  const resetScheduleRow = (id: string) => {
    setScheduleEditableRows((current) => {
      if (!current) return current;
      const next = current.map((row) => (row.id === id ? resetEditableRow(row) : row));
      setSchedulePreview(computePreviewForRows(next, scheduleParsed));
      return next;
    });
  };

  const syncScheduleEditsToText = () => {
    if (!scheduleEditableRows) return;
    setScheduleImportText(serializeEditableRowsToScheduleText(scheduleEditableRows));
    setImportNotice("Edited rows synced back to text. Re-parse to make the text the source of truth.");
  };

  const clearScheduleImport = () => {
    setScheduleImportText("");
    setScheduleParsed(null);
    setScheduleEditableRows(null);
    setSchedulePreview(null);
    setImportNotice(null);
  };

  const clearAppliedScheduleImport = () => {
    setScheduleImportText("");
    setScheduleParsed(null);
    setScheduleEditableRows(null);
    setSchedulePreview(null);
  };

  const applyScheduleImport = async (mode: "non-conflicting" | "include-soft-conflicts") => {
    let parsed = scheduleParsed;
    let editableRows = scheduleEditableRows;
    if (!parsed || !editableRows) {
      parsed = parseScheduleImport(scheduleImportText);
      editableRows = editableRowsFromParsed(parsed);
    }
    const preview = schedulePreview ?? computePreviewForRows(editableRows, parsed);
    const rows = schedulePreviewRowsToApply(preview, mode);
    if (rows.length === 0) {
      setImportNotice("No applicable schedule rows. Fix invalid lines or task codes first.");
      return;
    }

    const importBatchId = createLifeeeId();
    const blocks = rows.map((row) =>
      makeTimeBlock({
        id: createLifeeeId(),
        title: row.imported_title || row.matched_task_title || row.task_code,
        date: activeDate,
        start_time: row.start,
        end_time: row.end,
        block_type: row.block_type || "focus",
        linked_task_id: row.task_id,
        source: "chatgpt_import",
        import_batch_id: importBatchId,
        reason: row.reason,
        notes: [`task_code: ${row.task_code || "FREEFORM"}`, `raw: ${row.raw}`].join("\n"),
      }),
    );
    const scheduledTasks = rows
      .filter((row) => row.task_id)
      .map((row) => {
        const existing = tasks.find((task) => task.id === row.task_id);
        if (!existing) return null;
        return scheduleTask(existing, {
          scheduledStart: makeBlockTimestamp(activeDate, row.start),
          scheduledEnd: makeBlockTimestamp(activeDate, row.end),
          dueDate: activeDate,
          fixedTime: row.start,
        });
      })
      .filter(Boolean) as Task[];

    const nextTimeBlocks = [
      ...(replaceExistingImported
        ? timeBlocks.filter(
            (block) => !(block.date === activeDate && block.source === "chatgpt_import"),
          )
        : timeBlocks),
      ...blocks,
    ];
    const nextTasks = tasks.map((task) => {
      const scheduled = scheduledTasks.find((item) => item.id === task.id);
      return scheduled ?? task;
    });

    setTimeBlocks(nextTimeBlocks);
    setTasks(nextTasks);
    saveTimeBlocks(nextTimeBlocks);
    saveTasks(nextTasks);

    if (!userId || !remoteLoadedRef.current) {
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
      setImportNotice("Applied as Draft only. Sign in to save schedule blocks.");
      clearAppliedScheduleImport();
      return;
    }

    setSyncStatus("saving");
    setSyncError(null);
    try {
      if (replaceExistingImported) {
        await deleteImportedTimeBlocksForDate(userId, activeDate);
      }
      await insertScheduleImport(userId, {
        id: importBatchId,
        date: activeDate,
        raw_text: scheduleImportText,
        parsed_json: parsed,
        applied: false,
        plan_realism_score: preview.planRealism.score,
        risks: preview.risks,
        unscheduled: preview.unscheduled,
      });
      await Promise.all(blocks.map((block) => upsertTimeBlock(userId, block)));
      await Promise.all(scheduledTasks.map((task) => upsertUniversalTask(userId, task, currentEnergy)));
      await upsertDailyPlan(userId, {
        date: activeDate,
        generated_from: {
          type: "chatgpt_schedule_import",
          import_batch_id: importBatchId,
          applied_at: new Date().toISOString(),
          plan_realism: preview.planRealism,
          rows_applied: rows.length,
        },
      });
      await markScheduleImportApplied(userId, importBatchId);
      setSyncStatus("saved");
      setImportNotice(`${rows.length} schedule block${rows.length === 1 ? "" : "s"} saved.`);
      clearAppliedScheduleImport();
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "Unable to apply imported schedule.");
      setImportNotice("Import failed before changes were saved.");
    }
  };

  const removeTimeBlock = (id: string) => {
    setTimeBlocks((prev) => prev.filter((block) => block.id !== id));
    if (!userId || !remoteLoadedRef.current) {
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
      return;
    }
    setSyncStatus("saving");
    setSyncError(null);
    void deleteTimeBlock(userId, id)
      .then(() => setSyncStatus("saved"))
      .catch((error: unknown) => {
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Unable to delete time block.");
      });
  };

  const updateTimeBlockStatus = (id: string, status: TimeBlock["status"]) => {
    const current = timeBlocks.find((block) => block.id === id);
    if (!current) return;
    const next: TimeBlock = {
      ...current,
      status,
      completed_at: status === "complete" ? new Date().toISOString() : current.completed_at,
      updated_at: new Date().toISOString(),
    };
    setTimeBlocks((prev) => prev.map((block) => (block.id === id ? next : block)));
    if (!userId || !remoteLoadedRef.current) {
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
      return;
    }
    setSyncStatus("saving");
    setSyncError(null);
    void upsertTimeBlock(userId, next)
      .then(() => setSyncStatus("saved"))
      .catch((error: unknown) => {
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Unable to update time block.");
      });
  };

  const updateTimeBlockExecutionStatus = (
    id: string,
    executionStatus: TimeBlock["execution_status"],
  ) => {
    const current = timeBlocks.find((block) => block.id === id);
    if (!current) return;
    const now = new Date().toISOString();
    const next: TimeBlock = {
      ...current,
      execution_status: executionStatus,
      status:
        executionStatus === "done"
          ? "complete"
          : executionStatus === "missed"
            ? "missed"
            : current.status,
      started_at: executionStatus === "in_progress" ? now : current.started_at,
      completed_at: executionStatus === "done" ? now : current.completed_at,
      missed_at: executionStatus === "missed" ? now : current.missed_at,
      skipped_at: executionStatus === "skipped" ? now : current.skipped_at,
      updated_at: now,
    };
    setTimeBlocks((prev) => prev.map((block) => (block.id === id ? next : block)));
    if (!userId || !remoteLoadedRef.current) {
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
      return;
    }
    setSyncStatus("saving");
    setSyncError(null);
    void upsertTimeBlock(userId, next)
      .then(() => setSyncStatus("saved"))
      .catch((error: unknown) => {
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Unable to update time block.");
      });
  };

  const loops = useMemo(() => listRecurringLoops(new Date(activeDate)), [activeDate]);
  const visibleSyncStatus: LifeeeSyncStatus = sessionLoading
    ? "loading"
    : !hasSupabaseConfig
      ? "local"
      : !userId
        ? "waiting"
        : syncStatus;
  const planningWarningCount =
    planningValidation.blockers.length + planningValidation.warnings.length;

  useEffect(() => {
    if (!userId || sessionLoading || !remoteLoadedRef.current) return;

    const saveSequence = saveSequenceRef.current + 1;
    saveSequenceRef.current = saveSequence;
    const timeout = window.setTimeout(() => {
      setSyncStatus("saving");
      setSyncError(null);

      const payload = buildDailyPlanPayload({
        date: activeDate,
        plan,
        realityScore: reality.score,
        mainBottleneck: reality.recommendations[0] ?? null,
        shutdownTime: available.bestShutdownTarget,
      });

      void upsertDailyPlan(userId, payload)
        .then(() => {
          if (saveSequenceRef.current === saveSequence) {
            setSyncStatus("saved");
          }
        })
        .catch((error: unknown) => {
          if (saveSequenceRef.current !== saveSequence) return;
          setSyncStatus("error");
          setSyncError(error instanceof Error ? error.message : "Unable to save daily plan.");
        });
    }, 800);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeDate, available.bestShutdownTarget, plan, reality.recommendations, reality.score, sessionLoading, userId]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageDecisionHeader
        title="Calendar"
        question="Reality first, then plan, then execute."
      >
        <span
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${getSyncTone(visibleSyncStatus)}`}
          title={visibleSyncStatus === "error" ? syncError ?? undefined : undefined}
        >
          {getSyncLabel(visibleSyncStatus)}
        </span>
        <AIActionButton onClick={copyPlanningPrompt}>
          {copied === "planning" ? "Copied" : "Plan with AI"}
        </AIActionButton>
        <AdvancedOnly>
          <button
            onClick={copyWeeklyReviewPrompt}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted/70"
          >
            {copied === "weekly" ? <CheckCheck size={14} /> : <Copy size={14} />}
            {copied === "weekly" ? "Copied" : "Weekly calendar review"}
          </button>
        </AdvancedOnly>
        <Link
          to="/tasks"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted/70"
        >
          <ListChecks size={14} />
          Open Tasks
        </Link>
      </PageDecisionHeader>

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedModeTabs
          value={workflowMode}
          onChange={setWorkflowMode}
          options={WORKFLOW_OPTIONS}
        />
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays size={12} />
          <input
            type="date"
            value={activeDate}
            onChange={(e) => setActiveDate(e.target.value)}
            className="rounded-md border border-border bg-card px-2 py-1 text-xs"
          />
        </div>
      </div>

      {workflowMode === "reality" ? (
        <div className="space-y-4">
          <RealitySummary
            planning={planningSnapshot}
            anchors={onDayAnchors}
            conflicts={conflicts}
          />
          <CapacityTimeline anchors={onDayAnchors} timeBlocks={onDayTimeBlocks} tasks={tasks} />
          <FixedAnchorsPanel
            anchors={onDayAnchors}
            onUpdate={updateAnchor}
            onRemove={removeAnchor}
            onGenerateFollowUpTask={generateFollowUpTask}
          />
          <AddAnchorPanel draft={draft} setDraft={setDraft} onAdd={addAnchor} />
          <CollapsibleSection title="Operating Rhythms" defaultOpen={false}>
            <RecurringLoopsPanel loops={loops} />
          </CollapsibleSection>
          <CollapsibleSection title="Life Routines" defaultOpen={false}>
            <LifeRoutinesPanel
              userId={userId}
              hasSupabaseConfig={hasSupabaseConfig}
              sessionLoading={sessionLoading}
            />
          </CollapsibleSection>
        </div>
      ) : null}

      {workflowMode === "plan" ? (
        <div className="space-y-4">
          <PrimaryActionBar>
            <AIActionButton onClick={copyPlanningPrompt}>
              {copied === "planning" ? "Copied" : "Plan with AI"}
            </AIActionButton>
            <span className="text-xs text-muted-foreground">
              Export keeps stable task codes so imported blocks can reconnect to Tasks.
            </span>
          </PrimaryActionBar>
          <CollapsibleSection
            title="Ready for Planning"
            subtitle={
              planningWarningCount > 0
                ? `${planningWarningCount} item${planningWarningCount === 1 ? "" : "s"} need attention`
                : "No warnings"
            }
            defaultOpen={planningWarningCount > 0}
          >
            <PlanningExportValidationPanel validation={planningValidation} />
          </CollapsibleSection>
          <ScheduleImportPanel
            value={scheduleImportText}
            onChange={setScheduleImportText}
            parsed={scheduleParsed}
            preview={schedulePreview}
            editableRows={scheduleEditableRows}
            tasks={tasks}
            onUpdateRow={updateScheduleRow}
            onDeleteRow={deleteScheduleRow}
            onDuplicateRow={duplicateScheduleRow}
            onResetRow={resetScheduleRow}
            onSyncToText={syncScheduleEditsToText}
            notice={importNotice}
            replaceExistingImported={replaceExistingImported}
            setReplaceExistingImported={setReplaceExistingImported}
            onParse={parseScheduleImportText}
            onPreview={previewScheduleImport}
            onApplyNonConflicting={() => void applyScheduleImport("non-conflicting")}
            onApplyWithSoftConflicts={() => void applyScheduleImport("include-soft-conflicts")}
            onCancel={clearScheduleImport}
            planningSnapshot={planningSnapshot}
            anchors={onDayAnchors}
            dayDate={activeDate}
          />
        </div>
      ) : null}

      {workflowMode === "execute" ? (
        <div className="space-y-4">
          <AdvancedOnly>
            <ExecutionTruthPanel
              today={activeDate}
              userId={userId}
              hasSupabaseConfig={hasSupabaseConfig}
            />
          </AdvancedOnly>
          <TodayView
            anchors={onDayAnchors}
            timeBlocks={onDayTimeBlocks}
            tasks={tasks}
            timeline={timeline}
            conflicts={conflicts}
            importedBlocksAdvancedOnly
            onUpdate={updateAnchor}
            onRemove={removeAnchor}
            onRemoveTimeBlock={removeTimeBlock}
            onUpdateTimeBlockStatus={updateTimeBlockStatus}
            onUpdateTimeBlockExecutionStatus={updateTimeBlockExecutionStatus}
            onGenerateFollowUpTask={generateFollowUpTask}
          />
        </div>
      ) : null}

      {workflowMode === "details" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {VIEW_TABS.map((t) => {
              const Icon = t.icon;
              const active = view === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setView(t.key)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  <Icon size={12} />
                  {t.label}
                </button>
              );
            })}
          </div>
          {view === "today" && (
            <TodayView
              anchors={onDayAnchors}
              timeBlocks={onDayTimeBlocks}
              tasks={tasks}
              timeline={timeline}
              conflicts={conflicts}
              onUpdate={updateAnchor}
              onRemove={removeAnchor}
              onRemoveTimeBlock={removeTimeBlock}
              onUpdateTimeBlockStatus={updateTimeBlockStatus}
              onUpdateTimeBlockExecutionStatus={updateTimeBlockExecutionStatus}
              onGenerateFollowUpTask={generateFollowUpTask}
            />
          )}
          {view === "agenda" && (
            <AgendaView
              anchors={[...anchors].sort(
                (a, b) =>
                  a.date.localeCompare(b.date) ||
                  parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time),
              )}
              timeBlocks={[...timeBlocks].sort(
                (a, b) =>
                  a.date.localeCompare(b.date) ||
                  parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time),
              )}
              onRemove={removeAnchor}
              onRemoveTimeBlock={removeTimeBlock}
            />
          )}
          {view === "week" && <WeekView anchors={anchors} activeDate={activeDate} />}
          {view === "month" && <MonthView anchors={anchors} activeDate={activeDate} />}
          <AddAnchorPanel draft={draft} setDraft={setDraft} onAdd={addAnchor} />
          <RecurringLoopsPanel loops={loops} />
        </div>
      ) : null}
    </div>
  );
}

function RealitySummary({
  planning,
  anchors,
  conflicts,
}: {
  planning: PlanningSnapshot;
  anchors: CalendarAnchor[];
  conflicts: ReturnType<typeof detectConflicts>;
}) {
  const tone =
    planning.realism.score >= 7
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : planning.realism.score >= 5
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-rose-200 bg-rose-50 text-rose-800";
  const largest = planning.largestWindow;
  const topDeepWork = planning.deepWorkWindows[0];
  const openMinutes = getOpenTimeMinutes(planning);
  const focusHours = minutesToDecimalHours(planning.capacity.deepWorkCapacityMinutes);
  const deepWorkText = topDeepWork
    ? `${topDeepWork.start}-${topDeepWork.end}`
    : "no protected deep-work window";
  return (
    <div className="space-y-3">
      <div className={`rounded-2xl border p-4 ${tone}`}>
        <div className="text-[10px] uppercase tracking-wider font-semibold">Plan reality</div>
        <div className="mt-2 text-base font-semibold">
          You realistically have {focusHours} hours of quality focus capacity today and{" "}
          {formatDecimalHours(openMinutes)} open overall. Best
          deep-work window: {deepWorkText}. Shutdown protected at{" "}
          {planning.shutdownReserve.start}.
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <StatusPill tone={planning.realism.score >= 7 ? "good" : planning.realism.score >= 5 ? "warning" : "danger"}>
            Reality {planning.realism.score.toFixed(1)} / 10
          </StatusPill>
          <StatusPill tone={conflicts.length > 0 ? "danger" : "good"}>
            {conflicts.length > 0
              ? `${conflicts.length} overlap${conflicts.length === 1 ? "" : "s"}`
              : "No overlaps"}
          </StatusPill>
          <StatusPill tone={anchors.length > 0 ? "info" : "warning"}>
            {anchors.length} fixed anchor{anchors.length === 1 ? "" : "s"}
          </StatusPill>
        </div>
        <div className="mt-2 text-xs">{planning.realism.bottleneck}</div>
        <div className="mt-1 text-xs opacity-80">Next: {planning.realism.correction}</div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SmallStat
          label="Open time"
          value={formatDecimalHours(openMinutes)}
          hint={`${openMinutes} min after fixed commitments, buffers, and reserves`}
        />
        <SmallStat
          label="Best focus window"
          value={topDeepWork ? `${topDeepWork.start}–${topDeepWork.end}` : "—"}
          hint={
            topDeepWork
              ? `${topDeepWork.durationMinutes} min · ${topDeepWork.quality}`
              : "No deep-work-sized window"
          }
        />
        <SmallStat
          label="Shutdown reserve"
          value={`${planning.shutdownReserve.start}–${planning.shutdownReserve.end}`}
          hint={`Sleep window ${planning.sleepWindow.start}–${planning.sleepWindow.end} protected`}
        />
      </div>

      <CollapsibleSection title="Capacity details" defaultOpen={planning.warnings.length > 0}>
        <div className="mb-3 grid gap-3 md:grid-cols-2">
          <SmallStat
            label="Largest realistic window"
            value={largest ? `${largest.start}–${largest.end}` : "—"}
            hint={
              largest
                ? `${largest.durationMinutes} min · ${largest.quality}`
                : "Calendar full or unset"
            }
          />
          <SmallStat
            label="Focus capacity"
            value={`~${Math.round(planning.capacity.deepWorkCapacityMinutes)} min`}
            hint={planning.capacity.message}
          />
        </div>
        {planning.openWindows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No open windows after fixed commitments.</div>
        ) : (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {planning.openWindows.slice(0, 6).map((w) => (
              <li key={`${w.start}-${w.end}`} className="flex items-center justify-between gap-2">
                <span className="font-mono-data">
                  {w.start}–{w.end}
                </span>
                <span className="text-xs">
                  {w.durationMinutes} min · {w.quality} · energy {w.energyScore}/10
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="text-xs font-semibold text-foreground mt-3 mb-1">
          Top deep-work windows
        </div>
        {planning.deepWorkWindows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No window long enough for deep work.</div>
        ) : (
          <ol className="space-y-0.5 text-sm text-muted-foreground list-decimal list-inside">
            {planning.deepWorkWindows.map((w) => (
              <li key={`dw-${w.start}`}>
                {w.start}–{w.end} · {w.quality} (score {w.deepWorkScore}/10)
              </li>
            ))}
          </ol>
        )}

        <div className="mt-2 text-xs text-muted-foreground">
          Recovery reserve {planning.capacity.recoveryReserveMinutes} min ·{" "}
          {planning.recoveryReserveProtected ? (
            <span className="text-emerald-700">Recovery reserve protected.</span>
          ) : (
            <span className="text-rose-700">Recovery reserve at risk.</span>
          )}
        </div>
        {planning.warnings.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-rose-700">
            {planning.warnings.map((warning, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <ShieldCheck size={12} className="mt-0.5 flex-shrink-0" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </CollapsibleSection>
    </div>
  );
}

function SmallStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card-surface p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="font-mono-data mt-2 text-xl font-semibold text-foreground">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground mt-1">{hint}</div> : null}
    </div>
  );
}

function PlanningExportValidationPanel({
  validation,
}: {
  validation: ReturnType<typeof buildPlanningExportValidation>;
}) {
  const warnings = [...validation.blockers, ...validation.warnings];
  return (
    <div
      className={`rounded-xl border p-3 text-sm ${
        validation.canExport
          ? "border-border bg-card text-foreground"
          : "border-destructive/30 bg-destructive/10 text-destructive"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">Planning export validation</div>
        <span className="text-xs text-muted-foreground">
          {validation.canExport ? "Copy allowed" : "Task code required before copy"}
        </span>
      </div>
      {warnings.length === 0 ? (
        <div className="mt-1 text-xs text-muted-foreground">No export warnings.</div>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2 text-xs">
          {warnings.map((warning) => (
            <li key={warning} className="rounded-full border border-border bg-background px-2 py-1">
              {warning}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScheduleImportPanel({
  value,
  onChange,
  parsed,
  preview,
  editableRows,
  tasks,
  onUpdateRow,
  onDeleteRow,
  onDuplicateRow,
  onResetRow,
  onSyncToText,
  notice,
  replaceExistingImported,
  setReplaceExistingImported,
  onParse,
  onPreview,
  onApplyNonConflicting,
  onApplyWithSoftConflicts,
  onCancel,
  planningSnapshot,
  anchors,
  dayDate,
}: {
  value: string;
  onChange: (value: string) => void;
  parsed: ScheduleImportParsed | null;
  preview: ScheduleImportPreview | null;
  editableRows: EditableScheduleRow[] | null;
  tasks: Task[];
  onUpdateRow: (id: string, patch: Partial<EditableScheduleRow>) => void;
  onDeleteRow: (id: string) => void;
  onDuplicateRow: (id: string) => void;
  onResetRow: (id: string) => void;
  onSyncToText: () => void;
  notice: string | null;
  replaceExistingImported: boolean;
  setReplaceExistingImported: (value: boolean) => void;
  onParse: () => void;
  onPreview: () => void;
  onApplyNonConflicting: () => void;
  onApplyWithSoftConflicts: () => void;
  onCancel: () => void;
  planningSnapshot: PlanningSnapshot;
  anchors: CalendarAnchor[];
  dayDate: string;
}) {
  const hasConflicts = preview?.rows.some((row) => row.status === "conflict") ?? false;
  return (
    <div className="card-surface p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-foreground">Paste ChatGPT Schedule Back</div>
          <div className="text-xs text-muted-foreground">
            Paste the parseable SCHEDULE block, preview task-code matches, then apply.
          </div>
        </div>
        {parsed ? (
          <span className="text-xs text-muted-foreground">
            {parsed.schedule.length} parsed · {parsed.unparsed.length} unparsed
          </span>
        ) : null}
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={8}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono-data"
        placeholder={`SCHEDULE
- 09:00-10:00 | TASK-20260514-001 | Task title | deep_work | Protecting must do
- 10:00-10:15 | BREAK | Break | recovery | Prevent overload`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onParse}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted/70"
        >
          Parse Schedule
        </button>
        <button
          onClick={onPreview}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted/70"
        >
          Preview Changes
        </button>
        <button
          onClick={onApplyNonConflicting}
          disabled={!preview}
          className="inline-flex items-center gap-2 rounded-lg border border-primary bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          Apply to Calendar
        </button>
        {hasConflicts ? (
          <button
            onClick={onApplyWithSoftConflicts}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 hover:bg-amber-100"
          >
            Apply despite soft conflicts
          </button>
        ) : null}
        <button
          onClick={onSyncToText}
          disabled={!editableRows || editableRows.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted/70 disabled:opacity-50"
          title="Rewrite the textarea above from the current edited rows"
        >
          Sync edits → text
        </button>
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted/70"
        >
          Cancel
        </button>
        <label className="ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={replaceExistingImported}
            onChange={(event) => setReplaceExistingImported(event.target.checked)}
          />
          Replace existing ChatGPT import blocks for this day
        </label>
      </div>
      {notice ? <div className="notice-warning">{notice}</div> : null}
      {preview && editableRows ? (
        <EditableSchedulePreviewTable
          editableRows={editableRows}
          previewRows={preview.rows}
          tasks={tasks}
          onUpdateRow={onUpdateRow}
          onDeleteRow={onDeleteRow}
          onDuplicateRow={onDuplicateRow}
          onResetRow={onResetRow}
        />
      ) : preview ? (
        <SchedulePreviewTable rows={preview.rows} />
      ) : null}
      {preview ? (
        <ImportRealismNotes
          rows={preview.rows}
          planningSnapshot={planningSnapshot}
          anchors={anchors}
          dayDate={dayDate}
        />
      ) : null}
      {preview && (preview.unscheduled.length > 0 || preview.risks.length > 0 || preview.firstAction) ? (
        <div className="grid gap-3 md:grid-cols-3 text-xs">
          <ImportNoteList title="Unscheduled" items={preview.unscheduled} />
          <ImportNoteList title="Risks" items={preview.risks} />
          <div className="rounded-lg border border-border bg-card/60 p-3">
            <div className="font-semibold text-foreground">First action</div>
            <div className="mt-1 text-muted-foreground">
              {preview.firstAction
                ? `${preview.firstAction.task_code} | ${preview.firstAction.text}`
                : "none"}
            </div>
            <div className="mt-2 text-muted-foreground">
              Plan realism: {preview.planRealism.score ?? "unset"}
              {preview.planRealism.reason ? ` · ${preview.planRealism.reason}` : ""}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ImportRealismNotes({
  rows,
  planningSnapshot,
  anchors,
  dayDate,
}: {
  rows: { start: string; end: string; imported_title: string; block_type: string }[];
  planningSnapshot: PlanningSnapshot;
  anchors: CalendarAnchor[];
  dayDate: string;
}) {
  const report: RealismReport = evaluateImportRealism({
    blocks: rows
      .filter((row) => row.start && row.end)
      .map((row) => ({
        start_time: row.start,
        end_time: row.end,
        title: row.imported_title || "Untitled block",
        block_type: row.block_type,
      })),
    snapshot: planningSnapshot,
    anchors,
    dayDate,
  });
  const blocking = report.issues.filter((issue) => issue.severity === "block");
  const soft = report.issues.filter((issue) => issue.severity === "warn");
  const scoreColor =
    report.score >= 8
      ? "text-emerald-700"
      : report.score >= 5
        ? "text-amber-700"
        : "text-rose-700";
  return (
    <div className="mt-3 rounded-lg border border-border bg-card/60 p-3 text-xs">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="font-semibold text-foreground">Schedule realism check</div>
        <div className={`font-mono-data ${scoreColor}`}>
          Realism: {report.score}/10
        </div>
      </div>
      <div className="text-muted-foreground">
        <span className="font-medium text-foreground">Bottleneck:</span> {report.bottleneck}
      </div>
      <div className="text-muted-foreground">
        <span className="font-medium text-foreground">Correction:</span> {report.correction}
      </div>
      {blocking.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-rose-700">
          {blocking.map((issue, i) => (
            <li key={`block-${i}`}>
              ⛔ <span className="opacity-70">[{issue.category}]</span> {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
      {soft.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-amber-700">
          {soft.map((issue, i) => (
            <li key={`warn-${i}`}>
              ⚠ <span className="opacity-70">[{issue.category}]</span> {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
      {report.issues.length === 0 ? (
        <div className="mt-2 text-emerald-700">No realism issues detected.</div>
      ) : blocking.length === 0 ? (
        <div className="mt-2 text-muted-foreground">
          Soft issues only — you can still apply, but review them first.
        </div>
      ) : (
        <div className="mt-2 text-rose-700">
          Blocking issues detected — fix these before applying.
        </div>
      )}
    </div>
  );
}

function ImportNoteList({
  title,
  items,
}: {
  title: string;
  items: Array<{ task_code: string; reason: string }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <div className="font-semibold text-foreground">{title}</div>
      {items.length === 0 ? (
        <div className="mt-1 text-muted-foreground">none</div>
      ) : (
        <ul className="mt-1 space-y-1 text-muted-foreground">
          {items.map((item) => (
            <li key={`${item.task_code}-${item.reason}`}>
              {item.task_code} | {item.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EditableSchedulePreviewTable({
  editableRows,
  previewRows,
  tasks,
  onUpdateRow,
  onDeleteRow,
  onDuplicateRow,
  onResetRow,
}: {
  editableRows: EditableScheduleRow[];
  previewRows: ScheduleImportPreviewRow[];
  tasks: Task[];
  onUpdateRow: (id: string, patch: Partial<EditableScheduleRow>) => void;
  onDeleteRow: (id: string) => void;
  onDuplicateRow: (id: string) => void;
  onResetRow: (id: string) => void;
}) {
  const knownCodes = Array.from(
    new Set(["BREAK", "FREEFORM", ...tasks.map((t) => t.task_code).filter(Boolean)]),
  );
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <datalist id="schedule-import-task-codes">
        {knownCodes.map((code) => (
          <option key={code} value={code} />
        ))}
      </datalist>
      <table className="min-w-full text-left text-xs">
        <thead className="bg-muted/70 text-muted-foreground">
          <tr>
            <th className="px-2 py-2">Start</th>
            <th className="px-2 py-2">End</th>
            <th className="px-2 py-2">Task code</th>
            <th className="px-2 py-2">Matched task</th>
            <th className="px-2 py-2">Imported title</th>
            <th className="px-2 py-2">Block type</th>
            <th className="px-2 py-2">Reason</th>
            <th className="px-2 py-2">Status</th>
            <th className="px-2 py-2">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {editableRows.map((row, index) => {
            const preview = previewRows[index];
            const status = preview?.status ?? "invalid line";
            const warnings = preview?.warnings ?? [];
            const matchedTitle = preview?.matched_task_title ?? "";
            return (
              <tr
                key={row.id}
                className={`align-top ${row.edited ? "bg-amber-50/40" : "bg-card/60"}`}
              >
                <td className="px-2 py-2 font-mono-data">
                  <input
                    type="time"
                    step={300}
                    value={row.start}
                    onChange={(event) => onUpdateRow(row.id, { start: event.target.value })}
                    className="w-24 rounded border border-border bg-background px-1 py-0.5"
                  />
                </td>
                <td className="px-2 py-2 font-mono-data">
                  <input
                    type="time"
                    step={300}
                    value={row.end}
                    onChange={(event) => onUpdateRow(row.id, { end: event.target.value })}
                    className="w-24 rounded border border-border bg-background px-1 py-0.5"
                  />
                </td>
                <td className="px-2 py-2 font-mono-data">
                  <input
                    type="text"
                    list="schedule-import-task-codes"
                    value={row.task_code}
                    onChange={(event) =>
                      onUpdateRow(row.id, { task_code: event.target.value.toUpperCase() })
                    }
                    className="w-32 rounded border border-border bg-background px-1 py-0.5"
                    placeholder="TASK-… / BREAK / FREEFORM"
                  />
                </td>
                <td className="px-2 py-2 text-muted-foreground">{matchedTitle || "—"}</td>
                <td className="px-2 py-2">
                  <input
                    type="text"
                    value={row.imported_title}
                    onChange={(event) =>
                      onUpdateRow(row.id, { imported_title: event.target.value })
                    }
                    className="w-full min-w-[140px] rounded border border-border bg-background px-1 py-0.5"
                  />
                </td>
                <td className="px-2 py-2">
                  <select
                    value={row.block_type || ""}
                    onChange={(event) => onUpdateRow(row.id, { block_type: event.target.value })}
                    className="rounded border border-border bg-background px-1 py-0.5"
                  >
                    <option value="">—</option>
                    {SCHEDULE_BLOCK_TYPES.map((bt) => (
                      <option key={bt} value={bt}>
                        {bt}
                      </option>
                    ))}
                    {row.block_type && !SCHEDULE_BLOCK_TYPES.includes(row.block_type as never) ? (
                      <option value={row.block_type}>{row.block_type}</option>
                    ) : null}
                  </select>
                </td>
                <td className="px-2 py-2">
                  <input
                    type="text"
                    value={row.reason}
                    onChange={(event) => onUpdateRow(row.id, { reason: event.target.value })}
                    className="w-full min-w-[140px] rounded border border-border bg-background px-1 py-0.5"
                  />
                </td>
                <td className="px-2 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 ${
                      status === "matched" ||
                      status === "freeform block" ||
                      status === "break/recovery block"
                        ? "bg-emerald-50 text-emerald-700"
                        : status === "conflict"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {status}
                  </span>
                  {row.edited ? (
                    <span
                      title="Edited from parsed value"
                      className="ml-1 inline-block h-2 w-2 rounded-full bg-amber-500 align-middle"
                    />
                  ) : null}
                  {warnings.length > 0 ? (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {warnings.join(" · ")}
                    </div>
                  ) : null}
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-col gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => onDuplicateRow(row.id)}
                      className="rounded border border-border bg-card px-1.5 py-0.5 hover:bg-muted/70"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => onResetRow(row.id)}
                      disabled={!row.edited || row.isUnparsed}
                      className="rounded border border-border bg-card px-1.5 py-0.5 hover:bg-muted/70 disabled:opacity-40"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRow(row.id)}
                      className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-rose-700 hover:bg-rose-100"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SchedulePreviewTable({ rows }: { rows: ScheduleImportPreviewRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-muted/70 text-muted-foreground">
          <tr>
            <th className="px-2 py-2">Start</th>
            <th className="px-2 py-2">End</th>
            <th className="px-2 py-2">Task code</th>
            <th className="px-2 py-2">Matched task</th>
            <th className="px-2 py-2">Imported title</th>
            <th className="px-2 py-2">Block type</th>
            <th className="px-2 py-2">Reason</th>
            <th className="px-2 py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, index) => (
            <tr key={`${row.raw}-${index}`} className="bg-card/60 align-top">
              <td className="px-2 py-2 font-mono-data">{row.start || "—"}</td>
              <td className="px-2 py-2 font-mono-data">{row.end || "—"}</td>
              <td className="px-2 py-2 font-mono-data">{row.task_code || "—"}</td>
              <td className="px-2 py-2">{row.matched_task_title || "—"}</td>
              <td className="px-2 py-2">{row.imported_title || row.raw}</td>
              <td className="px-2 py-2">{row.block_type || "—"}</td>
              <td className="px-2 py-2">{row.reason || "—"}</td>
              <td className="px-2 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 ${
                    row.status === "matched" ||
                    row.status === "freeform block" ||
                    row.status === "break/recovery block"
                      ? "bg-emerald-50 text-emerald-700"
                      : row.status === "conflict"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {row.status}
                </span>
                {row.warnings.length > 0 ? (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {row.warnings.join(" · ")}
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FixedAnchorsPanel({
  anchors,
  onUpdate,
  onRemove,
  onGenerateFollowUpTask,
}: {
  anchors: CalendarAnchor[];
  onUpdate: (id: string, patch: Partial<CalendarAnchor>) => void;
  onRemove: (id: string) => void;
  onGenerateFollowUpTask: (anchor: CalendarAnchor) => void;
}) {
  return (
    <div className="card-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-foreground">Fixed anchors</div>
          <div className="text-xs text-muted-foreground">
            Classes, meetings, shifts, appointments, and immovable commitments.
          </div>
        </div>
        <StatusPill tone={anchors.length > 0 ? "info" : "warning"}>
          {anchors.length} today
        </StatusPill>
      </div>
      {anchors.length === 0 ? (
        <EmptyStateCard
          missing="No fixed anchors for this day."
          nextAction="Add the first class, shift, meeting, or appointment below."
          why="Reality planning needs fixed commitments before it can trust open windows."
        />
      ) : (
        <ul className="divide-y divide-border">
          {anchors.map((anchor) => (
            <AnchorRow
              key={anchor.id}
              anchor={anchor}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onGenerateFollowUpTask={onGenerateFollowUpTask}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TodayView({
  anchors,
  timeBlocks,
  tasks,
  timeline,
  conflicts,
  importedBlocksAdvancedOnly = false,
  onUpdate,
  onRemove,
  onRemoveTimeBlock,
  onUpdateTimeBlockStatus,
  onUpdateTimeBlockExecutionStatus,
  onGenerateFollowUpTask,
}: {
  anchors: CalendarAnchor[];
  timeBlocks: TimeBlock[];
  tasks: Task[];
  timeline: ReturnType<typeof buildTodayTimeline>;
  conflicts: ReturnType<typeof detectConflicts>;
  importedBlocksAdvancedOnly?: boolean;
  onUpdate: (id: string, patch: Partial<CalendarAnchor>) => void;
  onRemove: (id: string) => void;
  onRemoveTimeBlock: (id: string) => void;
  onUpdateTimeBlockStatus: (id: string, status: TimeBlock["status"]) => void;
  onUpdateTimeBlockExecutionStatus: (
    id: string,
    executionStatus: TimeBlock["execution_status"],
  ) => void;
  onGenerateFollowUpTask: (anchor: CalendarAnchor) => void;
}) {
  const importedBlocksSection = (
    <div className="mt-5 border-t border-border pt-4">
      <div className="text-sm font-semibold text-foreground mb-3">Imported time blocks</div>
      <TimeBlockList
        blocks={timeBlocks}
        tasks={tasks}
        onRemove={onRemoveTimeBlock}
        onUpdateStatus={onUpdateTimeBlockStatus}
        onUpdateExecutionStatus={onUpdateTimeBlockExecutionStatus}
      />
    </div>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="card-surface p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-foreground">Today timeline</div>
          <div className="text-xs text-muted-foreground">
            {timeline.length} blocks
          </div>
        </div>
        {conflicts.length > 0 && (
          <div className="notice-warning mb-3 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold">{conflicts.length} overlap{conflicts.length === 1 ? "" : "s"} detected</div>
              <ul className="mt-1 space-y-0.5">
                {conflicts.map((c, i) => (
                  <li key={i}>
                    {c.a.title} ({c.a.start_time}) ↔ {c.b.title} ({c.b.start_time})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <Timeline timeline={timeline} />
      </div>
      <div className="card-surface p-4">
        <div className="text-sm font-semibold text-foreground mb-3">Today anchors</div>
        {anchors.length === 0 ? (
          <div className="empty-state">
            No anchors yet for this day. Add a class, Connex Zoom, work shift, or appointment below.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {anchors.map((a) => (
              <AnchorRow
                key={a.id}
                anchor={a}
                onUpdate={onUpdate}
                onRemove={onRemove}
                onGenerateFollowUpTask={onGenerateFollowUpTask}
              />
            ))}
          </ul>
        )}
        {importedBlocksAdvancedOnly ? (
          <AdvancedOnly>{importedBlocksSection}</AdvancedOnly>
        ) : (
          importedBlocksSection
        )}
      </div>
    </div>
  );
}

function Timeline({ timeline }: { timeline: ReturnType<typeof buildTodayTimeline> }) {
  if (timeline.length === 0) {
    return <div className="empty-state">Add an anchor or set wake/sleep to see your timeline.</div>;
  }
  return (
    <ol className="relative ml-3 border-l border-border space-y-3">
      {timeline.map((slot, i) => {
        const palette = slot.kind === "anchor" && slot.category
          ? CATEGORY_COLORS[slot.category]
          : null;
        const dot =
          slot.kind === "deep-work"
            ? "bg-sky-500"
            : slot.kind === "workout"
              ? "bg-emerald-500"
              : slot.kind === "maintenance"
                ? "bg-amber-500"
                : slot.kind === "shutdown"
                  ? "bg-violet-500"
                  : slot.kind === "break"
                    ? "bg-teal-500"
                    : slot.kind === "freeform"
                      ? "bg-zinc-500"
                      : slot.kind === "imported-task"
                        ? "bg-blue-500"
                        : "bg-primary";
        const tooltip = [
          `${slot.label} (${slot.start}–${slot.end})`,
          slot.kind ? `Kind: ${slot.kind}` : "",
          slot.category ? `Category: ${slot.category}` : "",
          slot.detail ? `Details: ${slot.detail}` : "",
        ]
          .filter(Boolean)
          .join("\n");
        return (
          <li key={`${slot.start}-${i}`} className="ml-4 relative cursor-help" title={tooltip}>
            <span
              className={`absolute -left-[22px] top-1.5 inline-block h-2.5 w-2.5 rounded-full ring-2 ring-background ${dot}`}
            />
            <div className="flex items-baseline gap-3">
              <span className="font-mono-data text-xs text-muted-foreground tabular-nums">
                {slot.start}–{slot.end}
              </span>
              <span className="text-sm text-foreground">{slot.label}</span>
              {palette && slot.category ? (
                <span
                  className={`ml-1 text-[10px] font-medium uppercase tracking-wider ${palette.bg} ${palette.text} rounded-full px-2 py-0.5`}
                >
                  {slot.category}
                </span>
              ) : null}
            </div>
            {slot.detail ? (
              <div className="text-xs text-muted-foreground mt-0.5">{slot.detail}</div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function TimeBlockList({
  blocks,
  tasks,
  onRemove,
  onUpdateStatus,
  onUpdateExecutionStatus,
}: {
  blocks: TimeBlock[];
  tasks: Task[];
  onRemove: (id: string) => void;
  onUpdateStatus: (id: string, status: TimeBlock["status"]) => void;
  onUpdateExecutionStatus: (
    id: string,
    executionStatus: TimeBlock["execution_status"],
  ) => void;
}) {
  if (blocks.length === 0) {
    return (
      <EmptyStateCard
        missing="No imported schedule blocks for this day."
        nextAction="Use Plan with AI, paste the schedule back, then apply it."
        why="Imported blocks turn the plan into executable progress."
      />
    );
  }
  return (
    <ul className="divide-y divide-border">
      {blocks.map((block) => {
        const task = block.linked_task_id
          ? tasks.find((candidate) => candidate.id === block.linked_task_id)
          : null;
        const isDone = block.status === "complete" || block.execution_status === "done";
        const isInProgress = block.execution_status === "in_progress";
        return (
          <li key={block.id} className="py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono-data text-xs text-muted-foreground">
                    {block.start_time}-{block.end_time}
                  </span>
                  <span className="text-sm font-medium text-foreground">{block.title}</span>
                  <AdvancedOnly>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700">
                      {block.source === "chatgpt_import" ? "ChatGPT import" : block.source ?? "manual"}
                    </span>
                  </AdvancedOnly>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {block.execution_status === "not_started"
                      ? block.status
                      : block.execution_status}
                  </span>
                </div>
                <AdvancedOnly>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {task ? `${task.task_code} · ${task.title}` : "No linked task"}
                    {block.reason ? ` · ${block.reason}` : ""}
                  </div>
                </AdvancedOnly>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <button
                  onClick={() =>
                    onUpdateExecutionStatus(
                      block.id,
                      isInProgress || isDone ? "done" : "in_progress",
                    )
                  }
                  disabled={isDone}
                  className="rounded-md border border-primary bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60"
                >
                  {isDone ? "Complete" : isInProgress ? "Complete" : "Start"}
                </button>
                <details className="relative">
                  <summary className="cursor-pointer list-none rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:bg-muted/70">
                    More
                  </summary>
                  <div className="absolute right-0 z-10 mt-1 min-w-40 rounded-md border border-border bg-popover p-1 text-xs shadow-md">
                    <button
                      type="button"
                      onClick={() => onUpdateExecutionStatus(block.id, "done")}
                      className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted"
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateExecutionStatus(block.id, "partial")}
                      className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted"
                    >
                      Partial
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateExecutionStatus(block.id, "missed")}
                      className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted"
                    >
                      Missed
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateExecutionStatus(block.id, "skipped")}
                      className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted"
                    >
                      Skip
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateExecutionStatus(block.id, "rescheduled")}
                      className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted"
                    >
                      Reschedule
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(block.id)}
                      className="block w-full rounded px-2 py-1.5 text-left text-destructive hover:bg-muted"
                    >
                      Delete block only
                    </button>
                  </div>
                </details>
              </div>
            </div>
            <AdvancedOnly>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <button
                  onClick={() => onUpdateStatus(block.id, "complete")}
                  className="rounded-md border border-border bg-card px-2 py-1 hover:bg-muted/70"
                >
                  Mark complete status
                </button>
                <button
                  onClick={() => onUpdateStatus(block.id, "missed")}
                  className="rounded-md border border-border bg-card px-2 py-1 hover:bg-muted/70"
                >
                  Mark missed status
                </button>
              </div>
            </AdvancedOnly>
          </li>
        );
      })}
    </ul>
  );
}

function AnchorRow({
  anchor,
  onUpdate,
  onRemove,
  onGenerateFollowUpTask,
}: {
  anchor: CalendarAnchor;
  onUpdate: (id: string, patch: Partial<CalendarAnchor>) => void;
  onRemove: (id: string) => void;
  onGenerateFollowUpTask: (anchor: CalendarAnchor) => void;
}) {
  const palette = CATEGORY_COLORS[anchor.category];
  const prepItems = anchor.prep
    .split(/\n|;|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  return (
    <li className="py-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 ${palette.bg} ${palette.text}`}
            >
              {anchor.category}
            </span>
            <span className="text-sm font-medium text-foreground">{anchor.title}</span>
            <span className="font-mono-data text-xs text-muted-foreground">
              {anchor.start_time}–{anchor.end_time} · {anchorDuration(anchor)}m
            </span>
            <span className="text-[10px] text-muted-foreground">{anchor.privacy}</span>
          </div>
          {(anchor.location || anchor.link || anchor.people) && (
            <div className="text-xs text-muted-foreground mt-1">
              {[anchor.location, anchor.people].filter(Boolean).join(" · ")}
              {anchor.link ? (
                <>
                  {" · "}
                  <a className="underline" href={anchor.link} target="_blank" rel="noreferrer">
                    link
                  </a>
                </>
              ) : null}
            </div>
          )}
        </div>
        <button
          onClick={() => onRemove(anchor.id)}
          className="text-muted-foreground hover:text-destructive"
          title="Delete"
        >
          <Trash2 size={16} />
        </button>
      </div>
      {(anchor.prep || anchor.follow_up || anchor.notes) && (
        <div className="grid gap-2 md:grid-cols-3 text-xs">
          {anchor.prep ? (
            <div className="rounded-lg bg-muted/60 p-2">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <ListChecks size={11} />
                Prep checklist
              </div>
              <ul className="mt-1 space-y-0.5 text-foreground">
                {prepItems.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {anchor.follow_up ? (
            <div className="rounded-lg bg-muted/60 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Follow up</div>
              <div className="text-foreground">{anchor.follow_up}</div>
            </div>
          ) : null}
          {anchor.notes ? (
            <div className="rounded-lg bg-muted/60 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</div>
              <div className="text-foreground">{anchor.notes}</div>
            </div>
          ) : null}
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-xs">
        <select
          value={anchor.privacy}
          onChange={(e) => onUpdate(anchor.id, { privacy: e.target.value as PrivacyLevel })}
          className="rounded-md border border-border bg-card px-2 py-1"
        >
          {PRIVACY_LEVELS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={anchor.category}
          onChange={(e) => onUpdate(anchor.id, { category: e.target.value as AnchorCategory })}
          className="rounded-md border border-border bg-card px-2 py-1"
        >
          {ANCHOR_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          onClick={() => onGenerateFollowUpTask(anchor)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-foreground hover:bg-muted/70"
        >
          <ListChecks size={12} />
          Generate follow up task
        </button>
        <span className="inline-flex items-center text-[11px] text-muted-foreground">
          linked_anchor_id plus notes reference
        </span>
      </div>
    </li>
  );
}

function AgendaView({
  anchors,
  timeBlocks,
  onRemove,
  onRemoveTimeBlock,
}: {
  anchors: CalendarAnchor[];
  timeBlocks: TimeBlock[];
  onRemove: (id: string) => void;
  onRemoveTimeBlock: (id: string) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, { anchors: CalendarAnchor[]; blocks: TimeBlock[] }>();
    for (const a of anchors) {
      const group = map.get(a.date) ?? { anchors: [], blocks: [] };
      group.anchors.push(a);
      map.set(a.date, group);
    }
    for (const block of timeBlocks) {
      const group = map.get(block.date) ?? { anchors: [], blocks: [] };
      group.blocks.push(block);
      map.set(block.date, group);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [anchors, timeBlocks]);

  if (grouped.length === 0) {
    return <div className="empty-state">No anchors on the agenda yet. Add one below.</div>;
  }

  return (
    <div className="space-y-3">
      {grouped.map(([date, group]) => (
        <div key={date} className="card-surface p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-foreground">
              {new Date(date).toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </div>
            <span className="text-xs text-muted-foreground">
              {group.anchors.length} anchors · {group.blocks.length} blocks
            </span>
          </div>
          <ul className="space-y-2">
            {group.anchors.map((a) => {
              const palette = CATEGORY_COLORS[a.category];
              return (
                <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/60 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 ${palette.bg} ${palette.text}`}
                    >
                      {a.category}
                    </span>
                    <span className="font-mono-data text-xs text-muted-foreground">
                      {a.start_time}–{a.end_time}
                    </span>
                    <span className="text-sm text-foreground truncate">{a.title}</span>
                  </div>
                  <button
                    onClick={() => onRemove(a.id)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
            {group.blocks.map((block) => {
              const code = block.notes.match(/task_code:\s*([A-Z0-9-]+)/i)?.[1];
              return (
                <li
                  key={block.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-blue-50/60 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">
                      {block.source === "chatgpt_import" ? "ChatGPT import" : block.source ?? "Block"}
                    </span>
                    <span className="font-mono-data text-xs text-muted-foreground">
                      {block.start_time}-{block.end_time}
                    </span>
                    {code ? (
                      <span className="font-mono-data text-xs text-blue-800">{code}</span>
                    ) : null}
                    <span className="text-sm text-foreground truncate">{block.title}</span>
                  </div>
                  <button
                    onClick={() => onRemoveTimeBlock(block.id)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Delete time block only"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function WeekView({ anchors, activeDate }: { anchors: CalendarAnchor[]; activeDate: string }) {
  const weekStart = useMemo(() => {
    const d = new Date(activeDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d;
  }, [activeDate]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const key = toDateKey(d);
      return {
        key,
        label: d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
        anchors: anchors.filter((a) => a.date === key),
      };
    });
  }, [weekStart, anchors]);

  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-foreground">Week view</div>
        <div className="text-xs text-muted-foreground">
          Lightweight grid · drag-to-schedule arrives in roadmap
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => (
          <div key={d.key} className="rounded-xl border border-border bg-card/60 p-2 min-h-[140px]">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              {d.label}
            </div>
            <ul className="space-y-1">
              {d.anchors
                .sort((x, y) => parseTimeToMinutes(x.start_time) - parseTimeToMinutes(y.start_time))
                .slice(0, 6)
                .map((a) => {
                  const palette = CATEGORY_COLORS[a.category];
                  return (
                    <li
                      key={a.id}
                      className={`text-[11px] rounded-md px-1.5 py-1 ${palette.bg} ${palette.text}`}
                    >
                      <div className="font-mono-data text-[10px] opacity-80">{a.start_time}</div>
                      <div className="truncate">{a.title}</div>
                    </li>
                  );
                })}
              {d.anchors.length === 0 && (
                <li className="text-[11px] text-muted-foreground">—</li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthView({ anchors, activeDate }: { anchors: CalendarAnchor[]; activeDate: string }) {
  const cells = useMemo(() => {
    const d = new Date(activeDate);
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const start = new Date(first);
    const startDay = first.getDay();
    start.setDate(first.getDate() - ((startDay + 6) % 7));
    return Array.from({ length: 42 }).map((_, i) => {
      const cur = new Date(start);
      cur.setDate(start.getDate() + i);
      const key = toDateKey(cur);
      return {
        key,
        day: cur.getDate(),
        inMonth: cur.getMonth() === d.getMonth(),
        anchors: anchors.filter((a) => a.date === key),
      };
    });
  }, [activeDate, anchors]);

  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-foreground">
          {new Date(activeDate).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </div>
        <div className="text-xs text-muted-foreground">
          Placeholder grid · click a day in the picker above to focus.
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => (
          <div
            key={c.key}
            className={`min-h-[78px] rounded-md border border-border p-1 ${c.inMonth ? "bg-card/60" : "bg-muted/30 opacity-60"}`}
          >
            <div className="text-[10px] text-muted-foreground">{c.day}</div>
            <div className="mt-1 space-y-0.5">
              {c.anchors.slice(0, 2).map((a) => {
                const palette = CATEGORY_COLORS[a.category];
                return (
                  <div
                    key={a.id}
                    className={`truncate text-[10px] rounded px-1 ${palette.bg} ${palette.text}`}
                  >
                    {a.start_time} {a.title}
                  </div>
                );
              })}
              {c.anchors.length > 2 && (
                <div className="text-[10px] text-muted-foreground">+{c.anchors.length - 2}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddAnchorPanel({
  draft,
  setDraft,
  onAdd,
}: {
  draft: Omit<CalendarAnchor, "id" | "created_at" | "updated_at">;
  setDraft: React.Dispatch<
    React.SetStateAction<Omit<CalendarAnchor, "id" | "created_at" | "updated_at">>
  >;
  onAdd: () => void;
}) {
  const update = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Auto-bump end time when start changes if the user has not customized it.
  const onStartChange = (v: string) => {
    setDraft((d) => {
      const startNew = parseTimeToMinutes(v);
      const startOld = parseTimeToMinutes(d.start_time);
      const endOld = parseTimeToMinutes(d.end_time);
      const duration = Math.max(15, endOld - startOld);
      return { ...d, start_time: v, end_time: minutesToTime(startNew + duration) };
    });
  };

  return (
    <div className="card-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">Add an anchor</div>
        <div className="text-xs text-muted-foreground">
          Anchors are fixed events. Flexible work goes in Tasks.
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-5 text-xs">
        <label className="flex flex-col text-[10px] uppercase tracking-wider text-muted-foreground md:col-span-2">
          Title
          <input
            placeholder="Connex Zoom, class, work shift"
            value={draft.title}
            onChange={(e) => update("title", e.target.value)}
            className="mt-1 rounded-md border border-border bg-card px-3 py-2 text-sm normal-case tracking-normal text-foreground"
          />
        </label>
        <label className="flex flex-col text-[10px] uppercase tracking-wider text-muted-foreground">
          Type
          <select
            value={draft.category}
            onChange={(e) => update("category", e.target.value as AnchorCategory)}
            className="mt-1 rounded-md border border-border bg-card px-3 py-2 text-sm normal-case tracking-normal text-foreground"
          >
            {ANCHOR_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-2 md:grid-cols-3 text-xs">
        <Field label="Date" type="date" value={draft.date} onChange={(v) => update("date", v)} />
        <Field label="Start" type="time" value={draft.start_time} onChange={onStartChange} />
        <Field label="End" type="time" value={draft.end_time} onChange={(v) => update("end_time", v)} />
      </div>

      <CollapsibleSection title="More details">
        <div className="space-y-3">
          <div className="grid gap-2 md:grid-cols-3 text-xs">
            <Field label="Location" value={draft.location} onChange={(v) => update("location", v)} placeholder="Room, building, address" />
            <Field label="Link" value={draft.link} onChange={(v) => update("link", v)} placeholder="Zoom or meeting URL" />
            <Field label="People" value={draft.people} onChange={(v) => update("people", v)} placeholder="Who is involved" />
          </div>
          <div className="grid gap-2 md:grid-cols-3 text-xs">
            <Field label="Prep" value={draft.prep} onChange={(v) => update("prep", v)} placeholder="What to do before" />
            <Field label="Follow up" value={draft.follow_up} onChange={(v) => update("follow_up", v)} placeholder="What to do after" />
            <Field
              label="Notes"
              value={draft.notes}
              onChange={(v) => update("notes", v)}
              placeholder="Anything to remember"
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col text-[10px] uppercase tracking-wider text-muted-foreground">
              Privacy
              <select
                value={draft.privacy}
                onChange={(e) => update("privacy", e.target.value as PrivacyLevel)}
                className="mt-1 rounded-md border border-border bg-card px-2 py-1 text-sm normal-case tracking-normal"
              >
                {PRIVACY_LEVELS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={draft.recurring}
                onChange={(e) => update("recurring", e.target.checked)}
              />
              Recurring <span className="uppercase tracking-wider">(Draft only)</span>
            </label>
          </div>
        </div>
      </CollapsibleSection>
      <button
        onClick={onAdd}
        disabled={!draft.title.trim()}
        className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus size={14} /> Add anchor
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`flex flex-col text-[10px] uppercase tracking-wider text-muted-foreground ${className}`}>
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 rounded-md border border-border bg-card px-2 py-1 text-sm normal-case tracking-normal text-foreground"
      />
    </label>
  );
}

function RecurringLoopsPanel({ loops }: { loops: ReturnType<typeof listRecurringLoops> }) {
  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Repeat size={14} className="text-primary" />
          <div className="text-sm font-semibold text-foreground">Recurring life loops</div>
        </div>
        <span className="text-xs text-muted-foreground">
          Triggers, cadence, and next firing
        </span>
      </div>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {loops.map((loop) => (
          <li key={loop.id} className="rounded-xl border border-border bg-card/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-foreground">{loop.title}</div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {loop.cadence}
              </span>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock size={11} /> {loop.trigger} · next: {loop.next_occurrence}
            </div>
            <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
              {loop.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <div className="text-[11px] text-foreground">→ {loop.expected_output}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
