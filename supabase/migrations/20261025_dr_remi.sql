-- Dr.Remi.ai -- multilingual 24/7 voice sales assistant (Personal Tools).
-- Additive only. Multi-tenant: every row belongs to a remi_workspace, and
-- every API route checks remi_members before touching it. RLS is ON for
-- every table; members get read-only SELECT policies as defence in depth,
-- all writes go through server routes using the service-role client.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------- workspaces
create table if not exists public.remi_workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 120),
  assistant_name text not null default 'Dr.Remi',
  tagline text not null default 'AI powered sales partner',
  industry text,
  about text,
  greeting text,
  default_language text not null default 'auto',
  pricing_mode text not null default 'range' check (pricing_mode in ('range', 'exact', 'hidden')),
  handoff_message text,
  consent_text text,
  notify_emails text[] not null default '{}',
  webhook_url text,
  webhook_secret text,
  voice text not null default 'sage',
  kiosk_idle_seconds int not null default 90 check (kiosk_idle_seconds between 30 and 900),
  suggested_questions text[] not null default '{}',
  active boolean not null default true,
  org_id uuid null references public.organizations(id) on delete set null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.remi_members (
  workspace_id uuid not null references public.remi_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'rep', 'viewer')),
  email text,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists remi_members_user on public.remi_members (user_id);

create table if not exists public.remi_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.remi_workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'rep', 'viewer')),
  invited_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);
create index if not exists remi_invites_email on public.remi_invites (lower(email));

-- ---------------------------------------------------------------- brains
create table if not exists public.remi_brains (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.remi_workspaces(id) on delete cascade,
  kind text not null check (kind in ('document', 'research', 'weblink', 'note', 'faq', 'pitch', 'competitor')),
  title text not null,
  source_url text,
  file_name text,
  storage_path text,
  mime text,
  content_text text,
  summary text,
  evidence_type text check (evidence_type is null or evidence_type in
    ('peer_reviewed', 'field_trial', 'in_house', 'regulatory', 'technical', 'testimonial', 'marketing', 'other')),
  visibility text not null default 'public' check (visibility in ('public', 'internal')),
  status text not null default 'processing' check (status in ('processing', 'draft', 'approved', 'archived', 'failed')),
  countries text[] not null default '{}',
  species text[] not null default '{}',
  tags text[] not null default '{}',
  priority int not null default 0,
  expires_at date,
  error text,
  chunk_count int not null default 0,
  char_count int not null default 0,
  version int not null default 1,
  last_synced_at timestamptz,
  created_by uuid null references auth.users(id) on delete set null,
  approved_by uuid null references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists remi_brains_ws on public.remi_brains (workspace_id, status);

create table if not exists public.remi_chunks (
  id bigint generated always as identity primary key,
  brain_id uuid not null references public.remi_brains(id) on delete cascade,
  workspace_id uuid not null references public.remi_workspaces(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding extensions.vector(1536),
  tsv tsvector generated always as (to_tsvector('simple', content)) stored
);
create index if not exists remi_chunks_ws on public.remi_chunks (workspace_id);
create index if not exists remi_chunks_brain on public.remi_chunks (brain_id);
create index if not exists remi_chunks_tsv on public.remi_chunks using gin (tsv);
create index if not exists remi_chunks_embedding on public.remi_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------- products
create table if not exists public.remi_products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.remi_workspaces(id) on delete cascade,
  name text not null,
  sku text,
  category text,
  summary text,
  key_benefits text[] not null default '{}',
  species text[] not null default '{}',
  applications text[] not null default '{}',
  dosage text,
  pack_sizes text,
  price_min numeric(14, 2),
  price_max numeric(14, 2),
  currency text not null default 'INR',
  price_unit text,
  countries text[] not null default '{}',
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists remi_products_ws on public.remi_products (workspace_id, active);

-- ---------------------------------------------------------------- conversations
create table if not exists public.remi_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.remi_workspaces(id) on delete cascade,
  token_hash text not null unique,
  channel text not null default 'web' check (channel in ('web', 'kiosk', 'qr', 'test', 'embed')),
  language text,
  ip_hash text,
  user_agent text,
  turn_count int not null default 0,
  consent boolean not null default false,
  consent_at timestamptz,
  lead_id uuid,
  summary text,
  emailed_at timestamptz,
  started_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists remi_sessions_ws on public.remi_sessions (workspace_id, started_at desc);

create table if not exists public.remi_messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.remi_sessions(id) on delete cascade,
  workspace_id uuid not null references public.remi_workspaces(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  language text,
  topic text,
  source_ids uuid[] not null default '{}',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists remi_messages_session on public.remi_messages (session_id, id);
create index if not exists remi_messages_ws on public.remi_messages (workspace_id, created_at desc);

-- ---------------------------------------------------------------- leads
create table if not exists public.remi_leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.remi_workspaces(id) on delete cascade,
  session_id uuid null references public.remi_sessions(id) on delete set null,
  name text,
  company text,
  designation text,
  email text,
  phone text,
  location text,
  country text,
  preferred_language text,
  customer_type text,
  product_interests text[] not null default '{}',
  requirements text,
  current_solution text,
  challenges text,
  budget text,
  timeline text,
  purchase_authority text,
  score int not null default 0 check (score between 0 and 100),
  tier text not null default 'cold' check (tier in ('hot', 'warm', 'cold')),
  intent_signals jsonb not null default '{}'::jsonb,
  objections text[] not null default '{}',
  next_best_action text,
  summary text,
  consent boolean not null default false,
  consent_at timestamptz,
  consent_text text,
  callback_requested boolean not null default false,
  callback_time text,
  status text not null default 'new' check (status in ('new', 'contacted', 'meeting', 'quoted', 'won', 'lost')),
  deal_value numeric(14, 2),
  assigned_to uuid null references auth.users(id) on delete set null,
  follow_up_at timestamptz,
  notes text,
  notified_at timestamptz,
  channel text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists remi_leads_ws on public.remi_leads (workspace_id, created_at desc);
create index if not exists remi_leads_followup on public.remi_leads (workspace_id, follow_up_at);

create table if not exists public.remi_lead_events (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.remi_leads(id) on delete cascade,
  workspace_id uuid not null references public.remi_workspaces(id) on delete cascade,
  actor uuid null references auth.users(id) on delete set null,
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists remi_lead_events_lead on public.remi_lead_events (lead_id, created_at);

-- Questions the assistant could not answer from the Brains -> improvement queue.
create table if not exists public.remi_gaps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.remi_workspaces(id) on delete cascade,
  session_id uuid null references public.remi_sessions(id) on delete set null,
  question text not null,
  language text,
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  created_at timestamptz not null default now()
);
create index if not exists remi_gaps_ws on public.remi_gaps (workspace_id, status, created_at desc);

-- Possible adverse-event / product-complaint reports (pharmacovigilance).
create table if not exists public.remi_safety_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.remi_workspaces(id) on delete cascade,
  session_id uuid null references public.remi_sessions(id) on delete set null,
  lead_id uuid null references public.remi_leads(id) on delete set null,
  description text not null,
  product text,
  language text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'closed')),
  created_at timestamptz not null default now()
);

