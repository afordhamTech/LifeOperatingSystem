alter table if exists public.proof_items
  add column if not exists hours_worked numeric,
  add column if not exists proof_score numeric,
  add column if not exists visibility integer,
  add column if not exists difficulty integer,
  add column if not exists relevance integer,
  add column if not exists completion integer,
  add column if not exists github_updated boolean not null default false,
  add column if not exists linkedin_updated boolean not null default false,
  add column if not exists resume_bullet_added boolean not null default false,
  add column if not exists application_submitted boolean not null default false,
  add column if not exists mentor_contact text;

alter table if exists public.faith_logs
  add column if not exists prayer_done boolean not null default false,
  add column if not exists bible_reading text,
  add column if not exists chapter_studied text,
  add column if not exists temptation text,
  add column if not exists church_involvement boolean not null default false,
  add column if not exists faith_score numeric;

alter table if exists public.relationship_logs
  add column if not exists date date,
  add column if not exists unresolved_issue text,
  add column if not exists relationship_priority numeric,
  add column if not exists social_confidence integer,
  add column if not exists miscommunication text;

alter table if exists public.money_logs
  add column if not exists food_spending numeric,
  add column if not exists school_costs numeric,
  add column if not exists emergency_fund numeric,
  add column if not exists net_cash_flow numeric,
  add column if not exists savings_rate numeric,
  add column if not exists subscription_items jsonb not null default '[]'::jsonb;

alter table if exists public.health_logs
  add column if not exists pain_type text,
  add column if not exists pain_trigger text,
  add column if not exists pain_reliever text,
  add column if not exists training_done text,
  add column if not exists sleep numeric,
  add column if not exists hydration integer,
  add column if not exists mobility_done boolean not null default false,
  add column if not exists medication_taken text,
  add column if not exists doctor_visit_needed boolean not null default false;

alter table if exists public.substance_logs
  add column if not exists topic_studied text,
  add column if not exists notes_taken text,
  add column if not exists flashcards_made integer not null default 0,
  add column if not exists conversation_practice boolean not null default false,
  add column if not exists question_of_day text,
  add column if not exists writing_practice boolean not null default false,
  add column if not exists speaking_practice_done boolean not null default false,
  add column if not exists substance_score numeric;
