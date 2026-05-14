-- Phase 1C: Execution Truth
-- Plan lock, time block execution status, missed reasons, carry forward,
-- shutdown ritual, weekly review execution stats.
-- Idempotent: safe to run more than once.

create extension if not exists pgcrypto;

-- ── 1. Plan Lock fields on daily_plans ──────────────────────────────────────
alter table if exists public.daily_plans
  add column if not exists locked_at timestamptz,
  add column if not exists unlocked_at timestamptz,
  add column if not exists lock_status text not null default 'unlocked',
  add column if not exists lock_reason text,
  add column if not exists plan_change_count integer not null default 0,
  add column if not exists plan_change_reasons jsonb not null default '[]'::jsonb,
  add column if not exists shutdown_completed_at timestamptz,
  add column if not exists shutdown_notes text,
  add column if not exists tomorrow_first_move text,
  add column if not exists missed_summary jsonb not null default '[]'::jsonb,
  add column if not exists carry_forward_summary jsonb not null default '[]'::jsonb;

-- ── 2. Time Block execution fields ──────────────────────────────────────────
alter table if exists public.time_blocks
  add column if not exists execution_status text not null default 'not_started',
  add column if not exists started_at timestamptz,
  add column if not exists missed_at timestamptz,
  add column if not exists skipped_at timestamptz,
  add column if not exists actual_minutes integer,
  add column if not exists execution_notes text,
  add column if not exists rescheduled_from_block_id uuid,
  add column if not exists carry_forward_task_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'time_blocks_rescheduled_from_block_id_fkey'
  ) then
    alter table public.time_blocks
      add constraint time_blocks_rescheduled_from_block_id_fkey
      foreign key (rescheduled_from_block_id)
      references public.time_blocks (id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'time_blocks_carry_forward_task_id_fkey'
  ) then
    alter table public.time_blocks
      add constraint time_blocks_carry_forward_task_id_fkey
      foreign key (carry_forward_task_id)
      references public.universal_tasks (id)
      on delete set null;
  end if;
end
$$;

create index if not exists time_blocks_user_exec_date_idx
  on public.time_blocks (user_id, execution_status, date);

-- ── 3. Daily Shutdowns table ────────────────────────────────────────────────
create table if not exists public.daily_shutdowns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  completed_at timestamptz,
  shutdown_notes text,
  anti_drift_lesson text,
  tomorrow_first_move text,
  tomorrow_shutdown_target text,
  missed_summary jsonb not null default '[]'::jsonb,
  carry_forward_summary jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists daily_shutdowns_user_date_idx
  on public.daily_shutdowns (user_id, date);

alter table public.daily_shutdowns enable row level security;

grant select, insert, update, delete on table public.daily_shutdowns to authenticated;

drop trigger if exists set_daily_shutdowns_updated_at on public.daily_shutdowns;
create trigger set_daily_shutdowns_updated_at
before update on public.daily_shutdowns
for each row
execute function public.set_updated_at();

drop policy if exists daily_shutdowns_own_rows on public.daily_shutdowns;
create policy daily_shutdowns_own_rows
  on public.daily_shutdowns
  as permissive
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── 4. Weekly Review execution stats ────────────────────────────────────────
alter table if exists public.weekly_reviews
  add column if not exists completed_blocks_count integer,
  add column if not exists missed_blocks_count integer,
  add column if not exists partial_blocks_count integer,
  add column if not exists skipped_blocks_count integer,
  add column if not exists most_common_missed_reason text,
  add column if not exists execution_summary jsonb not null default '{}'::jsonb,
  add column if not exists shutdown_count integer,
  add column if not exists plan_change_count integer;
