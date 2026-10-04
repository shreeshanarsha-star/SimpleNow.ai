# NR Synergy — Release runbook (for Antigravity)

Owner: Shree. Prepared by Claude. Run top to bottom. Stop and report if any step fails.

## Rules
- Supabase project: **askshree-app-v2** (ref `jdjzbaxpoghqnfdnesub`). Production.
- Apply ONLY the files listed under "This release". Never re-run older migration files
  (especially `20261003_nr_synergy_foundation.sql` — re-running it resets access rules).
- Do not run `supabase db push`, `db reset`, or any DROP TABLE. Do not touch `.env`.

## This release — "Projects: table + weekly update approval" (DATABASE FIRST)
1. Database: Shree runs supabase/migrations/20261004d_nr_synergy_weekly_update_approval.sql once in the
   Supabase SQL editor (project jdjzbaxpoghqnfdnesub). Expected last row: "weekly update approval ok".
   Do not continue until Shree confirms that row. Do not run any other migration file.
2. Code: on branch `feature/nrs-ask`, commit all working-tree changes (including the deletion of
   src/app/tools/nr-synergy/projects/[id]/StatusRequestActions.tsx), run `npx tsc --noEmit -p .` and
   `npm run build` (both must pass), then merge `feature/nrs-ask` into `main` and push `main`.
3. Do not change .env or Vercel settings. Do not commit the _to_delete folder.
4. Report: the merge commit hash.

What it does: Projects becomes a table with three views (My projects / My team / All projects): each row has
Project, Description, Status, Weekly update, Challenges, Plan of action, last-8-weeks traction dots and Submit /
Approve. One submission per project per week. Approved projects start "In progress"; every weekly update goes to the manager for approval
(status and next steps apply only when approved); only admins can edit projects; owners use "Request a change"
(opens a prefilled Help ticket); admins can download all projects + weekly updates as Excel.

## Release log
| Date | Release | Database files | Code | Result |
|---|---|---|---|---|
| 2026-10-03 | Foundation | 20261003_nr_synergy_foundation.sql | PR #2 | done |
| 2026-10-03 | Search + Admin Console | — | PR #3 | done |
| 2026-10-04 | Phase 1 | 20261004_nr_synergy_phase1.sql | PR #4 | done |
| 2026-10-04 | Policy fix | 20261004b_nr_synergy_policy_fix.sql | — | done (verified by Claude) |
| 2026-10-04 | Projects permissions + Ask NR Synergy v2 | 20261004c_nr_synergy_projects_visibility.sql | feature/nrs-ask | done (verified by Claude: DB + deploy) |
| 2026-10-04 | Ask NR Synergy: AI fallback | — | feature/nrs-ask | done (verified live by Claude) |
| 2026-10-04 | Check-in pill + Payslips | — | feature/nrs-ask | done (live) |
| 2026-10-04 | Projects: table + weekly update approval | 20261004d_nr_synergy_weekly_update_approval.sql | feature/nrs-ask | pending |
