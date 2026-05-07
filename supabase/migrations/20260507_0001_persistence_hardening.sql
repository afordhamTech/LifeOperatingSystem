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

alter table if exists public.ai_prompt_exports
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.universal_tasks
  add column if not exists linked_anchor_id uuid;

alter table if exists public.daily_logs
  add column if not exists energy integer;

do $$
begin
  if to_regclass('public.daily_logs') is not null
    and not exists (
      select 1
      from pg_constraint
      where conname = 'daily_logs_energy_check'
        and conrelid = 'public.daily_logs'::regclass
    )
  then
    alter table public.daily_logs
      add constraint daily_logs_energy_check
      check (energy is null or energy between 1 and 10);
  end if;
end
$$;

do $$
begin
  if to_regclass('public.universal_tasks') is not null
    and to_regclass('public.calendar_anchors') is not null
    and not exists (
      select 1
      from pg_constraint
      where conname = 'universal_tasks_linked_anchor_id_fkey'
        and conrelid = 'public.universal_tasks'::regclass
    )
  then
    alter table public.universal_tasks
      add constraint universal_tasks_linked_anchor_id_fkey
      foreign key (linked_anchor_id)
      references public.calendar_anchors (id)
      on delete set null;
  end if;
end
$$;

create index if not exists universal_tasks_user_linked_anchor_idx
  on public.universal_tasks (user_id, linked_anchor_id);

do $$
begin
  if to_regclass('public.ai_prompt_exports') is not null then
    alter table public.ai_prompt_exports enable row level security;

    grant select, insert, update, delete
      on table public.ai_prompt_exports
      to authenticated, service_role;

    drop policy if exists ai_prompt_exports_own_rows on public.ai_prompt_exports;
    create policy ai_prompt_exports_own_rows
      on public.ai_prompt_exports
      as permissive
      for all
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);

    drop trigger if exists set_ai_prompt_exports_updated_at on public.ai_prompt_exports;
    create trigger set_ai_prompt_exports_updated_at
      before update on public.ai_prompt_exports
      for each row
      execute function public.set_updated_at();
  end if;
end
$$;

do $$
begin
  if to_regclass('public.universal_tasks') is not null then
    drop trigger if exists set_universal_tasks_updated_at on public.universal_tasks;
    create trigger set_universal_tasks_updated_at
      before update on public.universal_tasks
      for each row
      execute function public.set_updated_at();
  end if;
end
$$;
