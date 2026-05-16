export type AcademicPressureTask = {
  due_date: string | null;
  estimated_hours?: number | null;
  difficulty?: number | null;
  grade_impact?: number | null;
  status?: string | null;
};

export type AcademicPressureResult = {
  rawScore: number;
  category: "Low" | "Moderate" | "High" | "Critical";
};

function daysUntilDue(dueDate: string | null, today: Date) {
  if (!dueDate) return 30;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 30;
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((due.getTime() - todayStart.getTime()) / 86_400_000));
}

export function calculateAcademicPressure(
  tasks: AcademicPressureTask[],
  today = new Date(),
): AcademicPressureResult {
  const rawScore = tasks.reduce((sum, task) => {
    if (task.status === "completed") return sum;
    const estimatedHours = Math.max(0, Number(task.estimated_hours ?? 0));
    const difficulty = Math.max(1, Number(task.difficulty ?? 1));
    const gradeImpact = Math.max(1, Number(task.grade_impact ?? 1));
    const days = daysUntilDue(task.due_date, today);
    return sum + (estimatedHours * difficulty * gradeImpact) / (days + 1);
  }, 0);
  const rounded = Math.round(rawScore * 100) / 100;
  const category =
    rounded >= 120 ? "Critical" : rounded >= 60 ? "High" : rounded >= 20 ? "Moderate" : "Low";
  return { rawScore: rounded, category };
}

export function academicSliderColor(value: number) {
  if (value <= 3) return "#6a9a74";
  if (value <= 7) return "#c39a4e";
  return "#c97a73";
}
