-- NR Synergy: foundation schema (Phase 1)
-- Intranet for an organization's international employees and consultants.
-- Every table is prefixed nrs_ and scoped by org_id (public.organizations).
-- Plan: "NR Synergy - Final Feature List & Build Plan v2".
--
-- Design rules enforced here:
--  * Person (nrs_members) -> Engagement (consultant | payroll) -> Country rules.
--  * Effective-dated rules (country rules, approval chains, contract terms, FX).
--  * One approval engine (nrs_requests + nrs_request_steps) for every request kind.
--  * Money in integer minor units + ISO currency; FX rate stored per transaction.
--  * Append-only audit (nrs_audit_events): no UPDATE/DELETE allowed, even for service role.
--  * Soft delete (deleted_at) on financial/admin records; demo rows flagged is_demo.
--  * RLS on every table. Reads are scoped to the caller's org + role; sensitive
--    writes (approvals, invoices, contract terms) go through server routes that use
--    the service role AFTER app-level checks, so RLS grants SELECT only there.

-- ---------------------------------------------------------------------------
-- 0. Helper functions
-- ---------------------------------------------------------------------------

create table if not exists public.nrs_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  email text not null,
  designation text,
  department text,
  division text,
  home_country text not null,                 -- ISO 3166-1 alpha-2
  manager_id uuid references public.nrs_members(id) on delete set null,
  languages text[] not null default '{}',
  bio text,
  avatar_url text,
  joined_on date,
  left_on date,
  status text not null default 'active' check (status in ('active','inactive')),
  theme text not null default 'nr-green' check (theme in ('nr-green','light','onyx')),
  locale text not null default 'en' check (locale in ('en','es','pt','de')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (org_id, email)
);
create index if not exists nrs_members_org_idx on public.nrs_members(org_id);
create index if not exists nrs_members_manager_idx on public.nrs_members(manager_id);

create table if not exists public.nrs_member_roles (
  member_id uuid not null references public.nrs_members(id) on delete cascade,
  role text not null check (role in ('employee','manager','hr_admin','finance','super_admin')),
  primary key (member_id, role)
);

-- The caller's org (reuses the platform helper) and member row.
create or replace function public.nrs_me()
returns uuid language sql stable security definer set search_path = '' as $$
  select m.id from public.nrs_members m
  where m.user_id = auth.uid() and m.status = 'active' and m.deleted_at is null
  limit 1;
$$;

create or replace function public.nrs_my_org()
returns uuid language sql stable security definer set search_path = '' as $$
  select m.org_id from public.nrs_members m
  where m.user_id = auth.uid() and m.status = 'active' and m.deleted_at is null
  limit 1;
$$;

create or replace function public.nrs_has_role(r text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
      or exists (
        select 1 from public.nrs_member_roles mr
        join public.nrs_members m on m.id = mr.member_id
        where m.user_id = auth.uid() and m.status = 'active' and m.deleted_at is null
          and (mr.role = r or mr.role = 'super_admin')
      );
$$;

create or replace function public.nrs_is_hr()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.nrs_has_role('hr_admin');
$$;

create or replace function public.nrs_is_finance()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.nrs_has_role('finance');
$$;

-- True when the caller is the direct manager of member m.
create or replace function public.nrs_manages(m uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.nrs_members t
    where t.id = m and t.manager_id is not null and t.manager_id = public.nrs_me()
  );
$$;

-- Caller may see member m's personal records: self, their manager, HR.
create or replace function public.nrs_can_see_member(m uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select m = public.nrs_me() or public.nrs_manages(m) or public.nrs_is_hr();
$$;

-- Same org as the caller's member row (or platform owner).
create or replace function public.nrs_in_my_org(o uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select o = public.nrs_my_org()
      or coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.nrs_touch()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists nrs_members_touch on public.nrs_members;
create trigger nrs_members_touch before update on public.nrs_members
for each row execute function public.nrs_touch();

-- ---------------------------------------------------------------------------
-- 1. Org settings, features, countries, holidays, FX
-- ---------------------------------------------------------------------------

create table if not exists public.nrs_org_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  display_name text not null default 'NR Synergy',
  reporting_currency text not null default 'USD',
  default_theme text not null default 'nr-green' check (default_theme in ('nr-green','light','onyx')),
  logo_path text,
  brand jsonb not null default '{}'::jsonb,
  ai_monthly_budget_usd numeric(10,2) not null default 50,
  location_retention_days integer not null default 365,
  updated_at timestamptz not null default now()
);

-- Catalogue of switchable features (per-person switches in nrs_member_features).
create table if not exists public.nrs_features (
  key text primary key,
  name text not null,
  description text,
  default_on boolean not null default true,
  sort integer not null default 0
);

insert into public.nrs_features (key, name, description, default_on, sort) values
  ('home','Home','Feed, today panel, kudos, events', true, 10),
  ('time','Time','Check-in / work log, leave, holidays', true, 20),
  ('money','Money','Invoices, expenses, travel, documents', true, 30),
  ('projects','Projects','Projects and weekly updates', true, 40),
  ('people','People','Directory and org chart', true, 50),
  ('knowledge','Knowledge','JOE, Library, quick links', true, 60),
  ('help','Help','Requests to IT/HR/Payroll/Admin, my assets', true, 70),
  ('search_ai','Search and AI','Universal search, answers and commands', true, 80)
on conflict (key) do nothing;

create table if not exists public.nrs_member_features (
  member_id uuid not null references public.nrs_members(id) on delete cascade,
  feature_key text not null references public.nrs_features(key) on delete cascade,
  enabled boolean not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (member_id, feature_key)
);

-- Effective switch: explicit row wins, else the catalogue default.
create or replace function public.nrs_feature_on(k text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select mf.enabled from public.nrs_member_features mf where mf.member_id = public.nrs_me() and mf.feature_key = k),
    (select f.default_on from public.nrs_features f where f.key = k),
    false
  ) or public.nrs_is_hr();
$$;

create table if not exists public.nrs_countries (
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,                         -- ISO alpha-2
  name text not null,
  timezone text not null,                     -- IANA, e.g. America/Mexico_City
  currency text not null,                     -- ISO 4217
  primary key (org_id, code)
);

-- Effective-dated working rules per country.
create table if not exists public.nrs_country_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  country_code text not null,
  effective_from date not null,
  working_days smallint[] not null default '{1,2,3,4,5}',  -- ISO weekday 1=Mon..7=Sun
  std_hours_per_day numeric(4,2) not null default 8,
  leave_rules jsonb not null default '{}'::jsonb,           -- per engagement type: {"payroll":{"annual":20,"sick":7},"consultant":{}}
  expense_limits jsonb not null default '{}'::jsonb,        -- per category, minor units in country currency
  created_at timestamptz not null default now(),
  foreign key (org_id, country_code) references public.nrs_countries(org_id, code) on delete cascade,
  unique (org_id, country_code, effective_from)
);

