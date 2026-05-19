-- MCAT planned work is stored as MCAT plan occurrences until the user
-- deliberately commits one occurrence into universal_tasks.

create table if not exists public.mcat_plan_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_instance_id uuid references public.mcat_plan_instances(id) on delete cascade,
  template_key text not null,
  template_day_index integer not null,
  template_week_index integer not null,
  planned_date date not null,
  learning_type text not null,
  topic text,
  title text not null,
  description text,
  estimated_minutes integer not null,
  status text not null default 'planned',
  linked_task_id uuid references public.universal_tasks(id) on delete set null,
  generated_from jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'mcat_plan_occurrences_status_check'
      and conrelid = 'public.mcat_plan_occurrences'::regclass
  ) then
    alter table public.mcat_plan_occurrences
      add constraint mcat_plan_occurrences_status_check
      check (status in ('planned', 'committed', 'completed', 'skipped', 'moved'));
  end if;
end $$;

create unique index if not exists mcat_plan_occurrences_user_plan_day_idx
  on public.mcat_plan_occurrences (user_id, plan_instance_id, template_key, template_day_index);

create index if not exists mcat_plan_occurrences_user_date_idx
  on public.mcat_plan_occurrences (user_id, planned_date);

create index if not exists mcat_plan_occurrences_user_status_idx
  on public.mcat_plan_occurrences (user_id, status);

drop trigger if exists set_mcat_plan_occurrences_updated_at on public.mcat_plan_occurrences;
create trigger set_mcat_plan_occurrences_updated_at
before update on public.mcat_plan_occurrences
for each row execute function public.set_updated_at();

alter table public.mcat_plan_occurrences enable row level security;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mcat_plan_occurrences'
      and policyname = 'mcat_plan_occurrences_select_own'
  ) then
    drop policy "mcat_plan_occurrences_select_own" on public.mcat_plan_occurrences;
  end if;
  create policy "mcat_plan_occurrences_select_own" on public.mcat_plan_occurrences
    for select to authenticated using ((select auth.uid()) = user_id);

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mcat_plan_occurrences'
      and policyname = 'mcat_plan_occurrences_insert_own'
  ) then
    drop policy "mcat_plan_occurrences_insert_own" on public.mcat_plan_occurrences;
  end if;
  create policy "mcat_plan_occurrences_insert_own" on public.mcat_plan_occurrences
    for insert to authenticated with check ((select auth.uid()) = user_id);

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mcat_plan_occurrences'
      and policyname = 'mcat_plan_occurrences_update_own'
  ) then
    drop policy "mcat_plan_occurrences_update_own" on public.mcat_plan_occurrences;
  end if;
  create policy "mcat_plan_occurrences_update_own" on public.mcat_plan_occurrences
    for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mcat_plan_occurrences'
      and policyname = 'mcat_plan_occurrences_delete_own'
  ) then
    drop policy "mcat_plan_occurrences_delete_own" on public.mcat_plan_occurrences;
  end if;
  create policy "mcat_plan_occurrences_delete_own" on public.mcat_plan_occurrences
    for delete to authenticated using ((select auth.uid()) = user_id);
end $$;

grant select, insert, update, delete on public.mcat_plan_occurrences to authenticated;
grant all on public.mcat_plan_occurrences to service_role;
