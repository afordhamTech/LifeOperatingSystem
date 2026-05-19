-- Extend MCAT plan occurrences into a chronological queue state machine.
-- This keeps Phase 0 planned work inside MCAT until one item is active.

alter table if exists public.mcat_plan_occurrences
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists skipped_at timestamptz,
  add column if not exists skipped_reason text,
  add column if not exists moved_from_date date;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'mcat_plan_occurrences_status_check'
      and conrelid = 'public.mcat_plan_occurrences'::regclass
  ) then
    alter table public.mcat_plan_occurrences
      drop constraint mcat_plan_occurrences_status_check;
  end if;
end $$;

update public.mcat_plan_occurrences
set status = 'in_progress'
where status = 'committed';

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
      check (status in ('planned', 'available', 'in_progress', 'completed', 'skipped', 'moved'));
  end if;
end $$;

create unique index if not exists mcat_plan_occurrences_one_in_progress_idx
  on public.mcat_plan_occurrences (
    user_id,
    coalesce(plan_instance_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'in_progress';
