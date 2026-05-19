-- Lifeee persistence hardening:
-- 1) Make mcat_plan_instances RLS policies idempotent (re-runs must not error).
-- 2) Grant authenticated and service_role table privileges for MCAT plan
--    instances and Life Routine instances so the browser client can use them
--    under RLS. RLS still scopes rows to auth.uid() = user_id.

-- ---------------------------------------------------------------
-- mcat_plan_instances: re-create policies idempotently
-- ---------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mcat_plan_instances'
      and policyname = 'mcat_plan_instances_select_own'
  ) then
    drop policy "mcat_plan_instances_select_own" on public.mcat_plan_instances;
  end if;
  create policy "mcat_plan_instances_select_own" on public.mcat_plan_instances
    for select using (auth.uid() = user_id);

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mcat_plan_instances'
      and policyname = 'mcat_plan_instances_insert_own'
  ) then
    drop policy "mcat_plan_instances_insert_own" on public.mcat_plan_instances;
  end if;
  create policy "mcat_plan_instances_insert_own" on public.mcat_plan_instances
    for insert with check (auth.uid() = user_id);

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mcat_plan_instances'
      and policyname = 'mcat_plan_instances_update_own'
  ) then
    drop policy "mcat_plan_instances_update_own" on public.mcat_plan_instances;
  end if;
  create policy "mcat_plan_instances_update_own" on public.mcat_plan_instances
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mcat_plan_instances'
      and policyname = 'mcat_plan_instances_delete_own'
  ) then
    drop policy "mcat_plan_instances_delete_own" on public.mcat_plan_instances;
  end if;
  create policy "mcat_plan_instances_delete_own" on public.mcat_plan_instances
    for delete using (auth.uid() = user_id);
end $$;

-- ---------------------------------------------------------------
-- Table-level grants. RLS continues to restrict row visibility to
-- the owning user; these grants only allow the role to attempt the
-- operation, which RLS then filters.
-- ---------------------------------------------------------------
grant select, insert, update, delete on public.mcat_plan_instances to authenticated;
grant all on public.mcat_plan_instances to service_role;

grant select, insert, update, delete on public.user_routine_instances to authenticated;
grant all on public.user_routine_instances to service_role;
