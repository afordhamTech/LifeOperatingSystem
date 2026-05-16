-- Life Domain Routine Seeder: routine instances + routine columns on universal_tasks.

create table if not exists public.user_routine_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_key text not null,
  name text not null,
  domain text not null,
  cadence text not null,
  start_date date not null,
  end_date date,
  preferred_days jsonb,
  preferred_time text,
  estimated_minutes integer,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_routine_instances_user_template_active_idx
  on public.user_routine_instances (user_id, template_key)
  where status = 'active';

create index if not exists user_routine_instances_user_status_idx
  on public.user_routine_instances (user_id, status);

alter table public.user_routine_instances enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_routine_instances'
      and policyname = 'user_routine_instances_select_own'
  ) then
    create policy "user_routine_instances_select_own" on public.user_routine_instances
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_routine_instances'
      and policyname = 'user_routine_instances_insert_own'
  ) then
    create policy "user_routine_instances_insert_own" on public.user_routine_instances
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_routine_instances'
      and policyname = 'user_routine_instances_update_own'
  ) then
    create policy "user_routine_instances_update_own" on public.user_routine_instances
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_routine_instances'
      and policyname = 'user_routine_instances_delete_own'
  ) then
    create policy "user_routine_instances_delete_own" on public.user_routine_instances
      for delete using (auth.uid() = user_id);
  end if;
end $$;

alter table if exists public.universal_tasks
  add column if not exists routine_instance_id uuid,
  add column if not exists routine_occurrence_index integer;

create index if not exists universal_tasks_user_routine_idx
  on public.universal_tasks (user_id, routine_instance_id, due_date)
  where routine_instance_id is not null;
