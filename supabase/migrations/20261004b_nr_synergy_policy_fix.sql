-- NR Synergy: restore Phase 1 access rules (the foundation file was re-run after Phase 1 and
-- put the old project/ticket policies back). Safe to run more than once.
drop policy if exists nrs_project_updates_own_update on public.nrs_project_updates;
drop policy if exists nrs_project_updates_own_insert on public.nrs_project_updates;
drop policy if exists nrs_projects_write on public.nrs_projects;
drop policy if exists nrs_projects_read on public.nrs_projects;
create policy nrs_projects_read on public.nrs_projects for select to authenticated
  using (public.nrs_in_my_org(org_id) and (approval_status = 'approved'
    or owner_member_id = public.nrs_me() or created_by_member = public.nrs_me()
    or public.nrs_manages(owner_member_id) or public.nrs_is_hr()));
drop policy if exists nrs_tickets_read on public.nrs_tickets;
create policy nrs_tickets_read on public.nrs_tickets for select to authenticated
  using (public.nrs_in_my_org(org_id) and (member_id = public.nrs_me() or assignee_member_id = public.nrs_me()
         or public.nrs_is_ticket_agent(category)));
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
select 'policies fixed' as status;
