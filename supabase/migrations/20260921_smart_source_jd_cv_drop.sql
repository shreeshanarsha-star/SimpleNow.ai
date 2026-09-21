-- Smart Source.ai: per-project JD + CV drop box.
--
-- One active JD per project (a new JD overwrites the old one -- no history
-- kept, by design). Candidates dropped in as CVs keep their extracted text so
-- they can be re-scored whenever the project's JD changes. Scores against the
-- project's JD live on the project member row (not the shared candidate row)
-- so the same candidate in two projects can carry two different scores.
--
-- Purely additive: every column is nullable, no existing data is touched.

alter table public.smart_source_projects
  add column if not exists jd_text text,
  add column if not exists jd_file_name text,
  add column if not exists jd_updated_at timestamptz,
  add column if not exists jd_drop_id text;

alter table public.smart_source_candidates
  add column if not exists resume_text text,
  add column if not exists cv_file_name text;

alter table public.smart_source_project_members
  add column if not exists jd_score integer,
  add column if not exists jd_summary text,
  add column if not exists jd_strengths text[],
  add column if not exists jd_gaps text[],
  add column if not exists jd_scored_at timestamptz;

alter table public.smart_source_project_members
  drop constraint if exists smart_source_project_members_jd_score_range;
alter table public.smart_source_project_members
  add constraint smart_source_project_members_jd_score_range
  check (jd_score is null or (jd_score >= 0 and jd_score <= 100));
