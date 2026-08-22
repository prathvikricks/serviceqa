# Chat intake agent + project-scoped approval routing

Date: 2026-08-22
Status: approved for planning

## Problem

Two gaps, one shared cause — the app assumes a developer already knows exactly
what to ask for, and it assumes DevOps is a single global pool.

1. **Developers don't always know what to request.** They know the outcome they
   want ("I need UAT up for the client demo next week", "I need a repo for the
   billing service"), not which environment, which cloud services, which action
   type, or which time window. The request forms demand all of that up front.
2. **Approval has no project boundary.** `devops` is a global role.
   `/api/v1/approvals` lists every pending request platform-wide behind
   `@devops_required`, and `approve`/`decline` accept any request id. A DevOps
   engineer on one project sees and can act on every other project's requests.

## Scope

Two phases. Phase 1 stands alone and ships first; Phase 2 depends on it for
correct routing.

**Phase 1** — project-scoped approval routing.
**Phase 2** — a Gemini-backed chat agent that turns a free-form ask into a
prefilled request draft, for both existing request types (`service`, `repo`).

Out of scope: new request types beyond the two that exist; auto-fulfilment of
anything the agent proposes; changing how approved requests are executed.

---

## Phase 1 — Project-scoped approval routing

### Model

`ProjectMember` gains a `role` column:

```python
role = db.Column(db.String(20), default='developer', nullable=False)  # 'developer' | 'devops'
```

Membership already scopes *who is on* a project (`models/user.py`). This says
*what they are* on it. `ProjectMember.ROLES = ['developer', 'devops']`.

This is a new **column**, and `seed.py` runs `create_all()`, which adds tables
but not columns. It requires a real Alembic migration (Flask-Migrate is already
a dependency).

### Authz

New method on `User`:

```python
def is_project_devops(self, project_id):
    """True if this user may approve requests on this project."""
```

- `admin` → always `True` (the catch-all approver).
- otherwise → the user's `ProjectMember` row for that project has
  `role == 'devops'`.

The global `devops` role no longer implies approval rights on its own.

### Approvals endpoint

`/api/v1/approvals` drops `@devops_required` in favour of a project filter.
A request reaches its project by two different routes since `bbde70b`:

- `service` requests → `environment.project_id`
- `repo` requests → `EnvironmentRequest.project_id` (direct)

`EnvironmentRequest.project` (`models/request.py:142`) already resolves both in
Python. The list query must do the equivalent in SQL:

```python
or_(
    EnvironmentRequest.environment.has(Environment.project_id.in_(ids)),
    EnvironmentRequest.project_id.in_(ids),
)
```

where `ids` is the set of projects the caller is project-devops on. `admin`
skips the filter and sees everything.

`approve` and `decline` replace the blanket decorator with a per-request check
on `env_request.project`, returning 403 otherwise — so a devops on project A
cannot act on project B's request by guessing its id. This applies to the repo
fulfilment path (`_approve_repo_request`) identically.

Emergency-stop and cross-project *visibility* (`get_projects`, dashboards,
`is_member_of`) are unchanged: the global `devops` role still grants them. Only
the approval inbox and the approve/decline actions become project-scoped.

### Migration safety

The Alembic migration backfills so nobody's inbox empties on deploy: every user
with the global `devops` role gets a `ProjectMember` row with `role='devops'`
on every active project they don't already belong to. After the migration,
granting project-devops is an explicit admin action.

### Surface

- `ProjectDetailPage` — a role selector per member, alongside the existing
  `can_view_secrets` toggle.
- `ApprovalsPage` — show the project on each row (it now varies meaningfully).
- Admin member add/update endpoints accept and validate `role`.

### Testing

- A project-devops sees only their projects' pending requests, of both types.
- A project-devops gets 403 approving another project's request by id.
- An `admin` sees and can approve everything.
- A plain member (role `developer`) gets 403 on the approvals endpoints.
- Existing `test_membership.py` / `test_request_flow.py` updated for the new
  column default.

---

## Phase 2 — Chat intake agent

### Boundary

**The model never writes to the database.** It proposes a draft; the developer
confirms on the real form; the existing approval flow does the rest. A
hallucinated service id or misread date cannot reach DevOps unreviewed.

### Flow

1. Developer picks one of their projects and opens a chat.
2. Agent asks follow-up questions until it has enough.
3. When ready, the reply carries a validated draft and a "Use this draft"
   action.
4. That navigates to `NewRequestPage` (`service`) or `NewRepoRequestPage`
   (`repo`) with fields prefilled via router state.
5. Developer edits if needed and submits through the existing endpoints.
6. The request lands in that project's DevOps inbox (Phase 1).

### Model contract

Every turn returns the same JSON shape via the Gemini SDK's `response_schema` —
no tool-calling machinery, one call per turn, deterministic parsing:

```
{
  reply:        string,          // what to show the developer
  ready:        boolean,
  missing:      string[],        // fields still unknown, for the UI hint
  request_type: 'service' | 'repo' | null,
  draft:        object | null
}
```

`draft` when `request_type == 'service'`:

```
environment_id, service_ids[], action_type ('start_stop' | 'stop_start'),
schedule_type ('once' | 'weekly'),
start_time, end_time,                                    // once
recurrence_days, start_hm, stop_hm, recur_until,         // weekly
reason
```

`draft` when `request_type == 'repo'`:

```
repo_name, repo_description, repo_visibility ('private' | 'public'), reason
```

The repo project is the chat's project — never model-chosen.

### Context

The system prompt carries only the chat's own project: its environments and
their cloud services (id, name, type), the configured `TZ`, today's date, and
the schedule vocabulary (`ACTION_TYPES`, `WEEKDAYS` tokens, `HH:MM` format,
`repo_name` charset rules from `_REPO_NAME_RE`). A developer cannot receive a
draft naming a project they aren't on, because the catalogue never contains it.

### Validation is server-side

Before any draft is returned to the client:

- `environment_id` must belong to the chat's project.
- every `service_id` must belong to that environment.
- `action_type`, `schedule_type`, `repo_visibility` must be in their enums.
- `start_time` / `end_time` must parse and `end > start`.
- weekday tokens must be a subset of `EnvironmentRequest.WEEKDAYS`.
- `recur_until`, if set, must be in the future.
- `repo_name` must match `_REPO_NAME_RE`.

A failed check drops the draft, keeps `ready` false, and appends the specific
failure to the next model turn so it can correct itself. The model's output is
a proposal, never an authority.

### Persistence

```
ChatConversation  id, user_id, project_id, status, created_at
ChatMessage       id, conversation_id, role ('user' | 'agent'), content,
                  draft (JSON, nullable), created_at
```

`EnvironmentRequest` gains a nullable `conversation_id` FK, so a DevOps
reviewing a request can read the original fuzzy ask that produced it. This app
already treats auditability as a first-class concern (`AuditLog`, secret-reveal
logging); the conversation is part of that record.

Conversations cap at 20 turns to bound token spend; past that the endpoint
returns a message telling the developer to use the form or start fresh.

### Wiring

- `backend/app/services/chat_agent.py` — the single gate, mirroring
  `CloudManagerFactory`. `google.genai` is imported lazily, exactly like the
  cloud SDKs, so a deploy without the feature never needs the dependency.
- Config: `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-2.5-flash`).
  Unset ⇒ `/api/v1/chat/*` returns 503 and the frontend hides the entry point.
  The rest of the app stays fully demoable with no credentials, as today.