create table if not exists public.nrs_holidays (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  country_code text not null,
  day date not null,
  name text not null,
  source text not null default 'manual' check (source in ('manual','import')),
  foreign key (org_id, country_code) references public.nrs_countries(org_id, code) on delete cascade,
  unique (org_id, country_code, day)
);

-- Daily FX rates (global, not org-scoped). rate = units of quote per 1 base.
create table if not exists public.nrs_fx_rates (
  on_date date not null,
  base text not null,
  quote text not null,
  rate numeric(20,10) not null check (rate > 0),
  source text not null default 'import',
  primary key (on_date, base, quote)
);

-- ---------------------------------------------------------------------------
-- 2. Engagements (agreement type) and contracts
-- ---------------------------------------------------------------------------

create table if not exists public.nrs_engagements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.nrs_members(id) on delete cascade,
  type text not null check (type in ('consultant','payroll')),
  country_code text not null,
  starts_on date not null,
  ends_on date,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists nrs_engagements_member_idx on public.nrs_engagements(member_id);

-- Current engagement type of the caller ('consultant' | 'payroll' | null).
create or replace function public.nrs_engagement_type(m uuid)
returns text language sql stable security definer set search_path = '' as $$
  select e.type from public.nrs_engagements e
  where e.member_id = m and e.deleted_at is null
    and e.starts_on <= current_date and (e.ends_on is null or e.ends_on >= current_date)
  order by e.starts_on desc limit 1;
$$;

create table if not exists public.nrs_contracts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.nrs_members(id) on delete cascade,
  engagement_id uuid references public.nrs_engagements(id) on delete set null,
  file_path text,                                   -- storage: nrs-private/{org}/contracts/...
  file_name text,
  status text not null default 'uploaded'
    check (status in ('uploaded','extracting','review','verified','superseded','failed')),
  extraction jsonb,                                 -- raw AI proposal incl. clause evidence + confidence
  uploaded_by uuid references auth.users(id),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Verified, versioned billing terms. Only verified rows are ever used to invoice.
create table if not exists public.nrs_contract_terms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.nrs_contracts(id) on delete cascade,
  member_id uuid not null references public.nrs_members(id) on delete cascade,
  effective_from date not null,
  effective_to date,
  basis text not null check (basis in ('monthly_retainer','pro_rata_working_days','day_rate')),
  fee_minor bigint not null check (fee_minor >= 0),
  currency text not null,
  paid_leave_days_per_year numeric(5,2) not null default 0,
  reimbursables text[] not null default '{}',
  tax jsonb not null default '{}'::jsonb,
  notice_days integer,
  clause_refs jsonb not null default '{}'::jsonb,   -- {"fee":"5.1","basis":"5.2",...}
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists nrs_contract_terms_member_idx on public.nrs_contract_terms(member_id, effective_from);

create table if not exists public.nrs_signatures (
  member_id uuid primary key references public.nrs_members(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  svg_path text not null,                           -- normalized SVG path data
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Approval engine
-- ---------------------------------------------------------------------------

create table if not exists public.nrs_approval_chains (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('leave','correction','expense','travel','invoice')),
  effective_from date not null default current_date,
  -- e.g. [{"type":"manager"},{"type":"role","role":"hr_admin"},{"type":"role","role":"finance","when":{"amount_minor_gt":50000}}]
  steps jsonb not null,
  applies_to text not null default 'all' check (applies_to in ('all','consultant','payroll')),
  created_at timestamptz not null default now(),
  unique (org_id, kind, applies_to, effective_from)
);

create table if not exists public.nrs_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('leave','correction','expense','travel','invoice')),
  subject_id uuid not null,                         -- row id in the kind's own table
  member_id uuid not null references public.nrs_members(id) on delete cascade,  -- whose request
  created_by uuid references auth.users(id),
  title text not null,
  summary text,
  amount_minor bigint,
  currency text,
  status text not null default 'pending'
    check (status in ('draft','pending','approved','rejected','sent_back','cancelled')),
  current_step integer not null default 1,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (kind, subject_id)
);
create index if not exists nrs_requests_member_idx on public.nrs_requests(member_id);
create index if not exists nrs_requests_org_status_idx on public.nrs_requests(org_id, status);

