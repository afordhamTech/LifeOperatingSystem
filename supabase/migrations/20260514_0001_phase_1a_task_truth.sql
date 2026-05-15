create extension if not exists pgcrypto;

alter table if exists public.universal_tasks
  add column if not exists task_code text,
  add column if not exists description text,
  add column if not exists domain text,
  add column if not exists priority text,
  add column if not exists consequence_level text,
  add column if not exists resistance_level integer,
  add column if not exists fixed_time text,
  add column if not exists scheduled_start timestamptz,
  add column if not exists scheduled_end timestamptz,
  add column if not exists source text,
  add column if not exists previous_status text,
  add column if not exists ignored_until date,
  add column if not exists ignored_count integer not null default 0,
  add column if not exists carry_forward_count integer not null default 0,
  add column if not exists rescheduled_count integer not null default 0,
  add column if not exists parent_task_id uuid,
  add column if not exists review_date date,
  add column if not exists completed_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists deleted_at timestamptz;

do $$
begin
  if to_regclass('public.universal_tasks') is not null then
    update public.universal_tasks
      set status = 'done'
      where status = 'completed';

    update public.universal_tasks
      set
        previous_status = coalesce(previous_status, status),
        status = 'ignored_today',
        ignored_until = coalesce(ignored_until, current_date),
        ignored_count = greatest(coalesce(ignored_count, 0), 1)
      where daily_role = 'Ignore Today'
        and coalesce(status, 'inbox') in ('inbox', 'today', 'this_week', 'waiting');

    update public.universal_tasks
      set domain = task_type
      where domain is null
        and task_type is not null;

    with ranked as (
      select
        id,
        row_number() over (
          partition by user_id
          order by created_at asc, id asc
        ) as rn
      from public.universal_tasks
      where task_code is null or btrim(task_code) = ''
    )
    update public.universal_tasks as task
      set task_code = 'TASK-' || lpad(ranked.rn::text, 4, '0')
      from ranked
      where task.id = ranked.id;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.universal_tasks') is not null
    and not exists (
      select 1
      from pg_constraint
      where conname = 'universal_tasks_parent_task_id_fkey'
        and conrelid = 'public.universal_tasks'::regclass
    )
  then
    alter table public.universal_tasks
      add constraint universal_tasks_parent_task_id_fkey
      foreign key (parent_task_id)
      references public.universal_tasks (id)
      on delete set null;
  end if;
end
$$;

create index if not exists universal_tasks_user_task_code_idx
  on public.universal_tasks (user_id, task_code);

create index if not exists universal_tasks_user_lifecycle_idx
  on public.universal_tasks (user_id, status, archived_at, deleted_at);

create index if not exists universal_tasks_user_schedule_idx
  on public.universal_tasks (user_id, scheduled_start, scheduled_end);

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.universal_tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists task_events_task_created_idx
  on public.task_events (task_id, created_at desc);

create index if not exists task_events_user_created_idx
  on public.task_events (user_id, created_at desc);

alter table public.task_events enable row level security;

grant select, insert, update, delete
  on table public.task_events
  to authenticated;

drop policy if exists task_events_own_rows on public.task_events;
create policy task_events_own_rows
  on public.task_events
  as permissive
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
