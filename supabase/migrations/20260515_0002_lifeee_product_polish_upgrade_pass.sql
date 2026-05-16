-- Lifeee product polish upgrade pass.
-- Idempotent: safe to run more than once through Supabase SQL editor or CLI.

-- History / decision log cleanup
alter table if exists public.decision_logs
  add column if not exists actual_outcome text,
  add column if not exists lesson_learned text;

alter table if exists public.decision_logs
  alter column options_considered set default '[]'::jsonb;

-- Academics course model
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  code text,
  term text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.academic_tasks
  add column if not exists course_id uuid;

do $$
begin
  if to_regclass('public.academic_tasks') is not null
     and to_regclass('public.courses') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'academic_tasks_course_id_fkey'
     ) then
    alter table public.academic_tasks
      add constraint academic_tasks_course_id_fkey
      foreign key (course_id)
      references public.courses(id)
      on delete set null;
  end if;
end $$;

create index if not exists courses_user_active_idx
  on public.courses(user_id, active, name);

create index if not exists academic_tasks_user_course_idx
  on public.academic_tasks(user_id, course_id);

create or replace function public.calculate_academic_pressure(p_user_id uuid)
returns table(raw_score numeric, category text)
language sql
security invoker
set search_path = public
as $$
  with pressure as (
    select coalesce(sum(
      (coalesce(estimated_hours, 0)::numeric * coalesce(difficulty, 1)::numeric * coalesce(grade_impact, 1)::numeric)
      / (greatest(0, (due_date::date - current_date)) + 1)
    ), 0)::numeric as score
    from public.academic_tasks
    where user_id = p_user_id
      and status <> 'completed'
  )
  select
    round(score, 2) as raw_score,
    case
      when score >= 120 then 'Critical'
      when score >= 60 then 'High'
      when score >= 20 then 'Moderate'
      else 'Low'
    end as category
  from pressure;
$$;

-- Workout relational tables for queryable sessions and exercises
create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  workout_type text,
  duration_min integer,
  session_rpe numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_name text not null,
  sets integer,
  reps integer,
  weight_lbs numeric,
  exercise_rpe numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workout_sessions_user_date_idx
  on public.workout_sessions(user_id, date desc);

create index if not exists workout_exercises_session_name_idx
  on public.workout_exercises(session_id, exercise_name);

-- Nutrition meal templates
create table if not exists public.meal_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  calories numeric not null default 0,
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meal_templates_user_name_idx
  on public.meal_templates(user_id, name);

-- Career leverage checklist persistence
alter table if exists public.proof_items
  add column if not exists leverage_checklist jsonb not null default '{}'::jsonb,
  add column if not exists leverage_drafts jsonb not null default '{}'::jsonb;

-- MCAT JSON snapshot support fields live in mcat_foundation_states.state.
-- These columns are optional for future relational topic extraction.
alter table if exists public.mcat_foundation_states
  add column if not exists srs_version text not null default 'simple-sm2-v1';

-- Money month-to-date cash flow view
create or replace view public.mtd_cash_flow
with (security_invoker = true)
as
select
  user_id,
  date_trunc('month', current_date)::date as month_start,
  coalesce(sum(income), 0)::numeric as total_income,
  coalesce(sum(spending), 0)::numeric as total_money_out,
  coalesce(sum(savings), 0)::numeric as total_savings
from public.money_logs
where date >= date_trunc('month', current_date)::date
  and date < (date_trunc('month', current_date) + interval '1 month')::date
group by user_id;

-- Relationships relational model
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  relationship_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  connection_quality integer,
  summary text,
  detail_to_remember text,
  next_action text,
  needs_follow_up boolean not null default false,
  follow_up_completed boolean not null default false,
  date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists people_user_name_idx
  on public.people(user_id, name);

create index if not exists interactions_person_followup_idx
  on public.interactions(person_id, needs_follow_up, follow_up_completed, date desc);

-- Depth & Learning synthesis fields
alter table if exists public.substance_logs
  add column if not exists why_it_matters text,
  add column if not exists example text,
  add column if not exists my_opinion text,
  add column if not exists conversation_angle text,
  add column if not exists connection_to_another_field text;

-- RLS, grants, and updated_at triggers
alter table public.courses enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.meal_templates enable row level security;
alter table public.people enable row level security;
alter table public.interactions enable row level security;

grant select, insert, update, delete on table
  public.courses,
  public.workout_sessions,
  public.workout_exercises,
  public.meal_templates,
  public.people,
  public.interactions
to authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'courses',
    'workout_sessions',
    'meal_templates',
    'people'
  ]
  loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;

  execute 'drop trigger if exists set_workout_exercises_updated_at on public.workout_exercises';
  execute 'create trigger set_workout_exercises_updated_at before update on public.workout_exercises for each row execute function public.set_updated_at()';
  execute 'drop trigger if exists set_interactions_updated_at on public.interactions';
  execute 'create trigger set_interactions_updated_at before update on public.interactions for each row execute function public.set_updated_at()';
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'courses',
    'workout_sessions',
    'meal_templates',
    'people'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_own_rows', table_name);
    execute format(
      'create policy %I on public.%I as permissive for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      table_name || '_own_rows',
      table_name
    );
  end loop;
end $$;

drop policy if exists workout_exercises_own_rows on public.workout_exercises;
create policy workout_exercises_own_rows
on public.workout_exercises
as permissive
for all
to authenticated
using (
  exists (
    select 1
    from public.workout_sessions s
    where s.id = workout_exercises.session_id
      and s.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.workout_sessions s
    where s.id = workout_exercises.session_id
      and s.user_id = (select auth.uid())
  )
);

drop policy if exists interactions_own_rows on public.interactions;
create policy interactions_own_rows
on public.interactions
as permissive
for all
to authenticated
using (
  exists (
    select 1
    from public.people p
    where p.id = interactions.person_id
      and p.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.people p
    where p.id = interactions.person_id
      and p.user_id = (select auth.uid())
  )
);
