# NR Synergy — Release runbook (for Antigravity)

Owner: Shree. Prepared by Claude. Run top to bottom. Stop and report if any step fails.

## Rules
- Supabase project: **askshree-app-v2** (ref `jdjzbaxpoghqnfdnesub`). Production.
- Apply ONLY the files listed under "This release". Never re-run older migration files
  (especially `20261003_nr_synergy_foundation.sql` — re-running it resets access rules).
- Do not run `supabase db push`, `db reset`, or any DROP TABLE. Do not touch `.env`.

## This release — "Projects permissions + Ask NR Synergy v2" (one release)
DATABASE FIRST — the new code reads new columns, so step 1 must succeed before step 2.

1. Database: apply ONLY this file to project jdjzbaxpoghqnfdnesub (Supabase SQL editor or `supabase db query`/psql
   with the project connection), run it ONCE:
   - supabase/migrations/20261004c_nr_synergy_projects_visibility.sql
   It is safe to re-run (if/exists guards). Expected last row: status = "projects visibility ok", policies = 3.
   Do NOT run any other migration file. No db push / db reset / DROP TABLE.
2. Code: commit all working-tree changes on a new branch `feature/nrs-ask` (if it doesn't exist yet; otherwise reuse it),
   run `npx tsc --noEmit -p .` and `npm run build` (both must pass), then merge `feature/nrs-ask` into `main`
   and push `main`. Vercel deploys automatically.
   Files in this release:
   - supabase/migrations/20261004c_nr_synergy_projects_visibility.sql (new — step 1)
   - Projects: src/app/api/nr-synergy/projects/{route.ts,_lib.ts,[id]/route.ts,updates/route.ts},
     src/app/tools/nr-synergy/projects/{page.tsx,_lib.ts,new/page.tsx,_components/ProjectForm.tsx,
     [id]/page.tsx,[id]/edit/page.tsx,[id]/ProjectUpdateForm.tsx,[id]/StatusRequestActions.tsx (new)},
     src/app/tools/nr-synergy/_home/NeedsYou.tsx, src/lib/nrs/i18n/en/projects.ts
   - Search / Ask: src/app/api/nr-synergy/search/ask/route.ts (new), src/app/api/nr-synergy/search/route.ts,
     src/lib/nrs/{ask.ts,ask.test.ts,search.ts,search.test.ts}, src/lib/nrs/i18n/en/search.ts,
     src/app/tools/nr-synergy/_components/GlobalSearch.tsx, src/app/tools/nr-synergy/knowledge/_lib.ts,
     src/app/tools/nr-synergy/layout.tsx, src/app/globals.css, src/components/Topbar.tsx
   - RELEASE.md, supabase/migrations/20261004b_nr_synergy_policy_fix.sql (already applied — commit only, do not run)
3. Do not change .env or Vercel settings.
4. Report: the SQL result row from step 1 and the merge commit hash.

What it does:
- Projects: the creator always owns the project (no owner picker for users); new projects start "Pending";
  users see only projects they own, started or are a team member of; managers see their team's; HR/admin see all
  (Owner/Division/Country filters only for them). Status is set by the manager/HR; users suggest a status in the
  weekly update and the manager approves or keeps the current one.
- Search: AI answers from company documents first (incl. text inside Library PDFs) and the user's OWN profile,
  contract and leave balance only — never anyone else's; web search only if nothing internal answers and the
  question isn't about pay/contracts/personal data. New raised search bar with mic and send button; it no longer
  covers the theme menu.

## Release log
| Date | Release | Database files | Code | Result |
|---|---|---|---|---|
| 2026-10-03 | Foundation | 20261003_nr_synergy_foundation.sql | PR #2 | done |
| 2026-10-03 | Search + Admin Console | — | PR #3 | done |
| 2026-10-04 | Phase 1 | 20261004_nr_synergy_phase1.sql | PR #4 | done |
| 2026-10-04 | Policy fix | 20261004b_nr_synergy_policy_fix.sql | — | done (verified by Claude) |
| 2026-10-04 | Projects permissions + Ask NR Synergy v2 | 20261004c_nr_synergy_projects_visibility.sql | feature/nrs-ask | pending |