-- Usage log (rate limiting + cost visibility). No conversation content.
create table if not exists public.remi_usage (
  id bigint generated always as identity primary key,
  workspace_id uuid null references public.remi_workspaces(id) on delete cascade,
  ip_hash text not null,
  kind text not null check (kind in ('turn', 'stt', 'tts', 'embed', 'session')),
  created_at timestamptz not null default now()
);
create index if not exists remi_usage_ip on public.remi_usage (ip_hash, kind, created_at desc);
create index if not exists remi_usage_ws on public.remi_usage (workspace_id, created_at desc);

create table if not exists public.remi_audit (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.remi_workspaces(id) on delete cascade,
  actor uuid null references auth.users(id) on delete set null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists remi_audit_ws on public.remi_audit (workspace_id, created_at desc);

-- ---------------------------------------------------------------- RLS
create or replace function public.remi_is_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.remi_members m where m.workspace_id = ws and m.user_id = auth.uid());
$$;
revoke all on function public.remi_is_member(uuid) from public, anon;
grant execute on function public.remi_is_member(uuid) to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'remi_workspaces','remi_members','remi_invites','remi_brains','remi_chunks','remi_products',
    'remi_sessions','remi_messages','remi_leads','remi_lead_events','remi_gaps','remi_safety_reports',
    'remi_usage','remi_audit'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

drop policy if exists remi_ws_member_read on public.remi_workspaces;
create policy remi_ws_member_read on public.remi_workspaces for select to authenticated using (public.remi_is_member(id));

do $$
declare t text;
begin
  foreach t in array array[
    'remi_members','remi_brains','remi_products','remi_sessions','remi_messages','remi_leads',
    'remi_lead_events','remi_gaps','remi_safety_reports'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_member_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.remi_is_member(workspace_id))', t || '_member_read', t);
  end loop;
end $$;
-- remi_chunks, remi_invites, remi_usage, remi_audit: service-role only.

-- ---------------------------------------------------------------- retrieval
-- Hybrid search: cosine similarity on multilingual embeddings, plus a small
-- keyword boost (product names, SKUs, numbers). Only approved, unexpired
-- Brains are ever returned. Service-role only.
create or replace function public.remi_match_chunks(
  p_workspace uuid,
  p_embedding extensions.vector(1536),
  p_query text,
  p_k int default 8
)
returns table (
  chunk_id bigint,
  brain_id uuid,
  title text,
  kind text,
  evidence_type text,
  visibility text,
  source_url text,
  content text,
  score double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select c.id, b.id, b.title, b.kind, b.evidence_type, b.visibility, b.source_url, c.content,
         (1 - (c.embedding <=> p_embedding))
           + case when p_query is not null and p_query <> ''
                       and c.tsv @@ plainto_tsquery('simple', p_query) then 0.08 else 0 end
           + least(b.priority, 5) * 0.01 as score
  from public.remi_chunks c
  join public.remi_brains b on b.id = c.brain_id
  where c.workspace_id = p_workspace
    and b.workspace_id = p_workspace
    and b.status = 'approved'
    and (b.expires_at is null or b.expires_at >= current_date)
    and c.embedding is not null
  order by score desc
  limit greatest(1, least(p_k, 20));
$$;
revoke all on function public.remi_match_chunks(uuid, extensions.vector, text, int) from public, anon, authenticated;
grant execute on function public.remi_match_chunks(uuid, extensions.vector, text, int) to service_role;

-- Private bucket for uploaded Brain files (service-role access only).
insert into storage.buckets (id, name, public)
values ('remi-brains', 'remi-brains', false)
on conflict (id) do nothing;
