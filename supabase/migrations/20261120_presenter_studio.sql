-- Presenter Studio: reusable shows (plan + live state), the audience who joined, and their answers.
create table if not exists presenter_shows (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  title text not null default 'Untitled presentation',
  event_date date,
  status text not null default 'draft',           -- draft | ready | live | done | archived
  code text unique,                                -- audience join code (/join/<code>)
  plan jsonb not null default '{}'::jsonb,
  live jsonb not null default '{}'::jsonb,
  legacy_session_id uuid,                          -- past events from the first Presenter (presenter_sessions)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists presenter_shows_owner on presenter_shows(owner_id, created_at desc);

create table if not exists presenter_show_people (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references presenter_shows(id) on delete cascade,
  token text not null,
  name text not null,
  team text,
  created_at timestamptz not null default now(),
  unique (show_id, token)
);

create table if not exists presenter_show_answers (
  id bigserial primary key,
  show_id uuid not null references presenter_shows(id) on delete cascade,
  person_id uuid references presenter_show_people(id) on delete cascade,
  kind text not null,                              -- poll | quiz | ask
  item text not null default '',                   -- poll key / quiz index / '' for questions
  choice integer,
  text text,
  ms integer,
  status text not null default 'new',              -- questions: new | drafted | answered | dismissed
  draft text,
  created_at timestamptz not null default now()
);
create index if not exists presenter_show_answers_show on presenter_show_answers(show_id, kind);
create unique index if not exists presenter_show_answers_once on presenter_show_answers(show_id, person_id, kind, item) where kind in ('poll', 'quiz');

alter table presenter_shows enable row level security;
alter table presenter_show_people enable row level security;
alter table presenter_show_answers enable row level security;
