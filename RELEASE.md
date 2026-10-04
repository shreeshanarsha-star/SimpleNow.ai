# NR Synergy — Release runbook (for Antigravity)

Owner: Shree. Prepared by Claude. Run top to bottom. Stop and report if any step fails.

## Rules
- Supabase project: **askshree-app-v2** (ref `jdjzbaxpoghqnfdnesub`). Production.
- Apply ONLY the files listed under "This release". Never re-run older migration files
  (especially `20261003_nr_synergy_foundation.sql` — re-running it resets access rules).
- Do not run `supabase db push`, `db reset`, or any DROP TABLE. Do not touch `.env`.

## This release — "Ask NR Synergy: AI fallback" (hotfix, code only)
1. Database: none.
2. Code: on branch `feature/nrs-ask`, commit the changed files below, run `npx tsc --noEmit -p .` and
   `npm run build` (both must pass), then merge `feature/nrs-ask` into `main` and push `main`. Vercel deploys automatically.
   Files:
   - src/app/api/nr-synergy/search/ask/route.ts
   - src/lib/nrs/ask.ts
   - RELEASE.md
3. Do not change .env or Vercel settings.
4. Report: the merge commit hash.

Why: the Anthropic key on Vercel is rejected ("not scoped to a workspace"), so AI answers failed. Ask now falls back
to OpenAI (already configured) and to Serper web results (already configured); it uses Claude again automatically
once a working Anthropic key is set.

## Release log
| Date | Release | Database files | Code | Result |
|---|---|---|---|---|
| 2026-10-03 | Foundation | 20261003_nr_synergy_foundation.sql | PR #2 | done |
| 2026-10-03 | Search + Admin Console | — | PR #3 | done |
| 2026-10-04 | Phase 1 | 20261004_nr_synergy_phase1.sql | PR #4 | done |
| 2026-10-04 | Policy fix | 20261004b_nr_synergy_policy_fix.sql | — | done (verified by Claude) |
| 2026-10-04 | Projects permissions + Ask NR Synergy v2 | 20261004c_nr_synergy_projects_visibility.sql | feature/nrs-ask | done (verified by Claude: DB + deploy) |
| 2026-10-04 | Ask NR Synergy: AI fallback | — | feature/nrs-ask | pending |
