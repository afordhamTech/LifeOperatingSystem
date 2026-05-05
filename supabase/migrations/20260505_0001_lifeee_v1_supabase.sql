create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  must_do text,
  should_do_1 text,
  should_do_2 text,
  maintenance text,
  energy integer,
  mood integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_logs_energy_check check (energy is null or energy between 1 and 10),
  constraint daily_logs_mood_check check (mood is null or mood between 1 and 10),
  constraint daily_logs_user_date_key unique (user_id, date)
);

create table if not exists public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  bedtime timestamptz,
  wake_time timestamptz,
  hours_slept numeric,
  sleep_quality integer,
  wake_energy integer,
  stress_before_bed integer,
  caffeine_after_3pm boolean default false,
  nap_minutes integer,
  sleep_debt numeric not null default 0,
  sleep_readiness numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sleep_logs_sleep_quality_check check (sleep_quality is null or sleep_quality between 1 and 10),
  constraint sleep_logs_wake_energy_check check (wake_energy is null or wake_energy between 1 and 10),
  constraint sleep_logs_stress_before_bed_check check (stress_before_bed is null or stress_before_bed between 1 and 10),
  constraint sleep_logs_user_date_key unique (user_id, date)
);

create table if not exists public.academic_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  class_name text not null,
  task_name text not null,
  due_date timestamptz not null,
  estimated_hours numeric,
  difficulty integer,
  grade_impact integer,
  status text not null default 'pending',
  priority_score numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_tasks_difficulty_check check (difficulty is null or difficulty between 1 and 10),
  constraint academic_tasks_grade_impact_check check (grade_impact is null or grade_impact between 1 and 10),
  constraint academic_tasks_status_check check (status in ('pending', 'in_progress', 'completed'))
);

create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  workout_type text,
  exercises jsonb not null default '[]'::jsonb,
  duration_minutes integer,
  rpe integer,
  soreness integer,
  pain integer,
  energy integer,
  training_readiness numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_logs_rpe_check check (rpe is null or rpe between 1 and 10),
  constraint workout_logs_soreness_check check (soreness is null or soreness between 1 and 10),
  constraint workout_logs_pain_check check (pain is null or pain between 1 and 10),
  constraint workout_logs_energy_check check (energy is null or energy between 1 and 10),
  constraint workout_logs_user_date_key unique (user_id, date)
);

create table if not exists public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  bodyweight numeric,
  calories integer,
  protein_g integer,
  carbs_g integer,
  fat_g integer,
  water_oz integer,
  meals_count integer,
  training_day boolean default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nutrition_logs_user_date_key unique (user_id, date)
);

create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  academics_score numeric,
  sleep_score numeric,
  training_score numeric,
  nutrition_score numeric,
  career_proof_score numeric,
  faith_substance_score numeric,
  money_admin_score numeric,
  weekly_life_score numeric not null default 0,
  biggest_win text,
  biggest_leak text,
  next_week_big_3 jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_reviews_user_week_key unique (user_id, week_start)
);

create index if not exists daily_logs_user_date_idx on public.daily_logs (user_id, date);
create index if not exists sleep_logs_user_date_idx on public.sleep_logs (user_id, date);
create index if not exists academic_tasks_user_status_due_idx on public.academic_tasks (user_id, status, due_date);
create index if not exists workout_logs_user_date_idx on public.workout_logs (user_id, date);
create index if not exists nutrition_logs_user_date_idx on public.nutrition_logs (user_id, date);
create index if not exists weekly_reviews_user_week_idx on public.weekly_reviews (user_id, week_start);

create trigger set_daily_logs_updated_at
before update on public.daily_logs
for each row execute function public.set_updated_at();

create trigger set_sleep_logs_updated_at
before update on public.sleep_logs
for each row execute function public.set_updated_at();

create trigger set_academic_tasks_updated_at
before update on public.academic_tasks
for each row execute function public.set_updated_at();

create trigger set_workout_logs_updated_at
before update on public.workout_logs
for each row execute function public.set_updated_at();

create trigger set_nutrition_logs_updated_at
before update on public.nutrition_logs
for each row execute function public.set_updated_at();

create trigger set_weekly_reviews_updated_at
before update on public.weekly_reviews
for each row execute function public.set_updated_at();

alter table public.daily_logs enable row level security;
alter table public.sleep_logs enable row level security;
alter table public.academic_tasks enable row level security;
alter table public.workout_logs enable row level security;
alter table public.nutrition_logs enable row level security;
alter table public.weekly_reviews enable row level security;

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on table public.daily_logs to authenticated, service_role;
grant select, insert, update, delete on table public.sleep_logs to authenticated, service_role;
grant select, insert, update, delete on table public.academic_tasks to authenticated, service_role;
grant select, insert, update, delete on table public.workout_logs to authenticated, service_role;
grant select, insert, update, delete on table public.nutrition_logs to authenticated, service_role;
grant select, insert, update, delete on table public.weekly_reviews to authenticated, service_role;

create policy "daily_logs_own_rows"
on public.daily_logs
as permissive
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "sleep_logs_own_rows"
on public.sleep_logs
as permissive
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "academic_tasks_own_rows"
on public.academic_tasks
as permissive
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "workout_logs_own_rows"
on public.workout_logs
as permissive
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "nutrition_logs_own_rows"
on public.nutrition_logs
as permissive
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "weekly_reviews_own_rows"
on public.weekly_reviews
as permissive
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
