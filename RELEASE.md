# NR Synergy — Release runbook (for Antigravity)

Owner: Shree. Prepared by Claude. Run top to bottom. Stop and report if any step fails.

## Rules
- Supabase project: **askshree-app-v2** (ref `jdjzbaxpoghqnfdnesub`). Production.
- Apply ONLY the files listed under "This release". Never re-run older migration files
  (especially `20261003_nr_synergy_foundation.sql` — re-running it resets access rules).
- Do not run `supabase db push`, `db reset`, or any DROP TABLE. Do not touch `.env`.

## This release — "Check-in pill + Payslips" (code only)
1. Database: none.
2. Code: on branch `feature/nrs-ask`, commit all working-tree changes, run `npx tsc --noEmit -p .` and
   `npm run build` (both must pass), then merge `feature/nrs-ask` into `main` and push `main`. Vercel deploys automatically.
   New: src/components/TopbarCheckIn.tsx, src/app/api/nr-synergy/time/status/route.ts,
        src/app/api/nr-synergy/payslips/route.ts, src/app/api/nr-synergy/payslips/[id]/route.ts,
        src/app/tools/nr-synergy/money/_components/PayslipsPanel.tsx,
        src/lib/nrs/invoice/payslip.ts, payslipCalc.ts, payslipPdf.ts, payslip.test.ts
   Changed: src/components/TopbarStatus.tsx, approvals/decide/route.ts, invoices/[id]/route.ts, search/route.ts,
        search/ask/route.ts, money/_components/MoneyClient.tsx, i18n/en/money.ts, i18n/en/search.ts,
        src/lib/nrs/invoice/pdf.ts, src/lib/nrs/invoice/service.ts, RELEASE.md
3. Do not change .env or Vercel settings.
4. Report: the merge commit hash.

What it does: a check-in pill in the top-right status bar (check in / out with work mode, live timer);
payslips created automatically from each finance-approved invoice (Money → Payslips, PDF download, only the
owner sees them), in-app note when ready and when paid, and the search bar answers "my payslip".

## Release log
| Date | Release | Database files | Code | Result |
|---|---|---|---|---|
| 2026-10-03 | Foundation | 20261003_nr_synergy_foundation.sql | PR #2 | done |
| 2026-10-03 | Search + Admin Console | — | PR #3 | done |
| 2026-10-04 | Phase 1 | 20261004_nr_synergy_phase1.sql | PR #4 | done |
| 2026-10-04 | Policy fix | 20261004b_nr_synergy_policy_fix.sql | — | done (verified by Claude) |
| 2026-10-04 | Projects permissions + Ask NR Synergy v2 | 20261004c_nr_synergy_projects_visibility.sql | feature/nrs-ask | done (verified by Claude: DB + deploy) |
| 2026-10-04 | Ask NR Synergy: AI fallback | — | feature/nrs-ask | done (verified live by Claude) |
| 2026-10-04 | Check-in pill + Payslips | — | feature/nrs-ask | pending |
