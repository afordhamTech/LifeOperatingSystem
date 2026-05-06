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

create table if not exists public.universal_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  task_type text,
  due_date timestamptz,
  estimated_minutes integer,
  energy_required integer,
  urgency integer,
  importance integer,
  consequence_if_delayed integer,
  trust_impact integer,
  time_efficiency integer,
  priority_score numeric,
  status text,
  daily_role text,
  recurring boolean not null default false,
  notes text,
  next_physical_action text,
  friction_type text,
  privacy_layer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_anchors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  date date,
  start_time timestamptz,
  end_time timestamptz,
  category text,
  location text,
  link text,
  people_involved text,
  preparation_needed text,
  follow_up_needed text,
  notes text,
  privacy_layer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  date date,
  start_time timestamptz,
  end_time timestamptz,
  block_type text,
  linked_task_id uuid references public.universal_tasks (id) on delete set null,
  energy_required integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recurring_loops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  loop_type text,
  cadence text,
  "trigger" text,
  steps jsonb not null default '[]'::jsonb,
  expected_output text,
  next_occurrence timestamptz,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proof_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  artifact_name text not null,
  artifact_type text,
  link text,
  project text,
  skill_used text,
  people_involved text,
  outcome text,
  resume_bullet text,
  reflection text,
  privacy_layer text,
  artifact_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.decision_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  decision text not null,
  decision_date date,
  options_considered jsonb not null default '[]'::jsonb,
  reason_chosen text,
  expected_outcome text,
  risk text,
  review_date date,
  result_later text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.faith_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  passage text,
  prayer_focus text,
  main_lesson text,
  question text,
  gratitude text,
  action_step text,
  struggle text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint faith_logs_user_date_key unique (user_id, date)
);

create table if not exists public.relationship_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  person_name text not null,
  last_contact date,
  conversation_quality integer,
  follow_up_needed boolean not null default false,
  unresolved_tension text,
  encouragement_given text,
  boundary_needed text,
  message_draft text,
  what_not_to_overdo text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.money_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  income numeric,
  spending numeric,
  savings numeric,
  debt numeric,
  subscriptions numeric,
  upcoming_expenses numeric,
  biggest_leak text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint money_logs_user_date_key unique (user_id, date)
);

create table if not exists public.health_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  pain_area text,
  pain_score integer,
  pain_trend text,
  training_load integer,
  recovery_deficit integer,
  injury_risk numeric,
  red_flags jsonb not null default '[]'::jsonb,
  action_recommendation text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_logs_user_date_key unique (user_id, date)
);

create table if not exists public.substance_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  reading text,
  writing text,
  speaking_practice text,
  concept_learned text,
  question text,
  conversation_topic text,
  flashcards jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint substance_logs_user_date_key unique (user_id, date)
);

create table if not exists public.ai_prompt_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  prompt_type text,
  prompt_text text,
  source_page text,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  operating_mode text,
  must_do_task_id uuid references public.universal_tasks (id) on delete set null,
  should_do_1_task_id uuid references public.universal_tasks (id) on delete set null,
  should_do_2_task_id uuid references public.universal_tasks (id) on delete set null,
  maintenance_task_id uuid references public.universal_tasks (id) on delete set null,
  quick_win_task_id uuid references public.universal_tasks (id) on delete set null,
  ignore_today jsonb not null default '[]'::jsonb,
  reality_score numeric,
  main_bottleneck text,
  shutdown_target timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_plans_user_date_key unique (user_id, date)
);

create index if not exists universal_tasks_user_status_idx on public.universal_tasks (user_id, status);
create index if not exists universal_tasks_user_due_idx on public.universal_tasks (user_id, due_date);
create index if not exists calendar_anchors_user_date_idx on public.calendar_anchors (user_id, date);
create index if not exists time_blocks_user_date_idx on public.time_blocks (user_id, date);
create index if not exists recurring_loops_user_active_idx on public.recurring_loops (user_id, active);
create index if not exists proof_items_user_artifact_date_idx on public.proof_items (user_id, artifact_date);
create index if not exists decision_logs_user_review_date_idx on public.decision_logs (user_id, review_date);
create index if not exists faith_logs_user_date_idx on public.faith_logs (user_id, date);
create index if not exists relationship_logs_user_person_idx on public.relationship_logs (user_id, person_name);
create index if not exists money_logs_user_date_idx on public.money_logs (user_id, date);
create index if not exists health_logs_user_date_idx on public.health_logs (user_id, date);
create index if not exists substance_logs_user_date_idx on public.substance_logs (user_id, date);
create index if not exists ai_prompt_exports_user_created_idx on public.ai_prompt_exports (user_id, created_at);
create index if not exists daily_plans_user_date_idx on public.daily_plans (user_id, date);

alter table public.universal_tasks enable row level security;
alter table public.calendar_anchors enable row level security;
alter table public.time_blocks enable row level security;
alter table public.recurring_loops enable row level security;
alter table public.proof_items enable row level security;
alter table public.decision_logs enable row level security;
alter table public.faith_logs enable row level security;
alter table public.relationship_logs enable row level security;
alter table public.money_logs enable row level security;
alter table public.health_logs enable row level security;
alter table public.substance_logs enable row level security;
alter table public.ai_prompt_exports enable row level security;
alter table public.daily_plans enable row level security;

grant select, insert, update, delete on table
  public.universal_tasks,
  public.calendar_anchors,
  public.time_blocks,
  public.recurring_loops,
  public.proof_items,
  public.decision_logs,
  public.faith_logs,
  public.relationship_logs,
  public.money_logs,
  public.health_logs,
  public.substance_logs,
  public.ai_prompt_exports,
  public.daily_plans
to authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'universal_tasks',
    'calendar_anchors',
    'time_blocks',
    'recurring_loops',
    'proof_items',
    'decision_logs',
    'faith_logs',
    'relationship_logs',
    'money_logs',
    'health_logs',
    'substance_logs',
    'daily_plans'
  ]
  loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'universal_tasks',
    'calendar_anchors',
    'time_blocks',
    'recurring_loops',
    'proof_items',
    'decision_logs',
    'faith_logs',
    'relationship_logs',
    'money_logs',
    'health_logs',
    'substance_logs',
    'ai_prompt_exports',
    'daily_plans'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_own_rows', table_name);
    execute format(
      'create policy %I on public.%I as permissive for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      table_name || '_own_rows',
      table_name
    );
  end loop;
end
$$;
