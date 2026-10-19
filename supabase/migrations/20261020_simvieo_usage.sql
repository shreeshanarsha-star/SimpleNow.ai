-- SimVieo: usage log for cost control and daily caps. Additive only.
-- No user content is stored here: just who (hashed IP / optional user id),
-- what kind of AI call, and its estimated cost in INR.
create table if not exists public.simvieo_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid null references auth.users(id) on delete set null,
  ip_hash text not null,
  kind text not null check (kind in ('plan', 'scene', 'voice')),
  cost_inr numeric(10, 4) not null default 0,
  source text not null default 'ai'
);

create index if not exists simvieo_usage_ip_kind_time on public.simvieo_usage (ip_hash, kind, created_at desc);
create index if not exists simvieo_usage_time on public.simvieo_usage (created_at desc);

-- Service-role only: RLS on, no policies => anon/authenticated get nothing.
alter table public.simvieo_usage enable row level security;

-- Today's total estimated spend (IST day), used as the global budget gate.
create or replace function public.simvieo_spend_today()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(cost_inr), 0)
  from public.simvieo_usage
  where created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
$$;

revoke all on function public.simvieo_spend_today() from public, anon, authenticated;
grant execute on function public.simvieo_spend_today() to service_role;
