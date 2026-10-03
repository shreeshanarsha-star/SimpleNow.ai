# NR Synergy: build brief for Antigravity

You are the build engineer. Claude is the tech lead and reviews and merges your work. Work only in this folder, `SimpleNow-nr-synergy`, which is a git worktree on branch `feature/nr-synergy`. Never touch `main`, the other SimpleNow.ai folder, `.env`, or any other tool's code.

## Product in one paragraph

NR Synergy is an intranet for Natural Remedies' international consultants and staff. It lives inside SimpleNow.ai as a tool in the "Product & Engineering" department.

It has 7 tabs: Home, Time, Money, Projects, People, Knowledge, Help. Managers also get a Team tab (Approvals, My team). A separate admin area sits at `/tools/nr-synergy/admin`. Themes are NR Green (default), Light and Onyx.

Consultants get a *work log* (location optional, city only), *deliverables* and *invoices*. Payroll staff get attendance.

## Existing code to reuse (read these first)

- **Auth and access:** `src/lib/supabase/{server,client,admin}.ts` and `src/lib/supabase/requireAdmin.ts`. Use `requireFeatureAccess("NR Synergy")` on every API route.
- **Tool registry:** `src/lib/departments.ts`. Add `{ n: "NR Synergy", s: "live", href: "/tools/nr-synergy" }` to the `product` department and set that department's status to `"live"`. Also add an icon mapping in `src/lib/licensedTools.ts` (`"NR Synergy": "users"`).
- **App shell:** `src/components/AppShell.tsx`, `Topbar.tsx` and `TopbarStatus.tsx` (greeting, weather and time already exist; reuse them, don't duplicate). Follow the existing tool pages under `src/app/tools/*` as patterns, e.g. `src/app/tools/talent-ai`.
- **Styling:** Tailwind with CSS variables from `src/app/globals.css`. Use the existing tokens (`bg-surface`, `text-ink`, `brand`). Add an `nrs` theme scope only if needed.

## Database (already written, do not change without asking)

- The schema is `supabase/migrations/20261003_nr_synergy_foundation.sql`: 47 tables prefixed `nrs_`, RLS, helper functions `nrs_me()`, `nrs_is_hr()`, `nrs_manages()` and so on, an audit trigger, and the private bucket `nrs-private`.
- Supabase project: **askshree-app-v2** (ref `jdjzbaxpoghqnfdnesub`).
- **Apply only this one file**, using the Supabase dashboard SQL editor (browser) or `supabase db query`. Do **not** run `supabase db push` and do not apply any other migration.
- After applying, run in SQL: `select count(*) from information_schema.tables where table_name like 'nrs_%';`. Expected: 47.
- **Money rules:**
  - Integer minor units plus an ISO currency.
  - Never use floats for money. Use helpers in `src/lib/nrs/money.ts` (create it).
- **Writes:**
  - Sensitive writes (approvals, invoices, contract terms, member admin) go through API routes that check permissions in code and then use the service-role client from `src/lib/supabase/admin.ts`.
  - Simple own-record writes (check-in, project update, kudos, ticket, acknowledgement, comment) may use the user client; RLS allows them.

## File layout to create

```
src/app/tools/nr-synergy/
  layout.tsx            NR Synergy sub-navigation (7 tabs + Team for managers + Admin link for HR); hide tabs whose feature is off (nrs_member_features / nrs_features)
  page.tsx              Home
  time/page.tsx         check-in/out, month view, leave, holidays, corrections
  money/page.tsx        invoices, expenses, travel, my documents
  projects/page.tsx     my projects, weekly update form, history
  people/page.tsx       directory, org chart, profile drawer
  knowledge/page.tsx    JOE, Library (country-filtered, acknowledgements), quick links
  help/page.tsx         tickets + my assets
  team/page.tsx         approvals queue + my team (managers)
  admin/page.tsx        users (add, roles, engagement type, designation, home country, feature switches), countries/holidays, approval chains, content, demo-data wipe
src/app/api/nr-synergy/...   one route folder per module
src/lib/nrs/            shared server helpers: member.ts (current member + roles + features), money.ts, approvals.ts (engine), dates.ts (working days with country rules + holidays), audit.ts
```

## Build order (one commit per step, message prefix `nr-synergy:`)

1. **Registry and shell:** department entry, `layout.tsx` with tabs, a member loader (`src/lib/nrs/member.ts`), and an empty-state page per tab that says "Coming in this build" for HR only (employees never see unbuilt tabs).
2. **People:** directory, search and filters (country, department, division), org chart from `manager_id`, profile drawer (local time from the country timezone).
3. **Time:**
   - Check-in/out: browser geolocation is optional. City and country come from the reverse geocoder route `/api/nr-synergy/geo`; use OpenStreetMap Nominatim and send a User-Agent.
   - Work mode select, month calendar, leave request (working days computed with country rules and holidays), holidays list, corrections.
   - Leave and corrections create approval requests through `approvals.ts`.
4. **Projects:** list with RAG status, the weekly update form (status, progress, challenges, plan_of_action, help_needed_member_id, next milestone) and history.
5. **Knowledge:** Library list filtered to global plus the member's home country, document view (markdown), Acknowledge button, JOE (MD message, values, My journey with reflections), quick links.
6. **Help:** ticket create and list, a thread view, my assets.
7. **Home:** needs-you-today list, feed with comments and reactions, kudos (must pick a value), events.
8. **Team:** approvals queue (approve, reject or send back with comment; uses `approvals.ts`), my team (today status list, leave calendar, project updates, Excel export with the existing `xlsx` dependency).
9. **Admin:** users and feature switches, countries and holidays, approval chains, content (posts, events, documents and versions, values, quick links), and a "Wipe demo data" button (deletes rows where `is_demo = true`, confirm first).

Money (invoices with AI contract extraction) is built by Claude. Leave `money/page.tsx` for last and only build the expenses and travel lists and forms there.

## Approval engine (`src/lib/nrs/approvals.ts`), the required behaviour

- `createRequest(kind, subjectId, memberId, title, amountMinor?, currency?)`:
  - Load the latest `nrs_approval_chains` row for the org and kind, with `effective_from <= today`, matching the member's engagement type (or `all`).
  - Expand the steps: `manager` → the member's `manager_id`; `role` → `approver_role`; `when.amount_minor_gt` skips the step if the amount is not above the threshold.
  - Insert the request and its steps. The first step gets status `pending` and the rest `waiting`.
  - Create a `notifications` row for the approver(s) with `feature_key = 'NR Synergy'`.
- `decide(stepId, decision: 'approve'|'reject'|'send_back', comment)`:
  - Allowed only if `nrs_can_act_on_step(stepId)` (call it as an RPC with the user client).
  - On approve, move to the next step, or mark the request `approved` and update the subject row's status.
  - Reject and send_back end the request and set the subject status accordingly. A comment is required for both.
  - Record `acting_for_member` when a delegate decides.
- Default chains to seed:
  - leave: manager
  - correction: manager
  - expense: manager, then finance if over 50000 minor units
  - travel: manager
  - invoice: manager, then HR, then finance

## Quality bar (every step)

- `npm run build` passes (TypeScript strict, no `any` in new code unless unavoidable).
- Every API route: `requireFeatureAccess("NR Synergy")`, then load the member, then check the feature switch and role, then act. Return 403 JSON on failure.
- Empty, loading and error states on every screen. Works at 390px width. Keyboard accessible. Use real `<button>` and `<label>` elements.
- No fake data in code. Demo data comes only from the seed (`supabase/seed/nr_synergy_demo.json`, which Claude provides) through the admin "Load demo data" action.
- All UI strings go in `src/lib/nrs/i18n/en.ts` (a key-value object). Spanish, Portuguese and German files are added by Claude later.

## When you finish a step

Commit with a clear message. Do not push; Claude reviews and pushes. Leave a short note in `NR_SYNERGY_PROGRESS.md` (step done, files changed, anything blocked).