- `google-genai` added to `requirements.txt`. Structured output uses a plain
  JSON-schema dict via `response_mime_type='application/json'` +
  `response_schema` — no new Pydantic dependency.
- Flask-Limiter (already present) caps chat messages per user.

### Endpoints

```
GET  /api/v1/chat/status                        -> { enabled }
POST /api/v1/chat/conversations                 { project_id } -> conversation
GET  /api/v1/chat/conversations/<id>            -> conversation + messages
POST /api/v1/chat/conversations/<id>/messages   { content } -> { reply, draft? }
```

All require membership of the conversation's project; a conversation is
readable only by the user who owns it (or an admin).

### Frontend

- `frontend/src/features/chat/ChatPage.tsx` — project picker, message list,
  composer, and a draft card with "Use this draft".
- Route `/requests/new/chat`, surfaced as a third card on `NewRequestChooser`
  ("Not sure what you need? Describe it").
- `NewRequestPage` and `NewRepoRequestPage` accept prefill from router state.
- The chat card and route are hidden when `/chat/status` reports disabled.

### Error handling

- Gemini call fails or times out → 502 with a friendly message; the
  conversation and its history are preserved so the developer can retry.
- Model returns unparseable JSON → one retry, then the 502 path.
- Turn cap reached → 409 with a message pointing at the forms.

### Testing

No network in the test suite — the agent service is tested against a stubbed
client.

- Draft citing a service id from another environment is rejected.
- Draft citing an environment from another project is rejected.
- Invalid weekday tokens / past `recur_until` / bad `repo_name` are rejected.
- Endpoints return 503 when `GEMINI_API_KEY` is unset.
- A non-member is blocked from opening a chat on a project.
- Another user cannot read someone else's conversation.
- A valid repo draft and a valid service draft each round-trip to their form's
  expected payload shape.

---

## Build order

1. Phase 1 model + migration + authz + tests.
2. Phase 1 surface (member role selector, approvals project column).
3. Phase 2 models + migration + chat service with stubbed-client tests.
4. Phase 2 endpoints + authz tests.
5. Phase 2 frontend + prefill wiring.

## Open risks

- **Timezone.** Drafts must produce naive local times consistent with the
  existing `TZ` contract. The prompt states the timezone explicitly and the
  validator never converts — a draft is interpreted in the same frame the forms
  use.
- **Cost.** Bounded by the 20-turn cap and the per-user rate limit, but there is
  no per-project budget on chat spend. Acceptable for v1; revisit if used
  heavily.
