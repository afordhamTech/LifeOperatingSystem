create table if not exists public.mcat_plan_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_key text not null,
  phase_name text not null,
  seed_start_date date not null,
  seed_end_date date not null,
  total_planned_minutes integer not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mcat_plan_instances_user_template_active_idx
  on public.mcat_plan_instances (user_id, template_key)
  where status = 'active';

create index if not exists mcat_plan_instances_user_idx
  on public.mcat_plan_instances (user_id);

alter table public.mcat_plan_instances enable row level security;

create policy "mcat_plan_instances_select_own" on public.mcat_plan_instances
  for select using (auth.uid() = user_id);
create policy "mcat_plan_instances_insert_own" on public.mcat_plan_instances
  for insert with check (auth.uid() = user_id);
create policy "mcat_plan_instances_update_own" on public.mcat_plan_instances
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "mcat_plan_instances_delete_own" on public.mcat_plan_instances
  for delete using (auth.uid() = user_id);
