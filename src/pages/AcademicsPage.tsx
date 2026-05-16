import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import { SyncBadge } from "@/components/SyncBadge";
import type { AcademicTaskRow } from "@/lib/supabase-types";
import { calculateAcademicPriorityScore } from "@/lib/life-scoring";
import { toDateKey } from "@/lib/date-helpers";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import { getStatusColor } from "@/components/StatusRing";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { runSupabasePersistence } from "@/lib/persistence-runner";
import {
  deleteAcademicTask,
  fetchAcademicTasks,
  upsertAcademicTask,
  upsertUniversalTask,
  type AcademicTaskPayload,
} from "@/lib/lifeee-persistence";
import { makeTask } from "@/lib/task-system";
import {
  CollapsibleSection,
  EmptyStateCard,
  NextActionCard,
  PageDecisionHeader,
  StatusPill,
} from "@/components/ui-kit";
import {
  academicSliderColor,
  calculateAcademicPressure,
} from "@/lib/academic-pressure";

type AcademicTaskForm = {
  className: string;
  taskName: string;
  itemType: "assignment" | "exam" | "quiz" | "lab" | "project" | "reading";
  dueDate: string;
  estimatedHours: number;
  difficulty: number;
  gradeImpact: number;
  status: "pending" | "in_progress" | "completed";
  notes: string;
};

const baseForm: Omit<AcademicTaskForm, "dueDate"> = {
  className: "",
  taskName: "",
  itemType: "assignment",
  estimatedHours: 1,
  difficulty: 5,
  gradeImpact: 5,
  status: "pending",
  notes: "",
};

function createDefaultForm(): AcademicTaskForm {
  return {
    ...baseForm,
    dueDate: toDateKey(new Date()),
  };
}

