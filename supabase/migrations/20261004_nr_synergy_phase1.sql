-- NR Synergy Phase 1: support desk, projects v2 (approval + immutable weekly updates),
-- travel desk, extra roles, assets. Safe to run more than once.

-- 1. New roles: travel desk, IT agent, HR agent ------------------------------------------
alter table public.nrs_member_roles drop constraint if exists nrs_member_roles_role_check;
alter table public.nrs_member_roles add constraint nrs_member_roles_role_check
  check (role in ('employee','manager','hr_admin','finance','super_admin','travel_desk','it_agent','hr_agent'));

alter table public.nrs_request_steps drop constraint if exists nrs_request_steps_approver_role_check;
alter table public.nrs_request_steps add constraint nrs_request_steps_approver_role_check
  check (approver_role in ('hr_admin','finance','super_admin','travel_desk'));

-- 2. Approval engine: new request kind "project" ---------------------------------------
alter table public.nrs_approval_chains drop constraint if exists nrs_approval_chains_kind_check;
alter table public.nrs_approval_chains add constraint nrs_approval_chains_kind_check
  check (kind in ('leave','correction','expense','travel','invoice','project'));
alter table public.nrs_requests drop constraint if exists nrs_requests_kind_check;
alter table public.nrs_requests add constraint nrs_requests_kind_check
  check (kind in ('leave','correction','expense','travel','invoice','project'));

-- 3. Projects v2 -------------------------------------------------------------------------
alter table public.nrs_projects add column if not exists description text;
alter table public.nrs_projects add column if not exists value_minor bigint check (value_minor is null or value_minor >= 0);
alter table public.nrs_projects add column if not exists value_currency text;
alter table public.nrs_projects add column if not exists next_steps text;
alter table public.nrs_projects add column if not exists approval_status text not null default 'pending';
alter table public.nrs_projects add column if not exists created_by_member uuid references public.nrs_members(id) on delete set null;
alter table public.nrs_projects add column if not exists tags text[] not null default '{}';
alter table public.nrs_projects add column if not exists country_code text;
alter table public.nrs_projects add column if not exists approved_at timestamptz;

alter table public.nrs_projects drop constraint if exists nrs_projects_approval_status_check;
alter table public.nrs_projects add constraint nrs_projects_approval_status_check
  check (approval_status in ('pending','approved','rejected','sent_back'));

-- status: In progress / Completed / On hold / Pending
alter table public.nrs_projects drop constraint if exists nrs_projects_status_check;
update public.nrs_projects set status = case status
    when 'on_track' then 'in_progress' when 'at_risk' then 'in_progress'
    when 'blocked' then 'on_hold' else status end
  where status in ('on_track','at_risk','blocked');
alter table public.nrs_projects alter column status set default 'pending';
alter table public.nrs_projects add constraint nrs_projects_status_check
  check (status in ('in_progress','completed','on_hold','pending'));

-- projects that existed before this change (demo data) count as approved
update public.nrs_projects set approval_status = 'approved', approved_at = coalesce(approved_at, created_at)
  where approval_status = 'pending' and created_at < now() - interval '1 minute';

alter table public.nrs_project_updates drop constraint if exists nrs_project_updates_status_check;
update public.nrs_project_updates set status = case status
    when 'on_track' then 'in_progress' when 'at_risk' then 'in_progress'
    when 'blocked' then 'on_hold' else status end
  where status in ('on_track','at_risk','blocked');
alter table public.nrs_project_updates add constraint nrs_project_updates_status_check
  check (status in ('in_progress','completed','on_hold','pending'));
alter table public.nrs_project_updates add column if not exists next_steps text;
-- more than one update per week is allowed; each is time-stamped by the server
alter table public.nrs_project_updates drop constraint if exists nrs_project_updates_project_id_member_id_week_of_key;

-- weekly updates: server time stamp, never editable; only demo rows may be deleted (demo wipe)
-- security definer so the parent lookup isn't hidden by the caller's RLS
-- (a hidden parent would otherwise look like a cascade and allow the delete)
create or replace function public.nrs_project_updates_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  parent_demo boolean;
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.is_demo then return old; end if;
    -- demo projects can always be wiped; when the parent row is already gone
    -- this delete is the on-delete-cascade from removing the project itself
    select p.is_demo into parent_demo from public.nrs_projects p where p.id = old.project_id;
    if not found or parent_demo then return old; end if;
    raise exception 'Project updates cannot be deleted';
  end if;
  raise exception 'Project updates cannot be edited';
end; $$;
drop trigger if exists nrs_project_updates_guard on public.nrs_project_updates;
create trigger nrs_project_updates_guard before insert or update or delete on public.nrs_project_updates
for each row execute function public.nrs_project_updates_guard();
drop policy if exists nrs_project_updates_own_update on public.nrs_project_updates;

-- members may read projects that are approved, or that they created/own (pending ones)
drop policy if exists nrs_projects_read on public.nrs_projects;
create policy nrs_projects_read on public.nrs_projects for select to authenticated
  using (public.nrs_in_my_org(org_id) and (
    approval_status = 'approved'
    or owner_member_id = public.nrs_me() or created_by_member = public.nrs_me()
    or public.nrs_manages(owner_member_id) or public.nrs_is_hr()));
-- writes to projects go through server routes (approval flow); remove direct client writes
drop policy if exists nrs_projects_write on public.nrs_projects;

create index if not exists nrs_projects_org_approval_idx on public.nrs_projects(org_id, approval_status);
create index if not exists nrs_project_updates_project_idx on public.nrs_project_updates(project_id, created_at desc);

