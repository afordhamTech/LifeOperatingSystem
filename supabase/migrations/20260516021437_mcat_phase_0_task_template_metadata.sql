alter table if exists public.universal_tasks
  add column if not exists template_key text,
  add column if not exists template_day_index integer,
  add column if not exists template_week_index integer,
  add column if not exists template_phase text,
  add column if not exists generated_from jsonb;

create index if not exists universal_tasks_user_source_template_idx
  on public.universal_tasks (user_id, source, template_key);

create unique index if not exists universal_tasks_user_source_template_day_idx
  on public.universal_tasks (user_id, source, template_key, template_day_index)
  where template_key is not null
    and template_day_index is not null;

create index if not exists universal_tasks_user_template_week_idx
  on public.universal_tasks (user_id, template_key, template_week_index)
  where template_key is not null
    and template_week_index is not null;