function estimateUrgency(dueDate: string) {
  const daysUntilDue = Math.ceil(
    (new Date(dueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
  );
  return Math.max(1, Math.min(10, 10 - daysUntilDue));
}

function formToRowDraft(form: AcademicTaskForm, userId: string) {
  const priorityScore = calculateAcademicPriorityScore({
    gradeImpact: form.gradeImpact,
    urgency: estimateUrgency(form.dueDate),
    difficulty: form.difficulty,
    timeRequiredScore: Math.min(10, form.estimatedHours),
  });

  return {
    id: crypto.randomUUID(),
    user_id: userId,
    class_name: form.className,
    task_name: form.taskName,
    due_date: new Date(form.dueDate).toISOString(),
    estimated_hours: form.estimatedHours,
    difficulty: form.difficulty,
    grade_impact: form.gradeImpact,
    status: form.status,
    priority_score: priorityScore,
    notes: academicNotesFromForm(form),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } satisfies AcademicTaskRow;
}

function taskPayloadFromForm(form: AcademicTaskForm): AcademicTaskPayload {
  const priorityScore = calculateAcademicPriorityScore({
    gradeImpact: form.gradeImpact,
    urgency: estimateUrgency(form.dueDate),
    difficulty: form.difficulty,
    timeRequiredScore: Math.min(10, form.estimatedHours),
  });

  return {
    class_name: form.className.trim(),
    task_name: form.taskName.trim(),
    due_date: new Date(form.dueDate).toISOString(),
    estimated_hours: form.estimatedHours,
    difficulty: form.difficulty,
    grade_impact: form.gradeImpact,
    status: form.status,
    priority_score: priorityScore,
    notes: academicNotesFromForm(form),
  };
}

function academicNotesFromForm(form: AcademicTaskForm) {
  const notes = form.notes.trim();
  const typeLine = `Type: ${form.itemType}`;
  return notes ? `${typeLine}\n${notes}` : typeLine;
}

// Bridge academic tasks into universal_tasks so they participate in the
// canonical task system (smart views, Daily OS, Calendar Planning exports).
// Identity is derived from the academic task id so re-saves update in place.
function buildUniversalTaskFromAcademic(row: AcademicTaskRow) {
  const due = row.due_date ? row.due_date.slice(0, 10) : null;
  const estimatedMinutes = Math.max(15, Math.round((row.estimated_hours ?? 1) * 60));
  const score = row.priority_score ?? 0;
  const priority: "low" | "medium" | "high" | "critical" =
    score >= 8 ? "critical" : score >= 6 ? "high" : score >= 4 ? "medium" : "low";
  const status: "completed" | "today" | "inbox" =
    row.status === "completed" ? "completed" : row.status === "in_progress" ? "today" : "inbox";
  return makeTask({
    id: `academic_${row.id}`,
    title: row.task_name,
    description: row.notes ?? "",
    task_type: "Academic",
    due_date: due,
    estimated_minutes: estimatedMinutes,
    priority,
    status,
    source: "academic",
    generated_from: {
      source: "academic",
      academic_task_id: row.id,
      class_name: row.class_name,
      grade_impact: row.grade_impact,
      difficulty: row.difficulty,
    },
  });
}

function taskPayloadFromRow(task: AcademicTaskRow): AcademicTaskPayload {
  return {
    id: task.id,
    class_name: task.class_name,
    task_name: task.task_name,
    due_date: task.due_date,
    estimated_hours: task.estimated_hours,
    difficulty: task.difficulty,
    grade_impact: task.grade_impact,
    status: task.status,
    priority_score: task.priority_score,
    notes: task.notes,
  };
}

export default function AcademicsPage() {
  const { hasSupabaseConfig: supabaseConfigured, isLoading: sessionLoading, userId } =
    useSupabaseSession();
  const [form, setForm] = useState<AcademicTaskForm>(() => createDefaultForm());
  const [tasks, setTasks] = useState<AcademicTaskRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const remoteLoadedRef = useRef(false);
  const { syncStatus, setSyncStatus } = useSyncStatus("local");

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (sessionLoading) {
        setIsLoading(true);
        setSyncStatus("waiting");
        return;
      }

      if (!supabaseConfigured || !userId) {
        if (!active) return;
        remoteLoadedRef.current = false;
        setIsLoading(false);
        setNotice(
          supabaseConfigured
            ? "Not signed in. Tasks stay as a local draft until you sign in."
            : "Sign-in is unavailable right now. Tasks stay as a local draft.",
        );
        setSyncStatus(supabaseConfigured ? "waiting" : "local");
        return;
      }

      setIsLoading(true);
      setError(null);
      setSyncStatus("loading");

      try {
        const data = await fetchAcademicTasks(userId);

        if (!active) return;

        setTasks(data);
        remoteLoadedRef.current = true;
        setNotice("Loaded saved data.");
        setSyncStatus("saved");
      } catch (loadError) {
        if (!active) return;
        remoteLoadedRef.current = false;
        setError(loadError instanceof Error ? loadError.message : "Unable to load academic tasks.");
        setSyncStatus("error");
      }

      setIsLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, [sessionLoading, setSyncStatus, supabaseConfigured, userId]);

  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => Number(b.priority_score ?? 0) - Number(a.priority_score ?? 0)),
    [tasks],
  );

  const highRiskTasks = sortedTasks.filter(
    (task) =>
      Number(task.priority_score ?? 0) >= 8 ||
      Number(task.grade_impact ?? 0) >= 8 ||
      estimateUrgency(task.due_date) >= 8,
  );

  const chartData = sortedTasks.slice(0, 6).map((task) => ({
    name: task.task_name.slice(0, 12),
    score: Number(task.priority_score ?? 0),
  }));
  const highestRisk = highRiskTasks[0] ?? sortedTasks[0] ?? null;
  const academicPressure = calculateAcademicPressure(sortedTasks);
  const courseOptions = useMemo(
    () => Array.from(new Set(sortedTasks.map((task) => task.class_name).filter(Boolean))).sort(),
    [sortedTasks],
  );

  const handleAddTask = async () => {
    if (!form.className.trim() || !form.taskName.trim()) return;

    if (!userId) {
      setTasks((current) => [
        formToRowDraft(form, "local-draft"),
        ...current,
      ]);
      setForm(createDefaultForm());
      setNotice("Task added in local draft mode.");
      setSyncStatus(supabaseConfigured ? "waiting" : "local");
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);
    setSyncStatus("saving");

    const result = await runSupabasePersistence({
      hasSupabaseConfig: supabaseConfigured,
      userId,
      hasLoadedRemote: remoteLoadedRef.current,
      operation: () => upsertAcademicTask(userId, taskPayloadFromForm(form)),
    });

    if (result.ok && result.data) {
      const savedTask = result.data;
      setTasks((current) => [savedTask, ...current]);
      setForm(createDefaultForm());
      setNotice("Task saved.");
      setSyncStatus(result.status);
      // Bridge to canonical task system; best-effort, never blocks the user.
      void upsertUniversalTask(userId, buildUniversalTaskFromAcademic(savedTask), 6).catch(
        () => undefined,
      );
    } else if (!result.ok) {
      setError(result.error);
      setSyncStatus(result.status);
    }

    setIsSaving(false);
  };

  const updateTaskStatus = async (
    id: string,
    status: "pending" | "in_progress" | "completed",
  ) => {
    const existingTask = tasks.find((task) => task.id === id);
    if (!existingTask) return;
    const nextTask = { ...existingTask, status };
    setTasks((current) => current.map((task) => (task.id === id ? nextTask : task)));

    if (!userId) {
      setSyncStatus(supabaseConfigured ? "waiting" : "local");
      return;
    }

    setSyncStatus("saving");
    const result = await runSupabasePersistence({
      hasSupabaseConfig: supabaseConfigured,
      userId,
      hasLoadedRemote: remoteLoadedRef.current,
      operation: () => upsertAcademicTask(userId, taskPayloadFromRow(nextTask)),
    });

    if (result.ok) {
      setSyncStatus(result.status);
      // Keep bridged universal_task in sync (status + metadata).
      void upsertUniversalTask(userId, buildUniversalTaskFromAcademic(nextTask), 6).catch(
        () => undefined,
      );
    } else {
      setError(result.error);
      setSyncStatus(result.status);
    }
  };

  const deleteTask = async (id: string) => {
    setTasks((current) => current.filter((task) => task.id !== id));

    if (!userId) {
      setSyncStatus(supabaseConfigured ? "waiting" : "local");
      return;
    }

    setSyncStatus("saving");
    const result = await runSupabasePersistence({
      hasSupabaseConfig: supabaseConfigured,
      userId,
      hasLoadedRemote: remoteLoadedRef.current,
      operation: () => deleteAcademicTask(userId, id),
    });

    if (result.ok) {
      setSyncStatus(result.status);
    } else {
      setError(result.error);
      setSyncStatus(result.status);
    }
  };

  return (
    <div className="space-y-6">
      <PageDecisionHeader
        title="Academic Risk Control"
        question="What academic item can hurt the week if it slips?"
      >
        <SyncBadge status={syncStatus} />
      </PageDecisionHeader>

      <NextActionCard
        label="Academic pressure"
        title={`${academicPressure.category} · ${academicPressure.rawScore.toFixed(1)}`}
        tone={academicPressure.category === "High" || academicPressure.category === "Critical" ? "warning" : "calm"}
        detail={
          highestRisk
            ? `Highest risk: ${highestRisk.class_name} - ${highestRisk.task_name}. Next action: start the first 25 minutes or mark it in progress.`
            : "No deadlines captured yet. Add the first course item so pressure is visible."
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 space-y-4">
          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#25313c] mb-3">
              ADD TASK
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="col-span-2 md:col-span-1">
                <label className="text-[10px] uppercase tracking-wider text-[#6f685f] block mb-1">
                  Item title
                </label>
                <input
                  type="text"
                  placeholder="Problem set, exam, lab report"
                  value={form.taskName}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, taskName: e.target.value }))
                  }
                  className="input-dark w-full"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#6f685f] block mb-1">
                  Course
                </label>
                <input
                  list="academic-course-options"
                  type="text"
                  placeholder="BIO 101"
                  value={form.className}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, className: e.target.value }))
                  }
                  className="input-dark w-full"
                />
                <datalist id="academic-course-options">
                  {courseOptions.map((course) => (
                    <option key={course} value={course} />
                  ))}
                </datalist>
                {form.className.trim() && !courseOptions.includes(form.className.trim()) ? (
                  <div className="mt-1 text-[10px] text-[#8c8478]">
                    Class name will be saved on this item: {form.className.trim()}
                  </div>
                ) : null}
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#6f685f] block mb-1">
                  Type
                </label>
                <select
                  value={form.itemType}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      itemType: e.target.value as AcademicTaskForm["itemType"],
                    }))
                  }
                  className="input-dark w-full"
                >
                  <option value="assignment">Assignment</option>
                  <option value="exam">Exam</option>
                  <option value="quiz">Quiz</option>
                  <option value="lab">Lab</option>
                  <option value="project">Project</option>
                  <option value="reading">Reading</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#6f685f] block mb-1">
                  Due date
                </label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, dueDate: e.target.value }))
                  }
                  className="input-dark w-full"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#6f685f] block mb-1">
                  Estimated hours
                </label>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={form.estimatedHours}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      estimatedHours: Number(e.target.value),
                    }))
                  }
                  className="input-dark w-full"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#6f685f] block mb-1">
                  Difficulty
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={form.difficulty}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      difficulty: Number(e.target.value),
                    }))
                  }
                  className="slider-dark"
                  style={{ accentColor: academicSliderColor(form.difficulty) }}
                />
                <span className="text-[10px] text-[#6f685f]">
                  {form.difficulty}/10
                </span>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#6f685f] block mb-1">
                  Grade impact
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={form.gradeImpact}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      gradeImpact: Number(e.target.value),
                    }))
                  }
                  className="slider-dark"
                  style={{ accentColor: academicSliderColor(form.gradeImpact) }}
                />
                <span className="text-[10px] text-[#6f685f]">
                  {form.gradeImpact}/10
                </span>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#6f685f] block mb-1">
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      status: e.target.value as AcademicTaskForm["status"],
                    }))
                  }
                  className="input-dark w-full"
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="md:col-span-3 col-span-2">
                <label className="text-[10px] uppercase tracking-wider text-[#6f685f] block mb-1">
                  Notes
                </label>
                <textarea
                  className="input-dark h-20 w-full resize-none"
                  placeholder="Why this matters, what to do first, anything useful"
                  value={form.notes}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, notes: e.target.value }))
                  }
                />
              </div>
            </div>
            <button
              onClick={handleAddTask}
              className="btn-primary mt-3 inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSaving || isLoading || sessionLoading}
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add Task
            </button>
          </div>

          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#25313c] mb-3">
              DEADLINES - Sorted by Grade Risk
            </h3>
            {error ? (
              <div className="mb-3 rounded border border-[#c97a73]/30 bg-[#c97a73]/10 px-3 py-2 text-xs text-[#c97a73]">
                {error}
              </div>
            ) : null}
            {notice ? (
              <div className="mb-3 rounded border border-[#ddd4c6] bg-[#fdfaf4] px-3 py-2 text-xs text-[#6f685f]">
                {notice}
              </div>
            ) : null}
            {supabaseConfigured && !userId ? (
              <div className="mb-3 rounded border border-[#6b87ae]/30 bg-[#6b87ae]/10 px-3 py-2 text-xs text-[#6b87ae]">
                Not signed in yet. Draft mode is
                still available.
              </div>
            ) : null}
            {!supabaseConfigured ? (
              <div className="mb-3 rounded border border-[#c39a4e]/30 bg-[#c39a4e]/10 px-3 py-2 text-xs text-[#c39a4e]">
                Sign-in is unavailable right now. Tasks stay local until you sign in.
              </div>
            ) : null}
            <div className="space-y-1">
              {sortedTasks.map((task) => {
                const score = Number(task.priority_score ?? 0);
                const daysUntil = Math.ceil(
                  (new Date(task.due_date).getTime() - new Date().getTime()) /
                    (1000 * 60 * 60 * 24),
                );
                return (
                  <div
                    key={task.id}
                    className={`flex items-center gap-3 px-3 py-3 rounded-md border-b border-[#e3d8c9] hover:bg-[#f0ebe2] transition-colors ${
                      task.status === "completed" ? "opacity-50" : ""
                    }`}
                  >
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: `${getStatusColor(score)}20`,
                        color: getStatusColor(score),
                      }}
                    >
                      {score.toFixed(1)}
                    </span>
                    <select
                      value={task.status}
                      onChange={(e) =>
                        updateTaskStatus(
                          task.id,
                          e.target.value as AcademicTaskForm["status"],
                        )
                      }
                      className="bg-[#f0ebe2] border border-[#ddd4c6] rounded text-[10px] text-[#6f685f] px-1 py-0.5 flex-shrink-0"
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Done</option>
                    </select>
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-sm truncate ${
                          task.status === "completed"
                            ? "line-through text-[#6f685f]"
                            : "text-[#25313c]"
                        }`}
                      >
                        {task.task_name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 bg-[#6b87ae]/10 text-[#6b87ae] rounded">
                          {task.class_name}
                        </span>
                        <span className="text-[10px] text-[#6f685f]">
                          {daysUntil <= 0
                            ? "Due today"
                            : daysUntil === 1
                              ? "1 day left"
                              : `${daysUntil} days`}
                        </span>
                        <span className="text-[10px] text-[#6f685f]">
                          {Number(task.estimated_hours ?? 0)}h
                        </span>
                        <span className="text-[10px] text-[#6f685f]">
                          {task.notes ? "Notes saved" : "No notes"}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="text-[#8c8478] hover:text-[#c97a73] transition-colors flex-shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            {sortedTasks.length === 0 && !isLoading ? (
              <EmptyStateCard
                missing="No academic items captured yet."
                nextAction="Add one course deadline with an estimated hour count."
                why="Academic risk control needs due dates and grade impact before it can protect study time."
              />
            ) : null}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="card-surface p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} className="text-[#c97a73]" />
              <h3 className="text-sm font-semibold text-[#c97a73]">
                GRADE RISK ALERT
              </h3>
            </div>
            {highRiskTasks.length > 0 ? (
              <div className="space-y-2">
                {highRiskTasks.slice(0, 5).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-2 text-xs"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-[#c97a73] mt-1 flex-shrink-0" />
                    <div>
                      <span className="text-[#25313c]">{task.class_name}</span>
                      <span className="text-[#6f685f]">
                        {" "}
                        — {task.task_name} (P:{Number(task.priority_score ?? 0).toFixed(1)})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#6a9a74]">
                No high-risk items detected. Keep monitoring due dates and workload.
              </p>
            )}
          </div>

          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#25313c] mb-3">
              STUDY PLAN
            </h3>
            <div className="space-y-2 text-xs text-[#6f685f]">
              <div className="flex items-center justify-between gap-3 rounded-md bg-[#f0ebe2] px-3 py-2">
                <span>Courses</span>
                <StatusPill tone="info">
                  {new Set(sortedTasks.map((task) => task.class_name)).size}
                </StatusPill>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md bg-[#f0ebe2] px-3 py-2">
                <span>Deadlines</span>
                <StatusPill tone={sortedTasks.length > 0 ? "info" : "warning"}>
                  {sortedTasks.length}
                </StatusPill>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md bg-[#f0ebe2] px-3 py-2">
                <span>Grade risk</span>
                <StatusPill tone={academicPressure.category === "High" || academicPressure.category === "Critical" ? "danger" : "neutral"}>
                  {academicPressure.category}
                </StatusPill>
              </div>
            </div>
          </div>

          <CollapsibleSection title="Priority breakdown" defaultOpen={false}>
            <h3 className="text-sm font-semibold text-[#25313c] mb-3">
              PRIORITY BREAKDOWN
            </h3>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <XAxis dataKey="name" stroke="#8c8478" fontSize={10} />
                  <YAxis domain={[0, 10]} stroke="#8c8478" fontSize={10} />
                  <Tooltip
                    contentStyle={{
                      background: "#f0ebe2",
                      border: "1px solid rgba(111,104,95,0.18)",
                      fontSize: "11px",
                    }}
                  />
                  <ReferenceLine y={8} stroke="#6a9a74" strokeDasharray="3 3" />
                  <Bar dataKey="score" fill="#6b87ae" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-[#8c8478]">
                Add a few tasks to see the priority spread.
              </div>
            )}
          </CollapsibleSection>

        </div>
      </div>
    </div>
  );
}
