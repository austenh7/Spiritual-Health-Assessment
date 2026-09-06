-- The Garden — Spiritual Health Snapshot
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).
--
-- If you already ran an earlier version of this file (one with a plain "id"
-- column instead of "submission_id"), run this first instead of the CREATE
-- TABLE below, then skip straight to the "alter table ... enable row level
-- security" section, which is unchanged:
--
--   alter table public.assessment_submissions rename column id to submission_id;
--
-- Then continue on with the "add constraint" and "enable row level security"
-- statements further down this file — those are unchanged either way.

create extension if not exists pgcrypto; -- provides gen_random_uuid(); usually already on by default

create table if not exists public.assessment_submissions (
  submission_id uuid primary key default gen_random_uuid(),
  completed_at timestamptz not null default now(),

  first_name text,
  last_name text,
  email text,

  christ_score numeric(3,1),
  word_score numeric(3,1),
  community_score numeric(3,1),
  feasting_score numeric(3,1),
  fasting_score numeric(3,1),
  rest_score numeric(3,1),
  work_score numeric(3,1),
  worship_score numeric(3,1),
  justice_score numeric(3,1),
  prayer_score numeric(3,1),
  service_score numeric(3,1),
  contentment_score numeric(3,1),
  generosity_score numeric(3,1),
  shade_score numeric(3,1),
  fruit_score numeric(3,1),

  -- e.g. {"christ": "Growing", "word": "Flourishing", ...} — one JSON object
  -- rather than 15 more columns, since these are derived labels, not raw data.
  dimension_statuses jsonb,

  -- e.g. ["Rest", "Community"] — the area(s) the participant selected in
  -- the guided reflection step (up to 2), by human-readable label.
  reflection_areas text[],

  -- The one area they ultimately chose on the "Choose a Focus" screen —
  -- kept so "chosen next practice" is meaningful on its own without needing
  -- to join back to anything else.
  chosen_focus text,

  chosen_practice_title text,
  chosen_practice_description text
);

-- submission_id is already unique as the primary key; this named constraint
-- makes that guarantee explicit and self-documenting — the same submission
-- (same client-generated ID) can never create a second row, even if a
-- refresh happens mid-save and the request is retried.
alter table public.assessment_submissions
  add constraint assessment_submissions_submission_id_key unique (submission_id);

alter table public.assessment_submissions enable row level security;

-- Participants (the anonymous/public browser client) may INSERT a completed
-- result. No SELECT, UPDATE, or DELETE policy exists for the anon role at
-- all, on purpose — this means the public client can submit a result but can
-- never read back any row, including its own, let alone anyone else's.
create policy "Public can insert a completed submission"
  on public.assessment_submissions
  for insert
  to anon
  with check (true);

-- To view results yourself: use the Supabase Table Editor (or SQL Editor)
-- while logged into your own Supabase account — that bypasses RLS entirely
-- for project owners. No separate reporting policy is needed for that.
