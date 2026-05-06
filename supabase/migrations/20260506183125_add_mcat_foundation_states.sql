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

create table if not exists public.mcat_foundation_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  active_session jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_mcat_foundation_states_updated_at on public.mcat_foundation_states;

create trigger set_mcat_foundation_states_updated_at
before update on public.mcat_foundation_states
for each row execute function public.set_updated_at();

alter table public.mcat_foundation_states enable row level security;

grant select, insert, update, delete on table public.mcat_foundation_states to authenticated, service_role;

drop policy if exists mcat_foundation_states_own_row on public.mcat_foundation_states;

create policy mcat_foundation_states_own_row
on public.mcat_foundation_states
as permissive
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
