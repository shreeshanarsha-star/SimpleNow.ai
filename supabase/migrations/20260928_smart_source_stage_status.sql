-- Smart Source.ai: two-layer pipeline (Stage + Status) replacing the flat
-- `status` column on smart_source_project_members.
--
--   pipeline_stage   where the candidate is (sourcing .. joining)
--   pipeline_status  what is happening inside that stage (scheduled, hold ..)
--
-- The catalog of valid stages/statuses and the per-stage rules live in
-- src/lib/smartSourcePipeline.ts; the API validates every change against it.
-- The legacy `status` column is left in place (unused) so older rows and any
-- external reader keep working; nothing writes to it anymore.

alter table public.smart_source_project_members
  add column if not exists pipeline_stage text not null default 'sourcing',
  add column if not exists pipeline_status text not null default 'yet_to_contact',
  add column if not exists status_reason text,
  add column if not exists hold_until date,
  add column if not exists bgv_status text,
  add column if not exists pipeline_details jsonb not null default '{}'::jsonb,
  add column if not exists stage_changed_at timestamptz not null default now(),
  add column if not exists status_changed_at timestamptz not null default now();

-- Per-project stage template: which optional stages this role uses.
-- null = every stage enabled.
alter table public.smart_source_projects
  add column if not exists stage_template text[];

-- Map legacy flat statuses onto (stage, status). Only rows still at the
-- column defaults are touched, so re-running this is harmless.
update public.smart_source_project_members m
set pipeline_stage = x.stage,
    pipeline_status = x.status,
    stage_changed_at = coalesce(m.updated_at, m.added_at, now()),
    status_changed_at = coalesce(m.updated_at, m.added_at, now())
from (values
  ('CV Sourced',             'sourcing',     'yet_to_contact'),
  ('CV Screened',            'hm_review',    'yet_to_share'),
  ('CV Shared',              'hm_review',    'shared_with_hm'),
  ('L1 Interview Shortlist', 'l1',           'yet_to_schedule'),
  ('L2 Interview Shortlist', 'l2',           'yet_to_schedule'),
  ('HR Interview Shortlist', 'hr_interview', 'yet_to_schedule'),
  ('Offered',                'offer',        'offered'),
  ('To Join',                'joining',      'yet_to_join'),
  ('Joined',                 'joining',      'joined'),
  ('Hold',                   'screening',    'hold'),
  ('Rejected',               'screening',    'reject'),
  ('Offer Drop',             'offer',        'offer_declined'),
  ('Backout',                'joining',      'dropped')
) as x(legacy, stage, status)
where m.status = x.legacy
  and m.pipeline_stage = 'sourcing'
  and m.pipeline_status = 'yet_to_contact';

create index if not exists smart_source_project_members_stage_idx
  on public.smart_source_project_members (project_id, pipeline_stage);

-- Stage/status change history: the backbone for time-in-stage, conversion
-- and time-to-hire reporting.
create table if not exists public.smart_source_member_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.smart_source_project_members(id) on delete cascade,
  project_id uuid not null references public.smart_source_projects(id) on delete cascade,
  candidate_id uuid not null,
  from_stage text,
  from_status text,
  to_stage text not null,
  to_status text not null,
  reason text,
  note text,
  auto boolean not null default false,
  actor uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists smart_source_member_events_member_idx
  on public.smart_source_member_events (member_id, created_at desc);
create index if not exists smart_source_member_events_project_idx
  on public.smart_source_member_events (project_id, created_at desc);

alter table public.smart_source_member_events enable row level security;

drop policy if exists smart_source_member_events_org_read on public.smart_source_member_events;
create policy smart_source_member_events_org_read on public.smart_source_member_events
  for select using (
    exists (
      select 1 from public.smart_source_projects sp
      join public.profiles p on p.id = auth.uid()
      where sp.id = smart_source_member_events.project_id
        and (p.is_admin or p.org_id = sp.org_id)
    )
  );

drop policy if exists smart_source_member_events_org_write on public.smart_source_member_events;
create policy smart_source_member_events_org_write on public.smart_source_member_events
  for insert with check (
    exists (
      select 1 from public.smart_source_projects sp
      join public.profiles p on p.id = auth.uid()
      where sp.id = smart_source_member_events.project_id
        and (p.is_admin or p.org_id = sp.org_id)
    )
  );
