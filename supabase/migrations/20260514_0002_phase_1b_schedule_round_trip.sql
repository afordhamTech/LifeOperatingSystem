create extension if not exists pgcrypto;

create table if not exists public.schedule_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  raw_text text not null,
  parsed_json jsonb not null default '{}'::jsonb,
  applied boolean not null default false,
  plan_realism_score numeric,
  risks jsonb not null default '[]'::jsonb,
  unscheduled jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.time_blocks
  add column if not exists linked_anchor_id uuid,
  add column if not exists source text default 'manual',
  add column if not exists import_batch_id uuid,
  add column if not exists reason text,
  add column if not exists status text not null default 'planned',
  add column if not exists missed_reason text,
  add column if not exists completed_at timestamptz;

alter table public.daily_plans
  add column if not exists generated_from jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'time_blocks_linked_anchor_id_fkey'
  ) then
    alter table public.time_blocks
      add constraint time_blocks_linked_anchor_id_fkey
      foreign key (linked_anchor_id)
      references public.calendar_anchors (id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'time_blocks_import_batch_id_fkey'
  ) then
    alter table public.time_blocks
      add constraint time_blocks_import_batch_id_fkey
      foreign key (import_batch_id)
      references public.schedule_imports (id)
      on delete set null;
  end if;
end
$$;

create index if not exists schedule_imports_user_date_idx
  on public.schedule_imports (user_id, date);

create index if not exists time_blocks_user_source_date_idx
  on public.time_blocks (user_id, source, date);

create index if not exists time_blocks_import_batch_idx
  on public.time_blocks (import_batch_id);

alter table public.schedule_imports enable row level security;

grant select, insert, update, delete on table public.schedule_imports to authenticated;

drop trigger if exists set_schedule_imports_updated_at on public.schedule_imports;
create trigger set_schedule_imports_updated_at
before update on public.schedule_imports
for each row
execute function public.set_updated_at();

drop policy if exists schedule_imports_own_rows on public.schedule_imports;
create policy schedule_imports_own_rows
on public.schedule_imports
as permissive
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
