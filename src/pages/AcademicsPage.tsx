import { useEffect, useMemo, useState } from "react";
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
import { supabase } from "@/lib/supabase-client";
import type { AcademicTaskRow } from "@/lib/supabase-types";
import { calculateAcademicPriorityScore } from "@/lib/life-scoring";
import { toDateKey } from "@/lib/date-helpers";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import { getStatusColor } from "@/components/StatusRing";

type AcademicTaskForm = {
  className: string;
  taskName: string;
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
    notes: form.notes.trim() || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } satisfies AcademicTaskRow;
}

export default function AcademicsPage() {
  const { hasSupabaseConfig: supabaseConfigured, userId } = useSupabaseSession();
  const [form, setForm] = useState<AcademicTaskForm>(() => createDefaultForm());
  const [tasks, setTasks] = useState<AcademicTaskRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!supabase || !userId) {
        if (!active) return;
        setIsLoading(false);
        setNotice(
          supabaseConfigured
            ? "No Supabase session yet. Tasks stay in local draft mode until auth is connected."
            : "Supabase env vars are missing. Tasks stay in local draft mode.",
        );
        return;
      }

      setIsLoading(true);
      setError(null);

      const { data, error: loadError } = await supabase
        .from("academic_tasks")
        .select("*")
        .eq("user_id", userId)
        .order("priority_score", { ascending: false });

      if (!active) return;

      if (loadError) {
        setError(loadError.message);
      } else {
        setTasks((data ?? []) as AcademicTaskRow[]);
        setNotice("Loaded from Supabase.");
      }

      setIsLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, [supabaseConfigured, userId]);

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

  const handleAddTask = async () => {
    if (!form.className.trim() || !form.taskName.trim()) return;

    const priorityScore = calculateAcademicPriorityScore({
      gradeImpact: form.gradeImpact,
      urgency: estimateUrgency(form.dueDate),
      difficulty: form.difficulty,
      timeRequiredScore: Math.min(10, form.estimatedHours),
    });

    if (!supabase || !userId) {
      setTasks((current) => [
        formToRowDraft(form, "local-draft"),
        ...current,
      ]);
      setForm(createDefaultForm());
      setNotice("Task added in local draft mode.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    const payload = {
      user_id: userId,
      class_name: form.className.trim(),
      task_name: form.taskName.trim(),
      due_date: new Date(form.dueDate).toISOString(),
      estimated_hours: form.estimatedHours,
      difficulty: form.difficulty,
      grade_impact: form.gradeImpact,
      status: form.status,
      priority_score: priorityScore,
      notes: form.notes.trim() || null,
    };

    const { data, error: insertError } = await supabase
      .from("academic_tasks")
      .insert(payload)
      .select("*")
      .maybeSingle();

    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setTasks((current) => [data as AcademicTaskRow, ...current]);
      setForm(createDefaultForm());
      setNotice("Task saved to Supabase.");
    }

    setIsSaving(false);
  };

  const updateTaskStatus = async (
    id: string,
    status: "pending" | "in_progress" | "completed",
  ) => {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, status } : task)),
    );

    if (!supabase || !userId) return;

    const { error: updateError } = await supabase
      .from("academic_tasks")
      .update({ status })
      .eq("id", id)
      .eq("user_id", userId);

    if (updateError) {
      setError(updateError.message);
    }
  };

  const deleteTask = async (id: string) => {
    setTasks((current) => current.filter((task) => task.id !== id));

    if (!supabase || !userId) return;

    const { error: deleteError } = await supabase
      .from("academic_tasks")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (deleteError) {
      setError(deleteError.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-white/[0.06] pb-4">
        <h1 className="text-2xl font-semibold text-[#eaeaea]">Academics</h1>
        <p className="text-sm text-[#777777] mt-1">
          Track assignments, exams, study load, grade risk, and weekly academic
          execution.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 space-y-4">
          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#eaeaea] mb-3">
              ADD TASK
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Task name"
                value={form.taskName}
                onChange={(e) =>
                  setForm((p) => ({ ...p, taskName: e.target.value }))
                }
                className="input-dark col-span-2 md:col-span-1"
              />
              <input
                type="text"
                placeholder="Class"
                value={form.className}
                onChange={(e) =>
                  setForm((p) => ({ ...p, className: e.target.value }))
                }
                className="input-dark"
              />
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) =>
                  setForm((p) => ({ ...p, dueDate: e.target.value }))
                }
                className="input-dark"
              />
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#777777] block mb-1">
                  Est. Hours
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
                <label className="text-[10px] uppercase tracking-wider text-[#777777] block mb-1">
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
                />
                <span className="text-[10px] text-[#777777]">
                  {form.difficulty}/10
                </span>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#777777] block mb-1">
                  Grade Impact
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
                />
                <span className="text-[10px] text-[#777777]">
                  {form.gradeImpact}/10
                </span>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#777777] block mb-1">
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
                <label className="text-[10px] uppercase tracking-wider text-[#777777] block mb-1">
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
              disabled={isSaving || isLoading}
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add Task
            </button>
          </div>

          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#eaeaea] mb-3">
              TASK LIST - Sorted by Priority
            </h3>
            {error ? (
              <div className="mb-3 rounded border border-[#ef4444]/30 bg-[#ef4444]/10 px-3 py-2 text-xs text-[#ef4444]">
                {error}
              </div>
            ) : null}
            {notice ? (
              <div className="mb-3 rounded border border-white/[0.06] bg-[#111111] px-3 py-2 text-xs text-[#777777]">
                {notice}
              </div>
            ) : null}
            {supabaseConfigured && !userId ? (
              <div className="mb-3 rounded border border-[#3b82f6]/30 bg-[#3b82f6]/10 px-3 py-2 text-xs text-[#3b82f6]">
                Supabase is configured, but there is no session yet. Draft mode is
                still available.
              </div>
            ) : null}
            {!supabaseConfigured ? (
              <div className="mb-3 rounded border border-[#eab308]/30 bg-[#eab308]/10 px-3 py-2 text-xs text-[#eab308]">
                Supabase env vars are missing. Tasks stay local until you add them.
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
                    className={`flex items-center gap-3 px-3 py-3 rounded-md border-b border-white/[0.04] hover:bg-[#1a1a1a] transition-colors ${
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
                      className="bg-[#1a1a1a] border border-white/[0.06] rounded text-[10px] text-[#777777] px-1 py-0.5 flex-shrink-0"
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Done</option>
                    </select>
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-sm truncate ${
                          task.status === "completed"
                            ? "line-through text-[#777777]"
                            : "text-[#eaeaea]"
                        }`}
                      >
                        {task.task_name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 bg-[#3b82f6]/10 text-[#3b82f6] rounded">
                          {task.class_name}
                        </span>
                        <span className="text-[10px] text-[#777777]">
                          {daysUntil <= 0
                            ? "Due today"
                            : daysUntil === 1
                              ? "1 day left"
                              : `${daysUntil} days`}
                        </span>
                        <span className="text-[10px] text-[#777777]">
                          {Number(task.estimated_hours ?? 0)}h
                        </span>
                        <span className="text-[10px] text-[#777777]">
                          {task.notes ? "Notes saved" : "No notes"}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="text-[#444444] hover:text-[#ef4444] transition-colors flex-shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
              {sortedTasks.length === 0 && !isLoading ? (
                <div className="text-center py-8 text-sm text-[#444444]">
                  No tasks yet. Add your first assignment above.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="card-surface p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} className="text-[#ef4444]" />
              <h3 className="text-sm font-semibold text-[#ef4444]">
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
                    <div className="w-1.5 h-1.5 rounded-full bg-[#ef4444] mt-1 flex-shrink-0" />
                    <div>
                      <span className="text-[#eaeaea]">{task.class_name}</span>
                      <span className="text-[#777777]">
                        {" "}
                        — {task.task_name} (P:{Number(task.priority_score ?? 0).toFixed(1)})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#22c55e]">
                No high-risk items detected.
              </p>
            )}
          </div>

          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#eaeaea] mb-3">
              PRIORITY BREAKDOWN
            </h3>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <XAxis dataKey="name" stroke="#444" fontSize={10} />
                  <YAxis domain={[0, 10]} stroke="#444" fontSize={10} />
                  <Tooltip
                    contentStyle={{
                      background: "#1a1a1a",
                      border: "1px solid rgba(255,255,255,0.06)",
                      fontSize: "11px",
                    }}
                  />
                  <ReferenceLine y={8} stroke="#22c55e" strokeDasharray="3 3" />
                  <Bar dataKey="score" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-[#444444]">
                Add a few tasks to see the priority spread.
              </div>
            )}
          </div>

          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#eaeaea] mb-3">
              DRAFT MODE
            </h3>
            <div className="text-xs text-[#777777]">
              {supabaseConfigured
                ? "Once Supabase Auth is connected, these tasks will save to your user row set."
                : "The form works locally, but saving to Supabase is disabled until the env vars are added."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
