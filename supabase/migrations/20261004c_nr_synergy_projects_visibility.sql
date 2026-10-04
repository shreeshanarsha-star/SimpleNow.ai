-- NR Synergy: project visibility + status control. Safe to run more than once.
--
-- Who sees a project:
--   * its owner, the person who started it, and its team members
--   * the owner's (or starter's) reporting manager
--   * HR / super admin (everything in the org)
-- Everyone else no longer sees other people's projects.
--
-- Status: members can't set it themselves. A weekly update may *suggest* a
-- new status; it is stored on the project as status_requested until the
-- owner's manager (or HR) approves or declines it.

-- 1. Status-change requests ------------------------------------------------------------------
alter table public.nrs_projects add column if not exists status_requested text;
alter table public.nrs_projects add column if not exists status_requested_by uuid references public.nrs_members(id) on delete set null;
alter table public.nrs_projects add column if not exists status_requested_at timestamptz;
alter table public.nrs_projects drop constraint if exists nrs_projects_status_requested_check;
alter table public.nrs_projects add constraint nrs_projects_status_requested_check
  check (status_requested is null or status_requested in ('in_progress','completed','on_hold','pending'));

-- a weekly update's status is a suggestion when the poster can't set status directly
alter table public.nrs_project_updates add column if not exists status_proposed boolean not null default false;

-- 2. Helper: is the caller on this project's team? -----------------------------------------
-- security definer so the nrs_projects policy can check membership without
-- recursing into the nrs_project_members policy (which looks at nrs_projects).
create or replace function public.nrs_on_project(p uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.nrs_project_members pm
                 where pm.project_id = p and pm.member_id = public.nrs_me());
$$;
revoke execute on function public.nrs_on_project(uuid) from public, anon;
grant execute on function public.nrs_on_project(uuid) to authenticated, service_role;

-- 3. Read policies ------------------------------------------------------------------------
drop policy if exists nrs_projects_read on public.nrs_projects;
create policy nrs_projects_read on public.nrs_projects for select to authenticated
  using (public.nrs_in_my_org(org_id) and (
    owner_member_id = public.nrs_me()
    or created_by_member = public.nrs_me()
    or public.nrs_on_project(id)
    or public.nrs_manages(owner_member_id)
    or (created_by_member is not null and public.nrs_manages(created_by_member))
    or public.nrs_is_hr()));

-- team lists and weekly updates follow the project's visibility
drop policy if exists nrs_project_members_read on public.nrs_project_members;
create policy nrs_project_members_read on public.nrs_project_members for select to authenticated
  using (exists (select 1 from public.nrs_projects p where p.id = project_id));

drop policy if exists nrs_project_updates_read on public.nrs_project_updates;
create policy nrs_project_updates_read on public.nrs_project_updates for select to authenticated
  using (public.nrs_in_my_org(org_id) and (
    exists (select 1 from public.nrs_projects p where p.id = project_id)
    or help_needed_member_id = public.nrs_me()));

create index if not exists nrs_project_members_member_idx on public.nrs_project_members(member_id);
create index if not exists nrs_projects_status_req_idx on public.nrs_projects(org_id) where status_requested is not null;

-- make the new columns visible to the API straight away
notify pgrst, 'reload schema';

select 'projects visibility ok' as status,
  (select count(*) from pg_policies where tablename in ('nrs_projects','nrs_project_members','nrs_project_updates')
     and policyname in ('nrs_projects_read','nrs_project_members_read','nrs_project_updates_read')) as policies;
