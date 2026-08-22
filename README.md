# evnmanager

Self-service **scheduled cloud environments**. A developer requests a time-boxed
window on a project environment ("start UAT Mon–Fri 09:00–17:00"), DevOps
approves, and a scheduler starts and stops the underlying cloud services at the
window boundaries — so non-prod spend only happens while someone is using it.

Extracted from the environment-management feature of `rezize-app` and rebuilt as
a standalone, single-tenant app.

## Quick start

```bash
TZ=Asia/Kolkata SEED_DEMO=1 docker compose up -d --build
```

- SPA + API: http://localhost:3000  (API also direct on :5001)
- Sign in: `admin` / `admin123` — **change this immediately**
- `SEED_DEMO=1` plants a mock project with dev + UAT environments, so the whole
  flow is clickable with no cloud account.

**Set `TZ` to your team's timezone.** Request windows are stored as naive local
times; a container left on UTC while the team is on UTC+5:30 arms every job 5½
hours late.

## Layout

```
backend/    Flask JSON API (/api/v1), APScheduler, SQLAlchemy
frontend/   React 19 + Vite + Tailwind v4 SPA, served by nginx
```

## Concepts

```
Project (one cloud account + mock|real mode)
 └─ Environment (dev / uat / staging)
     └─ CloudService (ec2, rds, vm, app_service, …)

EnvironmentRequest  a window: one-off, or weekly on chosen weekdays
 └─ Approval        devops decision
 └─ ScheduledJob    the armed start / stop
```

Roles: **developer** raises requests on projects they're a member of ·
**devops** operates environments and can emergency-stop · **admin** manages
projects, users and secrets.

Approval is **project-scoped**: a request is approved by the members whose
`project_role` on that project is `devops`, or by any admin. Holding the global
`devops` role grants operational reach but not approval rights — an admin adds
you to a project as DevOps. Upgrading an existing deployment backfills every
global-devops user as project-devops on every active project, so no inbox
empties on deploy.

## Mock vs real

Every project has a `mode`. In `mock` (the default) start/stop is simulated —
no SDK calls, no credentials, no spend — so the app is fully demoable. Only
`real` reaches AWS (boto3) or Azure. `CloudManagerFactory` is the single gate;
the cloud SDKs are imported lazily, so a mock-only deploy never needs them.

## Chat intake

Developers who know the outcome they want but not the fields can describe it in
plain language at **New Request → Not sure what you need?**. The agent asks
follow-ups, then hands over a prefilled request form — a service window or a
repo request. It **proposes only**: it never writes to the database, and every
id, enum and date it produces is re-checked server-side against the project the
chat is scoped to, so a hallucinated service can't reach an approver.

Set `GEMINI_API_KEY` to enable it. Leave it blank and the feature disappears
entirely: the entry point is hidden and `/api/v1/chat/*` returns 503. Model
defaults to `gemini-2.5-flash` (`GEMINI_MODEL`).

Conversations are scoped to one project and readable only by the developer who
had them. A request raised from a chat records its `conversation_id`, so an
approver can read the original ask.

## Secrets

Projects hold credentials, optionally pinned to one environment (so `API_URL`
can differ between dev and UAT). Values are Fernet-encrypted at rest.

Listing a project's secrets shows keys and scopes but **never values**. Revealing
a value is a separate endpoint that requires the per-membership
`can_view_secrets` permission (DevOps/admins always have it) and writes an audit
entry recording who read what — never the value itself.

## Development

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python seed.py --demo
.venv/bin/python run.py                 # :5001
.venv/bin/python -m pytest tests/ -q    # 43 tests

cd frontend && npm install && npm run dev   # :5173, proxies /api to :5001
```

## Operational notes

- **`/api/v1/health` reports scheduler state**, not just process liveness.
  Everything this app does happens on a background job, and a dead scheduler is
  otherwise invisible: requests get approved and then silently never start.
  A `503` / `"status": "degraded"` means the scheduler is down.
- **Run one gunicorn worker.** APScheduler is in-process, so a second worker
  arms a duplicate of every start/stop job. Scale with threads.
- **Jobs live in memory** and are re-armed from the database on boot
  (`recover_pending_jobs`). Starting the scheduler is an explicit call in
  `run.py` / `wsgi.py`, not a guess inside `create_app`.
- **Schema changes:** `seed.py` runs `create_all()`, which adds new *tables* but
  not new *columns*. A new column needs a migration, or a fresh volume
  (`docker compose down -v`).
- **Keep `CRED_KEY` stable.** It decrypts stored cloud credentials and secrets;
  rotating it (or rotating `SECRET_KEY` while it's unset) orphans them.
