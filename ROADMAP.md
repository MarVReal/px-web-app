# Project-X — Roadmap & Status

Last updated: 2026-10-01. Repos: `px-web-app` (Angular frontend, Vercel) · `px-web-api` (Supabase SQL: migrations + dev seed). Backend is **Supabase only** (no Express).

Legend: ✅ done · 🟡 partial · ⬜ not started

## Phase 1 — Auth, organization, roles, teams, users, RLS
- ✅ Email/password sign-up, sign-in, sign-out, session persistence, password reset
- ✅ Organization onboarding (creates org + settings + admin membership via `create_organization` RPC)
- ✅ Roles: ADMIN / SECTION HEAD / STAFF, role-based sidebar + route guards
- ✅ Divisions and teams (create/edit/archive teams, create divisions), add/remove members, assign section head
- ✅ Users page: change role, deactivate/reactivate, position title
- ✅ Invitations: single-use, 7-day expiry, email-bound, accept flow (`/invite/:token`)
- ✅ Row Level Security on every table; org id derived server-side; last-admin guard
- 🟡 Email verification: works if enabled in Supabase Auth; default Supabase mailer is rate-limited (needs custom SMTP for production)
- ⬜ Invitation **emails** (links are copy-and-share today) → Supabase Edge Function
- ⬜ Edit/delete division UI; permanently remove a user (only deactivate today)
- ⬜ Google / Microsoft login (postponed by decision)

## Phase 2 — Pipelines, stages, Kanban, tasks, drag & drop, activity
- ✅ Pipelines per team, default 5 stages, add / rename / delete stages
- ✅ Kanban board (CDK drag & drop, optimistic move, realtime refresh), cards with initials avatars, priority, due date, category, comments/attachments count, progress
- ✅ Task create / edit / delete dialog (all fields in spec except those below)
- ✅ Every move/edit/assign/priority/due-date change written to immutable `task_activity_logs` by DB triggers
- ✅ Task detail: comments, **links** (replaced file attachments), activity history; stage dropdown moves the task instantly
- ✅ **Categories & Tags** sidebar page (Admin / Section Head): pick a pipeline, create / rename / delete, with any **hex colour** (picker, typed hex, or 🎲 random) → dropdown choices on cards and in the task dialog
- ✅ **Kanban redesign (Superdesign Direction A, implemented):** stage-coloured column tops, grouped filter bar, Board settings menu, one-line card meta (priority dot · Created · Active), due date with red overdue warning, quiet footer (comments/links/progress)
- ✅ **Card Designer** (Admin / Section Head, sidebar): per-pipeline card layout — drag fields from a palette into the card, reorder, half/full width for side-by-side fields, live preview, clone from another pipeline, reset to default; the board renders cards from the saved layout (16 field types incl. dividers)
- ✅ Kanban card: title + initials, Task Created, Last Activity, priority/category/tag chips editable inline; priorities Low / Medium / High / Urgent (purple)
- 🟡 Stage reordering via ↑/↓ in the Edit stages dialog (no drag-to-reorder)
- ⬜ Subtasks / parent task, related tasks, recurrence UI (columns exist in DB)
- ⬜ Board pagination / lazy-load per stage (loads up to 500 tasks per pipeline)

## Phase 3 — Comments, notifications, filters, search
- ✅ Comments, @mention storage + mention notifications (no @-autocomplete UI yet)
- ✅ In-app notification center with unread badge + realtime
- ✅ Notifications on assign/unassign, review, completed, team add/remove
- ✅ Global search (tasks, pipelines, teams, users)
- 🟡 Task filters: Kanban (priority, assignee, text) and My Tasks only
- ⬜ Dedicated **Tasks** page for Admin / Section Head (filters: assignee, status, pipeline, priority, due date, tags, created date)
- ⬜ Due-soon / overdue notifications are implemented as `generate_due_notifications()` but **not scheduled** (needs pg_cron)
- ⬜ @mention autocomplete in comments

## Phase 4 — Accomplishment reports
- ✅ Individual, team and organization (multi-team compile) reports for **any date range** (e.g. Sep 1 – Sep 15) with quick presets (this/last month, 1st–15th, 16th–end, last 7/30 days)
- ✅ Editable narrative before saving, draft/final status, saved reports list
- ✅ Export PDF, Excel, CSV (CSV is formula-injection safe)
- ⬜ Open / re-export / edit a **saved** report (list is read-only today)
- ⬜ Report filters by division / pipeline; supporting documents; hours beyond estimated effort
- ⬜ **AI-generated reports with Gemini (planned, not started)** — see "Future: AI-assisted reports" below

## Future: AI-assisted reports (Gemini) — noted 2026-10-02, not started