-- 4. Travel desk -------------------------------------------------------------------------
alter table public.nrs_travel_requests drop constraint if exists nrs_travel_requests_status_check;
alter table public.nrs_travel_requests add constraint nrs_travel_requests_status_check
  check (status in ('pending','approved','rejected','cancelled','sent_back','booked'));
alter table public.nrs_travel_requests add column if not exists booked_by_member uuid references public.nrs_members(id) on delete set null;
alter table public.nrs_travel_requests add column if not exists booked_at timestamptz;

-- 5. Support desk ------------------------------------------------------------------------
alter table public.nrs_tickets add column if not exists priority text not null default 'normal';
alter table public.nrs_tickets drop constraint if exists nrs_tickets_priority_check;
alter table public.nrs_tickets add constraint nrs_tickets_priority_check check (priority in ('low','normal','high','urgent'));
alter table public.nrs_tickets drop constraint if exists nrs_tickets_status_check;
alter table public.nrs_tickets add constraint nrs_tickets_status_check
  check (status in ('open','in_progress','waiting','resolved','closed'));
alter table public.nrs_tickets add column if not exists updated_at timestamptz not null default now();
create index if not exists nrs_tickets_org_status_idx on public.nrs_tickets(org_id, status, category);

-- agents (IT agent for IT tickets, HR agent for HR/payroll/admin) can read tickets in their queue
create or replace function public.nrs_is_ticket_agent(cat text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.nrs_is_hr()
      or (cat = 'it' and public.nrs_has_role('it_agent'))
      or (cat in ('hr','payroll','admin') and public.nrs_has_role('hr_agent'));
$$;
revoke execute on function public.nrs_is_ticket_agent(text) from public, anon;
grant execute on function public.nrs_is_ticket_agent(text) to authenticated;

drop policy if exists nrs_tickets_read on public.nrs_tickets;
create policy nrs_tickets_read on public.nrs_tickets for select to authenticated
  using (public.nrs_in_my_org(org_id) and (member_id = public.nrs_me() or assignee_member_id = public.nrs_me()
         or public.nrs_is_ticket_agent(category)));
drop policy if exists nrs_ticket_messages_read on public.nrs_ticket_messages;
create policy nrs_ticket_messages_read on public.nrs_ticket_messages for select to authenticated
  using (exists (select 1 from public.nrs_tickets t where t.id = ticket_id and public.nrs_in_my_org(t.org_id)
                 and (t.member_id = public.nrs_me() or t.assignee_member_id = public.nrs_me()
                      or public.nrs_is_ticket_agent(t.category))));
drop policy if exists nrs_ticket_messages_insert on public.nrs_ticket_messages;
create policy nrs_ticket_messages_insert on public.nrs_ticket_messages for insert to authenticated
  with check (member_id = public.nrs_me() and exists (select 1 from public.nrs_tickets t where t.id = ticket_id
              and t.org_id = nrs_ticket_messages.org_id and public.nrs_in_my_org(t.org_id)
              and (t.member_id = public.nrs_me() or t.assignee_member_id = public.nrs_me()
                   or public.nrs_is_ticket_agent(t.category))));
alter table public.nrs_ticket_messages add column if not exists internal boolean not null default false;

-- internal notes: only agents can read or write them (requesters see public replies only)
drop policy if exists nrs_ticket_messages_read on public.nrs_ticket_messages;
create policy nrs_ticket_messages_read on public.nrs_ticket_messages for select to authenticated
  using (exists (select 1 from public.nrs_tickets t where t.id = ticket_id and public.nrs_in_my_org(t.org_id)
                 and (public.nrs_is_ticket_agent(t.category)
                      or (not internal and (t.member_id = public.nrs_me() or t.assignee_member_id = public.nrs_me())))));
drop policy if exists nrs_ticket_messages_insert on public.nrs_ticket_messages;
create policy nrs_ticket_messages_insert on public.nrs_ticket_messages for insert to authenticated
  with check (member_id = public.nrs_me() and exists (select 1 from public.nrs_tickets t where t.id = ticket_id
              and t.org_id = nrs_ticket_messages.org_id and public.nrs_in_my_org(t.org_id)
              and (public.nrs_is_ticket_agent(t.category)
                   or (not internal and (t.member_id = public.nrs_me() or t.assignee_member_id = public.nrs_me())))));

-- 6. Assets: allow notes and returned date ------------------------------------------------
alter table public.nrs_assets add column if not exists notes text;
alter table public.nrs_assets add column if not exists returned_on date;
alter table public.nrs_assets add column if not exists updated_at timestamptz not null default now();

-- 7. Default approval chains for the new flows (only if the org has none for that kind) ----
insert into public.nrs_approval_chains (org_id, kind, steps, applies_to, effective_from)
select o.id, 'project', '[{"type":"manager"}]'::jsonb, 'all', current_date
from public.organizations o
where exists (select 1 from public.nrs_members m where m.org_id = o.id)
  and not exists (select 1 from public.nrs_approval_chains c where c.org_id = o.id and c.kind = 'project')
on conflict do nothing;

-- travel: manager, then travel desk, then finance above 1,000.00 (new chain effective today)
insert into public.nrs_approval_chains (org_id, kind, steps, applies_to, effective_from)
select o.id, 'travel',
  '[{"type":"manager"},{"type":"role","role":"travel_desk"},{"type":"role","role":"finance","when":{"amount_minor_gt":100000}}]'::jsonb,
  'all', current_date
from public.organizations o
where exists (select 1 from public.nrs_members m where m.org_id = o.id)
on conflict (org_id, kind, applies_to, effective_from) do update set steps = excluded.steps;

-- 8. Hardening (from earlier review): signed-out users cannot call nrs_ helpers -------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'nrs\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

select 'phase1 ok' as status,
  (select count(*) from public.nrs_approval_chains where kind in ('project','travel')) as chains;
