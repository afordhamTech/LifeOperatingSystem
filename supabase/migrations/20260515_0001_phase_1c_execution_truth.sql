-- Lifeee Phase 1C: Execution Truth
-- Plan lock, time block execution status, missed reasons, carry forward,
-- shutdown ritual, weekly review execution stats.
-- Idempotent: safe to run more than once (Supabase SQL Editor or CLI).

-- 1. daily_plans execution / lock fields
alter table if exists public.daily_plans
  add column if not exists locked_at timestamptz,
  add column if not exists unlocked_at timestamptz,
  add column if not exists lock_status text,
  add column if not exists lock_reason text,
  add column if not exists plan_change_count integer not null default 0,
  add column if not exists plan_change_reasons jsonb not null default '[]'::jsonb,
  add column if not exists shutdown_completed_at timestamptz,
  add column if not exists shutdown_notes text,
  add column if not exists tomorrow_first_move text,
  add column if not exists missed_summary jsonb not null default '[]'::jsonb,
  add column if not exists carry_forward_summary jsonb not null default '[]'::jsonb;

-- 2. time_blocks execution fields
alter table if exists public.time_blocks
  add column if not exists execution_status text not null default 'not_started',
  add column if not exists started_at timestamptz,
  add column if not exists missed_at timestamptz,
  add column if not exists skipped_at timestamptz,
  add column if not exists actual_minutes integer,
  add column if not exists execution_notes text,
  add column if not exists missed_reason text,
  add column if not exists rescheduled_from_block_id uuid,
  add column if not exists carry_forward_task_id uuid;

-- 3. Add safe foreign keys if missing
do $$
begin
  if to_regclass('public.time_blocks') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'time_blocks_rescheduled_from_block_id_fkey'
    ) then
      alter table public.time_blocks
        add constraint time_blocks_rescheduled_from_block_id_fkey
        foreign key (rescheduled_from_block_id)
        references public.time_blocks(id)
        on delete set null;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'time_blocks_carry_forward_task_id_fkey'
    ) then
      alter table public.time_blocks
        add constraint time_blocks_carry_forward_task_id_fkey
        foreign key (carry_forward_task_id)
        references public.universal_tasks(id)
        on delete set null;
    end if;
  end if;
end $$;

-- 4. weekly_reviews execution stats
alter table if exists public.weekly_reviews
  add column if not exists completed_blocks_count integer not null default 0,
  add column if not exists missed_blocks_count integer not null default 0,
  add column if not exists partial_blocks_count integer not null default 0,
  add column if not exists skipped_blocks_count integer not null default 0,
  add column if not exists most_common_missed_reason text,
  add column if not exists execution_summary jsonb not null default '{}'::jsonb,
  add column if not exists shutdown_count integer not null default 0,
  add column if not exists plan_change_count integer not null default 0;

-- 5. daily_shutdowns table
create table if not exists public.daily_shutdowns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
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
  unique(user_id, date)
);

-- 6. RLS for daily_shutdowns
alter table public.daily_shutdowns enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'daily_shutdowns'
      and policyname = 'daily_shutdowns_select_own'
  ) then
    create policy daily_shutdowns_select_own
      on public.daily_shutdowns
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'daily_shutdowns'
      and policyname = 'daily_shutdowns_insert_own'
  ) then
    create policy daily_shutdowns_insert_own
      on public.daily_shutdowns
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'daily_shutdowns'
      and policyname = 'daily_shutdowns_update_own'
  ) then
    create policy daily_shutdowns_update_own
      on public.daily_shutdowns
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'daily_shutdowns'
      and policyname = 'daily_shutdowns_delete_own'
  ) then
    create policy daily_shutdowns_delete_own
      on public.daily_shutdowns
      for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

-- 7. updated_at trigger for daily_shutdowns
drop trigger if exists set_daily_shutdowns_updated_at on public.daily_shutdowns;

create trigger set_daily_shutdowns_updated_at
before update on public.daily_shutdowns
for each row
execute function public.set_updated_at();

-- 8. Helpful indexes
create index if not exists daily_shutdowns_user_date_idx
  on public.daily_shutdowns(user_id, date desc);

create index if not exists time_blocks_user_execution_status_idx
  on public.time_blocks(user_id, execution_status);

create index if not exists time_blocks_carry_forward_task_id_idx
  on public.time_blocks(carry_forward_task_id);

create index if not exists daily_plans_user_lock_status_idx
  on public.daily_plans(user_id, lock_status);

-- 9. Soft constraints, added only if absent
do $$
begin
  if to_regclass('public.time_blocks') is not null then
    if not exists (
      select 1 from pg_constraint
      where conname = 'time_blocks_execution_status_check'
    ) then
      alter table public.time_blocks
        add constraint time_blocks_execution_status_check
        check (
          execution_status in (
            'not_started',
            'in_progress',
            'done',
            'partial',
            'missed',
            'skipped',
            'rescheduled'
          )
        );
    end if;
  end if;

  if to_regclass('public.daily_plans') is not null then
    if not exists (
      select 1 from pg_constraint
      where conname = 'daily_plans_lock_status_check'
    ) then
      alter table public.daily_plans
        add constraint daily_plans_lock_status_check
        check (
          lock_status is null
          or lock_status in ('unlocked', 'locked')
        );
    end if;
  end if;
end $$;
