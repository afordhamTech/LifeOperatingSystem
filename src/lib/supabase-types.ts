export interface DailyLogRow {
  id: string;
  user_id: string;
  date: string;
  must_do: string | null;
  should_do_1: string | null;
  should_do_2: string | null;
  maintenance: string | null;
  energy: number | null;
  mood: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SleepLogRow {
  id: string;
  user_id: string;
  date: string;
  bedtime: string | null;
  wake_time: string | null;
  hours_slept: number | null;
  sleep_quality: number | null;
  wake_energy: number | null;
  stress_before_bed: number | null;
  caffeine_after_3pm: boolean | null;
  nap_minutes: number | null;
  sleep_debt: number | null;
  sleep_readiness: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AcademicTaskRow {
  id: string;
  user_id: string;
  class_name: string;
  task_name: string;
  due_date: string;
  estimated_hours: number | null;
  difficulty: number | null;
  grade_impact: number | null;
  status: "pending" | "in_progress" | "completed" | string;
  priority_score: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkoutLogRow {
  id: string;
  user_id: string;
  date: string;
  workout_type: string | null;
  exercises: unknown;
  duration_minutes: number | null;
  rpe: number | null;
  soreness: number | null;
  pain: number | null;
  energy: number | null;
  training_readiness: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface NutritionLogRow {
  id: string;
  user_id: string;
  date: string;
  bodyweight: number | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  water_oz: number | null;
  meals_count: number | null;
  training_day: boolean | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeeklyReviewRow {
  id: string;
  user_id: string;
  week_start: string;
  academics_score: number | null;
  sleep_score: number | null;
  training_score: number | null;
  nutrition_score: number | null;
  career_proof_score: number | null;
  faith_substance_score: number | null;
  money_admin_score: number | null;
  weekly_life_score: number | null;
  biggest_win: string | null;
  biggest_leak: string | null;
  next_week_big_3: unknown;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