create table if not exists public.nrs_request_steps (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.nrs_requests(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  step_no integer not null,
  approver_type text not null check (approver_type in ('manager','role','member')),
  approver_role text check (approver_role in ('hr_admin','finance','super_admin')),
  approver_member_id uuid references public.nrs_members(id) on delete set null,
  status text not null default 'waiting'
    check (status in ('waiting','pending','approved','rejected','sent_back','skipped')),
  decided_by_member uuid references public.nrs_members(id),
  acting_for_member uuid references public.nrs_members(id),   -- set when a delegate decided
  comment text,
  due_at timestamptz,
  decided_at timestamptz,
  unique (request_id, step_no)
);
create index if not exists nrs_request_steps_approver_idx on public.nrs_request_steps(approver_member_id, status);

create table if not exists public.nrs_delegations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.nrs_members(id) on delete cascade,
  delegate_member_id uuid not null references public.nrs_members(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (member_id <> delegate_member_id)
);

-- Can the caller act on this step right now (as approver, by role, or as an active delegate)?
create or replace function public.nrs_can_act_on_step(step_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.nrs_request_steps s
    where s.id = step_id and s.status = 'pending'
      and (
        s.approver_member_id = public.nrs_me()
        or (s.approver_type = 'role' and s.approver_role is not null and public.nrs_has_role(s.approver_role))
        or exists (
          select 1 from public.nrs_delegations d
          where d.member_id = s.approver_member_id and d.delegate_member_id = public.nrs_me()
            and current_date between d.starts_on and d.ends_on
        )
      )
  );
$$;

-- Caller is involved in a request (requester, subject's manager, any step approver/delegate, HR, finance for money kinds).
create or replace function public.nrs_can_see_request(req uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.nrs_requests r
    where r.id = req and (
      public.nrs_can_see_member(r.member_id)
      or (r.kind in ('expense','invoice','travel') and public.nrs_is_finance())
      or exists (
        select 1 from public.nrs_request_steps s
        where s.request_id = r.id and (
          s.approver_member_id = public.nrs_me()
          or exists (select 1 from public.nrs_delegations d
                     where d.member_id = s.approver_member_id and d.delegate_member_id = public.nrs_me()
                       and current_date between d.starts_on and d.ends_on)
        )
      )
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Time
-- ---------------------------------------------------------------------------

create table if not exists public.nrs_work_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.nrs_members(id) on delete cascade,
  day date not null,                                -- the member's local date
  check_in_at timestamptz not null,
  check_out_at timestamptz,
  timezone text not null,
  mode text not null default 'office' check (mode in ('office','client_visit','home','travel','trade_fair')),
  city text,
  country_code text,
  lat numeric(8,5),                                 -- optional; null when not shared
  lng numeric(8,5),
  location_shared boolean not null default false,
  is_travel boolean not null default false,         -- checked in outside home country
  source text not null default 'app' check (source in ('app','correction','import')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  check (check_out_at is null or check_out_at >= check_in_at)
);
create index if not exists nrs_work_logs_member_day_idx on public.nrs_work_logs(member_id, day);

create table if not exists public.nrs_leave_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.nrs_members(id) on delete cascade,
  type text not null check (type in ('annual','sick','personal','unavailable','unpaid')),
  starts_on date not null,
  ends_on date not null,
  working_days numeric(5,2) not null,               -- computed with country working days + holidays
  note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','sent_back')),
  calendar_event_id text,                           -- Google Calendar event once written
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index if not exists nrs_leave_member_idx on public.nrs_leave_requests(member_id, starts_on);

create table if not exists public.nrs_corrections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.nrs_members(id) on delete cascade,
  work_log_id uuid references public.nrs_work_logs(id) on delete set null,
  day date not null,
  proposed_check_in timestamptz,
  proposed_check_out timestamptz,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','applied','sent_back')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. Money
-- ---------------------------------------------------------------------------

create table if not exists public.nrs_expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.nrs_members(id) on delete cascade,
  spent_on date not null,
  category text not null check (category in ('travel','meals','lodging','client_entertainment','trade_fair','other')),
  description text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  fx_rate numeric(20,10),                           -- to reporting currency, locked at submission
  reporting_amount_minor bigint,
  receipt_path text,
  over_limit boolean not null default false,
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','sent_back','invoiced','reimbursed')),
  invoice_id uuid,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists nrs_expenses_member_idx on public.nrs_expenses(member_id, spent_on);

create table if not exists public.nrs_travel_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.nrs_members(id) on delete cascade,
  destination text not null,
  purpose text not null,
  starts_on date not null,
  ends_on date not null,
  estimated_minor bigint,
  currency text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','sent_back')),
  bookings jsonb not null default '[]'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table if not exists public.nrs_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.nrs_members(id) on delete cascade,
  number text not null,
  period_start date not null,
  period_end date not null,
  terms_id uuid not null references public.nrs_contract_terms(id),
  currency text not null,
  subtotal_minor bigint not null default 0,
  expenses_minor bigint not null default 0,
  total_minor bigint not null default 0,
  fx_rate_to_reporting numeric(20,10),              -- locked at submission
  calc_snapshot jsonb not null default '{}'::jsonb, -- inputs used (days, holidays, leave, terms) for reproducibility
  status text not null default 'draft'
    check (status in ('draft','submitted','manager_approved','hr_approved','finance_approved','paid','rejected','sent_back','cancelled')),
  signed_at timestamptz,
  pdf_path text,
  paid_at timestamptz,
  payment_ref text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (org_id, number),
  unique (member_id, period_start, period_end)
);

create table if not exists public.nrs_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.nrs_invoices(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  sort integer not null default 0,
  kind text not null check (kind in ('fee','proration','leave_deduction','expense','adjustment')),
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_minor bigint not null default 0,
  amount_minor bigint not null,
  source jsonb not null default '{}'::jsonb          -- e.g. {"clause":"5.1"} or {"expense_id":...} or {"work_log_days":20}
);

alter table public.nrs_expenses
  drop constraint if exists nrs_expenses_invoice_fk;
alter table public.nrs_expenses
  add constraint nrs_expenses_invoice_fk foreign key (invoice_id) references public.nrs_invoices(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 6. Work: projects
-- ---------------------------------------------------------------------------

create table if not exists public.nrs_projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  division text,
  owner_member_id uuid not null references public.nrs_members(id) on delete cascade,
  status text not null default 'on_track' check (status in ('on_track','at_risk','blocked','completed')),
  progress_pct smallint not null default 0 check (progress_pct between 0 and 100),
  next_milestone text,
  next_milestone_on date,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.nrs_project_members (
  project_id uuid not null references public.nrs_projects(id) on delete cascade,
  member_id uuid not null references public.nrs_members(id) on delete cascade,
  primary key (project_id, member_id)
);

create table if not exists public.nrs_project_updates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.nrs_projects(id) on delete cascade,
  member_id uuid not null references public.nrs_members(id) on delete cascade,
  week_of date not null,                            -- Monday of the week
  status text not null check (status in ('on_track','at_risk','blocked','completed')),
  progress text not null,
  challenges text,
  plan_of_action text,
  help_needed_member_id uuid references public.nrs_members(id) on delete set null,
  next_milestone text,
  next_milestone_on date,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (project_id, member_id, week_of)
);

-- ---------------------------------------------------------------------------
-- 7. Knowledge: Library, JOE, links
-- ---------------------------------------------------------------------------

create table if not exists public.nrs_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  category text not null check (category in ('hr','travel_expense','conduct','it_security','sop','forms','company')),
  title text not null,
  country_code text,                                -- null = global
  audience text not null default 'all' check (audience in ('all','consultant','payroll','managers')),
  requires_ack boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.nrs_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.nrs_documents(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  version text not null,
  effective_from date not null,
  summary text,
  body_markdown text,                               -- searchable text (also what the AI answers from)
  file_path text,
  published_at timestamptz,
  published_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

create table if not exists public.nrs_acknowledgements (
  version_id uuid not null references public.nrs_document_versions(id) on delete cascade,
  member_id uuid not null references public.nrs_members(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  acked_at timestamptz not null default now(),
  primary key (version_id, member_id)
);

create table if not exists public.nrs_values (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  meaning text not null,
  behaviours text[] not null default '{}',
  not_this text[] not null default '{}',
  leader_message text,
  sort integer not null default 0,
  is_demo boolean not null default false
);

create table if not exists public.nrs_joe_media (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  md_message_title text,
  md_video_url text,
  md_transcript text,
  subtitles jsonb not null default '{}'::jsonb,     -- {"es": "url", ...}
  updated_at timestamptz not null default now()
);

create table if not exists public.nrs_joe_progress (
  member_id uuid not null references public.nrs_members(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  step text not null,                               -- 'md_message' or value id
  reflection text,                                  -- private to member + manager
  completed_at timestamptz not null default now(),
  primary key (member_id, step)
);

create table if not exists public.nrs_quick_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  url text not null check (url ~ '^https://'),
  description text,
  sort integer not null default 0
);

-- ---------------------------------------------------------------------------
-- 8. Home: feed, kudos, events
-- ---------------------------------------------------------------------------

create table if not exists public.nrs_posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('leadership','news','division')),
  title text not null,
  body text not null,
  author_member_id uuid references public.nrs_members(id) on delete set null,
  pinned boolean not null default false,
  published_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.nrs_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.nrs_posts(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.nrs_members(id) on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.nrs_post_reactions (
  post_id uuid not null references public.nrs_posts(id) on delete cascade,
  member_id uuid not null references public.nrs_members(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  emoji text not null check (emoji in ('like','celebrate','support','insightful')),
  primary key (post_id, member_id, emoji)
);

create table if not exists public.nrs_kudos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  from_member_id uuid not null references public.nrs_members(id) on delete cascade,
  to_member_id uuid not null references public.nrs_members(id) on delete cascade,
  value_id uuid not null references public.nrs_values(id) on delete restrict,
  message text not null check (length(message) between 1 and 500),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  check (from_member_id <> to_member_id)
);

create table if not exists public.nrs_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('townhall','training','tradefair','other')),
  title text not null,
  starts_at timestamptz not null,
  location text,
  link text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 9. Help, assets, onboarding
-- ---------------------------------------------------------------------------

create table if not exists public.nrs_tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.nrs_members(id) on delete cascade,
  category text not null check (category in ('it','hr','payroll','admin')),
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  assignee_member_id uuid references public.nrs_members(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.nrs_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.nrs_tickets(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.nrs_members(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.nrs_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('laptop','phone','sim','other')),
  model text,
  serial text,
  assigned_member_id uuid references public.nrs_members(id) on delete set null,
  status text not null default 'issued' check (status in ('in_stock','issued','returned','lost')),
  issued_on date,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.nrs_checklist_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.nrs_members(id) on delete cascade,  -- the joiner / leaver
  kind text not null default 'onboarding' check (kind in ('onboarding','exit')),
  title text not null,
  owner_member_id uuid references public.nrs_members(id) on delete set null,
  sort integer not null default 0,
  due_on date,
  done_at timestamptz,
  done_by uuid references public.nrs_members(id),
  is_demo boolean not null default false
);

-- ---------------------------------------------------------------------------
-- 10. Platform: audit, jobs, push subscriptions
-- ---------------------------------------------------------------------------

create table if not exists public.nrs_audit_events (
  id bigint generated always as identity primary key,
  org_id uuid,
  at timestamptz not null default now(),
  actor_user uuid,                                  -- auth.uid() or null (system/service)
  acting_as_user uuid,                              -- set during admin view-as sessions
  entity text not null,
  entity_id text,
  action text not null,
  before jsonb,
  after jsonb,
  context jsonb not null default '{}'::jsonb
);
create index if not exists nrs_audit_org_at_idx on public.nrs_audit_events(org_id, at desc);

create or replace function public.nrs_audit_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'nrs_audit_events is append-only';
end; $$;

drop trigger if exists nrs_audit_no_update on public.nrs_audit_events;
create trigger nrs_audit_no_update before update or delete on public.nrs_audit_events
for each row execute function public.nrs_audit_immutable();

-- Generic row audit for sensitive tables.
create or replace function public.nrs_audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_id text;
begin
  if tg_op = 'DELETE' then
    v_org := (to_jsonb(old)->>'org_id')::uuid;
    v_id := coalesce(to_jsonb(old)->>'id', to_jsonb(old)->>'member_id');
  else
    v_org := (to_jsonb(new)->>'org_id')::uuid;
    v_id := coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'member_id');
  end if;
  insert into public.nrs_audit_events (org_id, actor_user, entity, entity_id, action, before, after)
  values (
    v_org, auth.uid(), tg_table_name, v_id, lower(tg_op),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end; $$;

do $$
declare t text;
begin
  foreach t in array array[
    'nrs_members','nrs_member_roles','nrs_member_features','nrs_engagements',
    'nrs_contracts','nrs_contract_terms','nrs_approval_chains','nrs_requests',
    'nrs_request_steps','nrs_delegations','nrs_invoices','nrs_invoice_lines',
    'nrs_expenses','nrs_country_rules','nrs_org_settings','nrs_document_versions'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.nrs_audit_row()', t || '_audit', t);
  end loop;
end $$;

create table if not exists public.nrs_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  kind text not null,                               -- 'contract_extract','invoice_pdf','export','digest','gcal_write','gchat_post','fx_import','holiday_import'
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  last_error text,
  result jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists nrs_jobs_queue_idx on public.nrs_jobs(status, run_after);

create table if not exists public.nrs_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.nrs_members(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.nrs_google_tokens (
  member_id uuid primary key references public.nrs_members(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  scopes text[] not null default '{}',
  refresh_token_enc text not null,                  -- encrypted app-side (AES-GCM) before storage
  connected_at timestamptz not null default now(),
  last_error text
);

-- ---------------------------------------------------------------------------
-- 11. Row level security
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'nrs_members','nrs_member_roles','nrs_org_settings','nrs_features','nrs_member_features',
    'nrs_countries','nrs_country_rules','nrs_holidays','nrs_fx_rates','nrs_engagements',
    'nrs_contracts','nrs_contract_terms','nrs_signatures','nrs_approval_chains','nrs_requests',
    'nrs_request_steps','nrs_delegations','nrs_work_logs','nrs_leave_requests','nrs_corrections',
    'nrs_expenses','nrs_travel_requests','nrs_invoices','nrs_invoice_lines','nrs_projects',
    'nrs_project_members','nrs_project_updates','nrs_documents','nrs_document_versions',
    'nrs_acknowledgements','nrs_values','nrs_joe_media','nrs_joe_progress','nrs_quick_links',
    'nrs_posts','nrs_post_comments','nrs_post_reactions','nrs_kudos','nrs_events','nrs_tickets',
    'nrs_ticket_messages','nrs_assets','nrs_checklist_items','nrs_audit_events','nrs_jobs',
    'nrs_push_subscriptions','nrs_google_tokens'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Org-wide readable reference/content tables (any active member of the org).
do $$
declare t text;
begin
  foreach t in array array[
    'nrs_countries','nrs_country_rules','nrs_holidays','nrs_values','nrs_joe_media',
    'nrs_quick_links','nrs_events','nrs_org_settings','nrs_approval_chains'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.nrs_in_my_org(org_id))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_hr_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.nrs_in_my_org(org_id) and public.nrs_is_hr()) with check (public.nrs_in_my_org(org_id) and public.nrs_is_hr())', t || '_hr_write', t);
  end loop;
end $$;

-- Feature catalogue + FX: readable by any signed-in user; written by service role only.
drop policy if exists nrs_features_read on public.nrs_features;
create policy nrs_features_read on public.nrs_features for select to authenticated using (true);
drop policy if exists nrs_fx_read on public.nrs_fx_rates;
create policy nrs_fx_read on public.nrs_fx_rates for select to authenticated using (true);

-- Members: directory is org-readable; HR writes; a member may update their own profile fields via server route.
drop policy if exists nrs_members_read on public.nrs_members;
create policy nrs_members_read on public.nrs_members for select to authenticated
  using (public.nrs_in_my_org(org_id) and deleted_at is null);
drop policy if exists nrs_members_hr_write on public.nrs_members;
create policy nrs_members_hr_write on public.nrs_members for all to authenticated
  using (public.nrs_in_my_org(org_id) and public.nrs_is_hr())
  with check (public.nrs_in_my_org(org_id) and public.nrs_is_hr());

drop policy if exists nrs_member_roles_read on public.nrs_member_roles;
create policy nrs_member_roles_read on public.nrs_member_roles for select to authenticated
  using (exists (select 1 from public.nrs_members m where m.id = member_id and public.nrs_in_my_org(m.org_id)));
drop policy if exists nrs_member_roles_hr_write on public.nrs_member_roles;
-- Only a super admin (or platform owner) may grant / revoke super_admin.
create policy nrs_member_roles_hr_write on public.nrs_member_roles for all to authenticated
  using (public.nrs_is_hr() and (role <> 'super_admin' or public.nrs_has_role('super_admin'))
         and exists (select 1 from public.nrs_members m where m.id = member_id and public.nrs_in_my_org(m.org_id)))
  with check (public.nrs_is_hr() and (role <> 'super_admin' or public.nrs_has_role('super_admin'))
         and exists (select 1 from public.nrs_members m where m.id = member_id and public.nrs_in_my_org(m.org_id)));

drop policy if exists nrs_member_features_read on public.nrs_member_features;
create policy nrs_member_features_read on public.nrs_member_features for select to authenticated
  using (member_id = public.nrs_me() or public.nrs_is_hr());
drop policy if exists nrs_member_features_hr_write on public.nrs_member_features;
create policy nrs_member_features_hr_write on public.nrs_member_features for all to authenticated
  using (public.nrs_is_hr() and exists (select 1 from public.nrs_members m where m.id = member_id and public.nrs_in_my_org(m.org_id)))
  with check (public.nrs_is_hr() and exists (select 1 from public.nrs_members m where m.id = member_id and public.nrs_in_my_org(m.org_id)));

-- Personal records: self, direct manager, HR can read. Writes go through server routes
-- (service role) except where a member-own insert policy is declared below.
do $$
declare t text;
begin
  foreach t in array array[
    'nrs_engagements','nrs_work_logs','nrs_leave_requests','nrs_corrections','nrs_travel_requests',
    'nrs_joe_progress','nrs_checklist_items','nrs_signatures'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.nrs_in_my_org(org_id) and public.nrs_can_see_member(member_id))', t || '_read', t);
  end loop;
end $$;

-- Money: self, manager, HR and finance can read.
do $$
declare t text;
begin
  foreach t in array array['nrs_expenses','nrs_invoices','nrs_contract_terms','nrs_contracts'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.nrs_in_my_org(org_id) and (public.nrs_can_see_member(member_id) or public.nrs_is_finance()))', t || '_read', t);
  end loop;
end $$;

drop policy if exists nrs_invoice_lines_read on public.nrs_invoice_lines;
create policy nrs_invoice_lines_read on public.nrs_invoice_lines for select to authenticated
  using (exists (select 1 from public.nrs_invoices i where i.id = invoice_id
                 and public.nrs_in_my_org(i.org_id) and (public.nrs_can_see_member(i.member_id) or public.nrs_is_finance())));

-- Approval engine.
drop policy if exists nrs_requests_read on public.nrs_requests;
create policy nrs_requests_read on public.nrs_requests for select to authenticated
  using (public.nrs_in_my_org(org_id) and public.nrs_can_see_request(id));
drop policy if exists nrs_request_steps_read on public.nrs_request_steps;
create policy nrs_request_steps_read on public.nrs_request_steps for select to authenticated
  using (public.nrs_in_my_org(org_id) and public.nrs_can_see_request(request_id));
drop policy if exists nrs_delegations_read on public.nrs_delegations;
create policy nrs_delegations_read on public.nrs_delegations for select to authenticated
  using (public.nrs_in_my_org(org_id) and (member_id = public.nrs_me() or delegate_member_id = public.nrs_me() or public.nrs_is_hr()));
drop policy if exists nrs_delegations_own_write on public.nrs_delegations;
create policy nrs_delegations_own_write on public.nrs_delegations for all to authenticated
  using (public.nrs_in_my_org(org_id) and (member_id = public.nrs_me() or public.nrs_is_hr()))
  with check (public.nrs_in_my_org(org_id) and (member_id = public.nrs_me() or public.nrs_is_hr())
              and exists (select 1 from public.nrs_members a join public.nrs_members b on b.org_id = a.org_id
                          where a.id = nrs_delegations.member_id and b.id = nrs_delegations.delegate_member_id
                            and a.org_id = nrs_delegations.org_id));

-- Projects: readable by the org (status is shared work), updates by owner/members/managers/HR.
drop policy if exists nrs_projects_read on public.nrs_projects;
create policy nrs_projects_read on public.nrs_projects for select to authenticated using (public.nrs_in_my_org(org_id));
drop policy if exists nrs_projects_write on public.nrs_projects;
create policy nrs_projects_write on public.nrs_projects for all to authenticated
  using (public.nrs_in_my_org(org_id) and (owner_member_id = public.nrs_me() or public.nrs_manages(owner_member_id) or public.nrs_is_hr()))
  with check (public.nrs_in_my_org(org_id) and (owner_member_id = public.nrs_me() or public.nrs_manages(owner_member_id) or public.nrs_is_hr()));
drop policy if exists nrs_project_members_read on public.nrs_project_members;
create policy nrs_project_members_read on public.nrs_project_members for select to authenticated
  using (exists (select 1 from public.nrs_projects p where p.id = project_id and public.nrs_in_my_org(p.org_id)));
drop policy if exists nrs_project_updates_read on public.nrs_project_updates;
create policy nrs_project_updates_read on public.nrs_project_updates for select to authenticated
  using (public.nrs_in_my_org(org_id) and (public.nrs_can_see_member(member_id)
         or exists (select 1 from public.nrs_projects p where p.id = project_id and (p.owner_member_id = public.nrs_me() or public.nrs_manages(p.owner_member_id)))
         or help_needed_member_id = public.nrs_me()));
drop policy if exists nrs_project_updates_own_insert on public.nrs_project_updates;
create policy nrs_project_updates_own_insert on public.nrs_project_updates for insert to authenticated
  with check (public.nrs_in_my_org(org_id) and member_id = public.nrs_me() and public.nrs_feature_on('projects'));
drop policy if exists nrs_project_updates_own_update on public.nrs_project_updates;
create policy nrs_project_updates_own_update on public.nrs_project_updates for update to authenticated
  using (member_id = public.nrs_me())
  with check (member_id = public.nrs_me() and public.nrs_in_my_org(org_id)
              and exists (select 1 from public.nrs_projects p where p.id = nrs_project_updates.project_id
                          and p.org_id = nrs_project_updates.org_id));

-- Library: published versions visible to the audience in the member's country (or global).
drop policy if exists nrs_documents_read on public.nrs_documents;
create policy nrs_documents_read on public.nrs_documents for select to authenticated
  using (public.nrs_in_my_org(org_id) and archived_at is null and (
    public.nrs_is_hr() or country_code is null
    or country_code = (select m.home_country from public.nrs_members m where m.id = public.nrs_me())));
drop policy if exists nrs_documents_hr_write on public.nrs_documents;
create policy nrs_documents_hr_write on public.nrs_documents for all to authenticated
  using (public.nrs_in_my_org(org_id) and public.nrs_is_hr()) with check (public.nrs_in_my_org(org_id) and public.nrs_is_hr());
drop policy if exists nrs_document_versions_read on public.nrs_document_versions;
create policy nrs_document_versions_read on public.nrs_document_versions for select to authenticated
  using (public.nrs_in_my_org(org_id) and (public.nrs_is_hr() or (published_at is not null and exists (
    select 1 from public.nrs_documents d where d.id = document_id and d.archived_at is null and (
      d.country_code is null or d.country_code = (select m.home_country from public.nrs_members m where m.id = public.nrs_me()))))));
drop policy if exists nrs_document_versions_hr_write on public.nrs_document_versions;
create policy nrs_document_versions_hr_write on public.nrs_document_versions for all to authenticated
  using (public.nrs_in_my_org(org_id) and public.nrs_is_hr()) with check (public.nrs_in_my_org(org_id) and public.nrs_is_hr());
drop policy if exists nrs_ack_read on public.nrs_acknowledgements;
create policy nrs_ack_read on public.nrs_acknowledgements for select to authenticated
  using (public.nrs_in_my_org(org_id) and public.nrs_can_see_member(member_id));
drop policy if exists nrs_ack_own_insert on public.nrs_acknowledgements;
create policy nrs_ack_own_insert on public.nrs_acknowledgements for insert to authenticated
  with check (public.nrs_in_my_org(org_id) and member_id = public.nrs_me());

-- JOE progress: member writes own.
drop policy if exists nrs_joe_progress_own_write on public.nrs_joe_progress;
create policy nrs_joe_progress_own_write on public.nrs_joe_progress for insert to authenticated
  with check (public.nrs_in_my_org(org_id) and member_id = public.nrs_me());

-- Work log: member inserts own check-in; check-out update on own open log.
drop policy if exists nrs_work_logs_own_insert on public.nrs_work_logs;
create policy nrs_work_logs_own_insert on public.nrs_work_logs for insert to authenticated
  with check (public.nrs_in_my_org(org_id) and member_id = public.nrs_me() and source = 'app' and public.nrs_feature_on('time'));
drop policy if exists nrs_work_logs_own_checkout on public.nrs_work_logs;
create policy nrs_work_logs_own_checkout on public.nrs_work_logs for update to authenticated
  using (member_id = public.nrs_me() and check_out_at is null and source = 'app')
  with check (member_id = public.nrs_me() and source = 'app');

-- Member-client (non service role) writes can't backdate or edit a log:
-- a check-in is stamped now() on the server clock, and the only update a
-- member may make is closing their open log, stamped now().
create or replace function public.nrs_work_logs_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;  -- service role (corrections, imports, demo seed)
  end if;
  if tg_op = 'INSERT' then
    new.check_in_at := now();
    new.check_out_at := null;
    new.day := (now() at time zone new.timezone)::date;
    new.is_demo := false;
    return new;
  end if;
  if new.org_id is distinct from old.org_id or new.member_id is distinct from old.member_id
     or new.day is distinct from old.day or new.check_in_at is distinct from old.check_in_at
     or new.timezone is distinct from old.timezone or new.mode is distinct from old.mode
     or new.city is distinct from old.city or new.country_code is distinct from old.country_code
     or new.lat is distinct from old.lat or new.lng is distinct from old.lng
     or new.location_shared is distinct from old.location_shared or new.is_travel is distinct from old.is_travel
     or new.source is distinct from old.source or new.is_demo is distinct from old.is_demo then
    raise exception 'Only check-out can be recorded on a work log';
  end if;
  if old.check_out_at is null and new.check_out_at is not null then
    new.check_out_at := now();
  end if;
  return new;
end; $$;

drop trigger if exists nrs_work_logs_guard on public.nrs_work_logs;
create trigger nrs_work_logs_guard before insert or update on public.nrs_work_logs
for each row execute function public.nrs_work_logs_guard();

-- Feed.
drop policy if exists nrs_posts_read on public.nrs_posts;
create policy nrs_posts_read on public.nrs_posts for select to authenticated
  using (public.nrs_in_my_org(org_id) and deleted_at is null and (published_at is not null or public.nrs_is_hr()));
drop policy if exists nrs_posts_hr_write on public.nrs_posts;
create policy nrs_posts_hr_write on public.nrs_posts for all to authenticated
  using (public.nrs_in_my_org(org_id) and public.nrs_is_hr()) with check (public.nrs_in_my_org(org_id) and public.nrs_is_hr());
drop policy if exists nrs_post_comments_read on public.nrs_post_comments;
create policy nrs_post_comments_read on public.nrs_post_comments for select to authenticated
  using (public.nrs_in_my_org(org_id) and deleted_at is null);
drop policy if exists nrs_post_comments_own on public.nrs_post_comments;
create policy nrs_post_comments_own on public.nrs_post_comments for insert to authenticated
  with check (public.nrs_in_my_org(org_id) and member_id = public.nrs_me());
drop policy if exists nrs_post_reactions_read on public.nrs_post_reactions;
create policy nrs_post_reactions_read on public.nrs_post_reactions for select to authenticated using (public.nrs_in_my_org(org_id));
drop policy if exists nrs_post_reactions_own on public.nrs_post_reactions;
create policy nrs_post_reactions_own on public.nrs_post_reactions for all to authenticated
  using (member_id = public.nrs_me()) with check (public.nrs_in_my_org(org_id) and member_id = public.nrs_me());
drop policy if exists nrs_kudos_read on public.nrs_kudos;
create policy nrs_kudos_read on public.nrs_kudos for select to authenticated using (public.nrs_in_my_org(org_id));
drop policy if exists nrs_kudos_own on public.nrs_kudos;
create policy nrs_kudos_own on public.nrs_kudos for insert to authenticated
  with check (public.nrs_in_my_org(org_id) and from_member_id = public.nrs_me());

-- Help.
drop policy if exists nrs_tickets_read on public.nrs_tickets;
create policy nrs_tickets_read on public.nrs_tickets for select to authenticated
  using (public.nrs_in_my_org(org_id) and (member_id = public.nrs_me() or assignee_member_id = public.nrs_me() or public.nrs_is_hr()));
drop policy if exists nrs_tickets_own_insert on public.nrs_tickets;
create policy nrs_tickets_own_insert on public.nrs_tickets for insert to authenticated
  with check (public.nrs_in_my_org(org_id) and member_id = public.nrs_me() and public.nrs_feature_on('help'));
drop policy if exists nrs_ticket_messages_read on public.nrs_ticket_messages;
create policy nrs_ticket_messages_read on public.nrs_ticket_messages for select to authenticated
  using (exists (select 1 from public.nrs_tickets t where t.id = ticket_id and public.nrs_in_my_org(t.org_id)
                 and (t.member_id = public.nrs_me() or t.assignee_member_id = public.nrs_me() or public.nrs_is_hr())));
drop policy if exists nrs_ticket_messages_insert on public.nrs_ticket_messages;
create policy nrs_ticket_messages_insert on public.nrs_ticket_messages for insert to authenticated
  with check (member_id = public.nrs_me() and exists (select 1 from public.nrs_tickets t where t.id = ticket_id
              and t.org_id = nrs_ticket_messages.org_id and public.nrs_in_my_org(t.org_id)
              and (t.member_id = public.nrs_me() or t.assignee_member_id = public.nrs_me() or public.nrs_is_hr())));
drop policy if exists nrs_assets_read on public.nrs_assets;
create policy nrs_assets_read on public.nrs_assets for select to authenticated
  using (public.nrs_in_my_org(org_id) and (assigned_member_id = public.nrs_me() or public.nrs_is_hr()));
drop policy if exists nrs_assets_hr_write on public.nrs_assets;
create policy nrs_assets_hr_write on public.nrs_assets for all to authenticated
  using (public.nrs_in_my_org(org_id) and public.nrs_is_hr()) with check (public.nrs_in_my_org(org_id) and public.nrs_is_hr());

-- Audit: HR/super admin read only; inserts come from triggers / service role.
drop policy if exists nrs_audit_read on public.nrs_audit_events;
create policy nrs_audit_read on public.nrs_audit_events for select to authenticated
  using (public.nrs_in_my_org(org_id) and public.nrs_has_role('super_admin'));

-- Jobs: HR can see their org's jobs (integration health). Writes: service role only.
drop policy if exists nrs_jobs_read on public.nrs_jobs;
create policy nrs_jobs_read on public.nrs_jobs for select to authenticated
  using (public.nrs_in_my_org(org_id) and public.nrs_is_hr());

-- Push subscriptions: own only.
drop policy if exists nrs_push_own on public.nrs_push_subscriptions;
create policy nrs_push_own on public.nrs_push_subscriptions for all to authenticated
  using (member_id = public.nrs_me()) with check (member_id = public.nrs_me() and public.nrs_in_my_org(org_id));

-- Google tokens: never readable from the client (no policy) -> service role only.

-- ---------------------------------------------------------------------------
-- 12. Private storage bucket (served only via short-lived signed URLs from the server)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nrs-private', 'nrs-private', false, 15728640,
        array['application/pdf','image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- No storage.objects policies for this bucket: only the service role reads/writes it.