**Goal:** generate the accomplishment report with the Gemini API instead of the template narrative. The user picks how the report is separated by category (for example "Data Generation" and "Data Quality") and the system compiles one report per team.

**Input to the model:** for each selected category, the `title` and `description` of every task in the report period (plus status, so the summary uses the right tense). Nothing else is sent.

**Output:** one summary per category plus a team-level compilation. It lands in the existing editable narrative box, so the Section Head can review and change it before saving, and it is marked as AI-assisted.

**Design notes (decide before building):**
1. **The Gemini key must never be in the frontend.** Both GitHub repos are public and the Angular bundle is public, so anything in `environment.ts`, a Vercel public env var, or the repo is exposed. Put the key in a Supabase secret (`supabase secrets set GEMINI_API_KEY=...`) and call Gemini only from a Supabase Edge Function, e.g. `generate-report`.
2. **The Edge Function uses the caller's own login.** It reads tasks with the user's JWT so row-level security still applies (people can only summarize tasks they can already see) and checks the existing report permission before calling Gemini.
3. **Category separation:** add a "Group by category" multi-select and a "Generate with AI" button on the Reports page. Categories come from `pipeline_categories`. Tasks with no category go under "Uncategorized".
4. **Failure and cost:** if Gemini fails or times out, fall back to the current template narrative. Add a per-organization monthly limit, truncate very long descriptions, and cache by a hash of the inputs so regenerating an unchanged report costs nothing.
5. **Data tracking:** add `ai_generated`, `ai_model` and `ai_prompt_version` to `monthly_reports` so AI drafts are traceable.
6. **Privacy:** task titles and descriptions leave the system and go to Google. Before sending real agency data, check Google's current data-use terms for the free and paid Gemini API tiers, and tell users the report is AI-assisted.

## Phase 5 — Analytics, audit, advanced permissions, SaaS
- ✅ Role-specific dashboards (admin / section head / staff), charts, filters
- 🟡 Dashboard aggregates client-side from up to 5,000 task rows → move to SQL views/RPC when data grows
- 🟡 Activity page: latest first with "load more"; no filters or export
- ✅ Permission catalogue + role→permission tables (UI checks use them)
- ⬜ Roles & Permissions editor (custom permissions)
- 🟡 SaaS: plan/status/limits columns exist; no enforcement, no Stripe (by design)

## Known issues / risks
1. **UI retest (2026-10-01, as Admin):** all modals, task dialog (typing, hours, category, tags, stage move, links, comments, delete), stage editor, labels page, all sidebar pages and report preview verified in the browser with 0 failed requests. Still untested: Section Head and Staff sessions, PDF/Excel/CSV download, invite acceptance in a second browser.
   Bugs found and fixed during the retest: modal backdrop cancelled mouse focus in every modal (inputs unclickable); card popover inputs blocked by drag; comments could not be posted (trigger bug); report "delayed" over-counted; updating teams / divisions / members / reports failed (trigger bug, fixed with the date-range migration).
2. **Demo users with a weak password exist in the live Supabase project** (`admin@demo.com`, `sectionhead@demo.com`, `staff1@demo.com`, `staff2@demo.com`, password `Demo1234!`). **Both GitHub repos are public and `px-web-api/supabase/seed.sql` contains that password**, so anyone can sign in as the demo admin. Delete the demo users and the Demo Organization before real use.
3. **Leaked-password protection is off** (Supabase dashboard → Auth).
4. No automated tests (frontend or SQL). The RLS test script used during development should be saved into `px-web-api/supabase/tests/`.
5. Staff can see all tasks of their own team (per spec "according to permissions"); stricter per-task privacy would need a `visibility` column.
6. Staff can only move/edit tasks they created or are assigned to (by design).

## Deployment checklist
- [x] Supabase schema applied; migration history matches `px-web-api/supabase/migrations` 1:1; `config.toml` added
- [x] Frontend builds (`npm run build`), `vercel.json` (SPA rewrite + output dir) ready
- [ ] Re-authenticate the Vercel connector (project `project-x` exists but is not readable yet)
- [ ] Push both repos to GitHub (`MarVReal/px-web-app`, `MarVReal/px-web-api`)
- [ ] Vercel: import `px-web-app`; env vars `SUPABASE_URL`, `SUPABASE_ANON_KEY` (publishable key only)
- [ ] Supabase → Auth → URL Configuration: Site URL = Vercel URL; add `https://<vercel-domain>/**` and `http://localhost:4200/**` to Redirect URLs
- [ ] Supabase → Auth: enable email confirmation + leaked-password protection; configure custom SMTP
- [ ] Remove demo users / demo organization
- [ ] Smoke test production: register → create org → team → pipeline → task → drag → report export
