# Askshree.com — fresh build (v2)

Rebuild of the Askshree.com AI tools console. Next.js 15 + Supabase (Postgres + Auth) +
Anthropic. Old app (`Askshree-App`) is read-only reference for scope — nothing was copied.

Full plan and open decisions: see `fresh-build-checklist-v1` in the project docs.

## What's live vs. planned

The sidebar/department pages are honest about this — anything marked "soon" has no
backend yet. Currently built end-to-end:

- **Job Postings.ai** (`/tools/job-postings-ai`) — draft a role, AI-polish the
  description (Anthropic), submit for approval.
- **Admin approval queue** (`/admin`) — owner reviews and approves/rejects/publishes
  postings, one queue per feature. This is the pattern every future tool plugs into.

Everything else in the department taxonomy is UI-only scaffolding (`src/lib/departments.ts`)
until it's actually built.

## First-time setup

1. **Install dependencies**: `npm install`
2. **Environment variables** — copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — already set for the
     `askshree-app-v2` Supabase project (safe to commit-adjacent, these are public keys).
   - `SUPABASE_SERVICE_ROLE_KEY` — **do not commit this or paste it into chat**. Get it
     from Supabase dashboard → Project Settings → API → service_role key.
   - `ANTHROPIC_API_KEY` — from console.anthropic.com. Required for Job Postings.ai's
     AI-polish step; the rest of the app works without it.
   - `ANTHROPIC_MODEL` (optional) — overrides the model ID used for AI polish. The
     code ships with a default that was current when written; Anthropic retires old
     snapshot IDs periodically, so check
     [docs.claude.com/en/docs/about-claude/models](https://docs.claude.com/en/docs/about-claude/models)
     if AI polish starts failing with a "model not found" error.
3. **Create your owner login** — this app has exactly one real user (you). In the
   Supabase dashboard → Authentication → Users → **Add user**, create yourself with
   an email + password directly in Supabase's own UI (never share that password with
   an AI assistant, including this one). That's the account you sign in with at `/login`.
4. `npm run dev` and open `/admin` — you'll be redirected to `/login` until step 3 is done.

## Deploying

Push this repo to GitHub, then import it into Vercel (vercel.com → Add New → Project →
import the GitHub repo). Add the same environment variables from `.env.local` in
Vercel's Project Settings → Environment Variables — Vercel does **not** read
`.env.local`, it only exists for your machine. Free tier covers this comfortably.

Nothing here touches the live askshree.com DNS/deployment — this is a fresh Vercel
project on its own URL until an explicit cutover decision.

## Database

Schema lives in Supabase, applied via migrations (see the `job_postings` table — created
with RLS **enabled and explicit policies from day one**, not the old app's
service-role-only pattern). Every future table should follow the same approach.
