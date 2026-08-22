# Chat Intake Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a developer describe what they need in plain language and receive a validated, prefilled request draft — for either a service window or a repo creation — which they confirm on the existing form.

**Architecture:** A Gemini-backed conversation, scoped to one project the developer belongs to. Every turn returns the same JSON shape via the SDK's `response_schema`, so there is no tool-calling machinery. The model's draft is **a proposal, never an authority**: the server re-validates every id, enum and date against that project before the draft leaves the API, and the model never writes to the database.

**Tech Stack:** Flask 3, SQLAlchemy 2, `google-genai` (Gemini Developer API), pytest with a stubbed client (no network in tests), React 19 + TanStack Query.

**Spec:** `docs/superpowers/specs/2026-08-22-chat-intake-and-project-scoped-approvals-design.md` (Phase 2)

**Depends on:** `docs/superpowers/plans/2026-08-22-project-scoped-approvals.md` — a chat-produced request must route to the right project's DevOps, which is Phase 1's job. Build that first.

## Global Constraints

- **No Alembic.** New *tables* are created by `create_all()`. The one new *column* (`environment_requests.conversation_id`) follows `seed.py`'s established idempotent Postgres DDL pattern — see `_REQUEST_COLUMN_DDL` / `ensure_request_columns()`.
- **Lazy import.** `google.genai` is imported inside the function that needs it, exactly as the cloud SDKs are in `CloudManagerFactory`. A deployment without the feature must never need the dependency installed.
- **No network in the test suite.** Every agent test injects a stub client. `pytest` must pass with `GEMINI_API_KEY` unset.
- **Feature is off by default.** No `GEMINI_API_KEY` ⇒ `/api/v1/chat/*` returns 503 and the frontend hides the entry point. The rest of the app stays fully demoable with zero credentials.
- **Do not commit the key.** `.env` and `frontend/.env` are tracked in this repo as of `2e549ab`. Add `GEMINI_API_KEY=` to `.env.example` only, with an empty value.
- **Model id:** `gemini-2.5-flash` (override with `GEMINI_MODEL`).
- **Timezone:** drafts are naive local times in `Config.SCHEDULER_TIMEZONE`. The prompt states the zone; the validator never converts.
- Run tests with `cd backend && .venv/bin/python -m pytest tests/ -q`.

---

## File Structure

**Backend**
- `app/models/chat.py` — **new**. `ChatConversation`, `ChatMessage`. Registered in `app/models/__init__.py`.
- `app/services/chat_agent.py` — **new**. The single gate: availability check, prompt assembly, the Gemini call, JSON parsing. Knows nothing about HTTP.
- `app/services/chat_validation.py` — **new**. Pure functions that turn a raw model draft into a trusted draft or a list of problems. Separated because it is the security boundary and must be testable with no model, no client and no request context.
- `app/blueprints/api/chat.py` — **new**. Endpoints, authz, rate limiting.
- `app/blueprints/api/serializers.py` — `conversation_dict`, `chat_message_dict`.
- `app/models/request.py` — `conversation_id` column.
- `app/config.py`, `requirements.txt`, `.env.example`, `seed.py` — wiring.
- `tests/test_chat_validation.py`, `tests/test_chat_api.py` — **new**.

**Frontend**
- `features/chat/ChatPage.tsx` — **new**. Project picker, transcript, composer, draft card.
- `features/chat/types.ts` — **new**.
- `App.tsx`, `features/requests/NewRequestChooser.tsx`, `NewRequestPage.tsx`, `NewRepoRequestPage.tsx` — route, entry card, prefill.

---

### Task 1: Draft validation

Built first and alone, because it is the security boundary and everything else depends on its shape.

**Files:**
- Create: `backend/app/services/chat_validation.py`
- Test: `backend/tests/test_chat_validation.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `validate_draft(project, request_type: str, raw: dict) -> tuple[dict | None, list[str]]` — returns `(clean_draft, [])` on success or `(None, ['problem', ...])` on failure. Never raises on bad input.
  - `SERVICE_FIELDS: tuple[str, ...]`, `REPO_FIELDS: tuple[str, ...]` — the keys a clean draft may contain, per type.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_chat_validation.py`:

```python
"""The model proposes; the server decides.

Every id, enum and date in a model-produced draft is re-checked against the
conversation's own project before it can reach a form. A draft that names a
resource the developer cannot see must not survive.
"""
from datetime import datetime, timedelta

from app.extensions import db
from app.models.environment import Environment, CloudService
from app.models.project import Project
from app.services.chat_validation import validate_draft


def _service_raw(env_id, service_ids, **over):
    start = datetime.now() + timedelta(days=1)
    raw = {
        'environment_id': env_id,
        'service_ids': service_ids,
        'action_type': 'start_stop',
        'schedule_type': 'once',
        'start_time': start.replace(microsecond=0).isoformat(),
        'end_time': (start + timedelta(hours=8)).replace(microsecond=0).isoformat(),
        'reason': 'client demo',
    }
    raw.update(over)
    return raw


def test_a_good_service_draft_passes(project):
    env = project.environments.first()
    ids = [s.id for s in env.services.all()]

    clean, problems = validate_draft(project, 'service', _service_raw(env.id, ids))

    assert problems == []
    assert clean['environment_id'] == env.id
    assert sorted(clean['service_ids']) == sorted(ids)


def test_an_environment_from_another_project_is_rejected(project, users):
    other = Project(name='Other', slug='other', cloud_provider='aws', mode='mock',
                    created_by=users['admin'].id)
    other.set_provider_config({'region': 'us-east-1'})
    db.session.add(other)
    db.session.flush()
    foreign_env = Environment(project_id=other.id, name='dev', display_name='Dev')
    db.session.add(foreign_env)
    db.session.commit()

    clean, problems = validate_draft(project, 'service', _service_raw(foreign_env.id, []))

    assert clean is None
    assert any('environment' in p for p in problems)


def test_a_service_from_another_environment_is_rejected(project, users):
    env = project.environments.first()
    other_env = Environment(project_id=project.id, name='dev', display_name='Dev')
    db.session.add(other_env)
    db.session.flush()
    stray = CloudService(environment_id=other_env.id, name='Stray',
                         service_type='ec2', cloud_resource_id='i-stray',
                         hourly_cost=0.1, current_status='stopped')
    db.session.add(stray)
    db.session.commit()

    clean, problems = validate_draft(project, 'service', _service_raw(env.id, [stray.id]))

    assert clean is None
    assert any('service' in p for p in problems)


def test_an_unknown_action_type_is_rejected(project):
    env = project.environments.first()
    clean, problems = validate_draft(
        project, 'service', _service_raw(env.id, [], action_type='obliterate'))
    assert clean is None


def test_an_end_before_its_start_is_rejected(project):
    env = project.environments.first()
    start = datetime.now() + timedelta(days=1)
    clean, problems = validate_draft(project, 'service', _service_raw(
        env.id, [],
        start_time=start.isoformat(),
        end_time=(start - timedelta(hours=1)).isoformat()))
    assert clean is None


def test_bad_weekday_tokens_are_rejected(project):
    env = project.environments.first()
    clean, problems = validate_draft(project, 'service', _service_raw(
        env.id, [], schedule_type='weekly', recurrence_days='mon,funday',
        start_hm='09:00', stop_hm='17:00'))
    assert clean is None


def test_a_past_recur_until_is_rejected(project):
    env = project.environments.first()
    yesterday = (datetime.now() - timedelta(days=1)).date().isoformat()
    clean, problems = validate_draft(project, 'service', _service_raw(
        env.id, [], schedule_type='weekly', recurrence_days='mon',
        start_hm='09:00', stop_hm='17:00', recur_until=yesterday))
    assert clean is None


def test_a_good_repo_draft_passes(project):
    clean, problems = validate_draft(project, 'repo', {
        'repo_name': 'billing-service',
        'repo_description': 'Billing API',
        'repo_visibility': 'private',
        'reason': 'new service',
    })
    assert problems == []
    assert clean['repo_name'] == 'billing-service'


def test_an_invalid_repo_name_is_rejected(project):
    clean, problems = validate_draft(project, 'repo', {
        'repo_name': 'not a valid name!',
        'repo_visibility': 'private',
        'reason': 'x',
    })
    assert clean is None


def test_an_unknown_request_type_is_rejected(project):
    clean, problems = validate_draft(project, 'wormhole', {})
    assert clean is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_chat_validation.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.chat_validation'`

- [ ] **Step 3: Write the implementation**

Create `backend/app/services/chat_validation.py`:

```python
"""Turn a model-proposed draft into a trusted one, or into a list of problems.

The chat agent's output is untrusted input. A model can name an environment in
someone else's project, a service that does not exist, or a date in the past —
and the request forms downstream would take it at face value. Everything the
model produces passes through here first, checked against the conversation's
own project.

Pure functions: no Flask request context, no model client, no HTTP. That keeps
the security boundary testable on its own.
"""
import re
from datetime import date, datetime

from ..models.environment import Environment
from ..models.request import EnvironmentRequest

SERVICE_FIELDS = ('environment_id', 'service_ids', 'action_type', 'schedule_type',
                  'start_time', 'end_time', 'recurrence_days', 'start_hm',
                  'stop_hm', 'recur_until', 'reason')
REPO_FIELDS = ('repo_name', 'repo_description', 'repo_visibility', 'reason')

# Mirrors _REPO_NAME_RE in blueprints/api/requests.py — the form rejects
# anything else, so a draft that would fail there is worse than no draft.
_REPO_NAME_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$')
_HM_RE = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')

_ACTION_TYPES = {value for value, _ in EnvironmentRequest.ACTION_TYPES}
_SCHEDULE_TYPES = {'once', 'weekly'}
_VISIBILITIES = {'private', 'public'}


def validate_draft(project, request_type, raw):
    """Check a raw model draft against `project`.

    Returns (clean_draft, []) or (None, [problem, ...]). The problem strings are
    fed back to the model on the next turn so it can correct itself, so they
    name the field and what was wrong with it.
    """
    if not isinstance(raw, dict):
        return None, ['The draft was not an object.']
    if request_type == 'service':
        return _validate_service(project, raw)
    if request_type == 'repo':
        return _validate_repo(raw)
    return None, [f'Unknown request type {request_type!r}.']


def _parse_dt(value):
    try:
        return datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def _validate_service(project, raw):
    problems = []

    env = Environment.query.filter_by(
        id=raw.get('environment_id'), project_id=project.id).first()
    if env is None:
        return None, [f'environment_id {raw.get("environment_id")!r} is not an '
                      f'environment of project {project.name}.']

    valid_service_ids = {s.id for s in env.services.all()}
    requested = raw.get('service_ids') or []
    if not isinstance(requested, list):
        problems.append('service_ids must be a list.')
        requested = []
    stray = [s for s in requested if s not in valid_service_ids]
    if stray:
        problems.append(f'service ids {stray} do not belong to environment '
                        f'{env.display_name}.')

    action_type = raw.get('action_type') or 'start_stop'
    if action_type not in _ACTION_TYPES:
        problems.append(f'action_type must be one of {sorted(_ACTION_TYPES)}.')

    schedule_type = raw.get('schedule_type') or 'once'
    if schedule_type not in _SCHEDULE_TYPES:
        problems.append(f'schedule_type must be one of {sorted(_SCHEDULE_TYPES)}.')

    start = _parse_dt(raw.get('start_time'))
    end = _parse_dt(raw.get('end_time'))
    if start is None or end is None:
        problems.append('start_time and end_time must be ISO-8601 datetimes.')
    elif end <= start:
        problems.append('end_time must be after start_time.')

    recurrence_days = start_hm = stop_hm = recur_until = None
    if schedule_type == 'weekly':
        tokens = [t.strip() for t in str(raw.get('recurrence_days') or '').split(',')
                  if t.strip()]
        unknown = [t for t in tokens if t not in EnvironmentRequest.WEEKDAYS]
        if not tokens:
            problems.append('recurrence_days is required for a weekly schedule.')
        elif unknown:
            problems.append(f'recurrence_days {unknown} are not weekday tokens '
                            f'({", ".join(EnvironmentRequest.WEEKDAYS)}).')
        else:
            recurrence_days = ','.join(tokens)

        start_hm, stop_hm = raw.get('start_hm'), raw.get('stop_hm')
        if not (_HM_RE.match(str(start_hm or '')) and _HM_RE.match(str(stop_hm or ''))):
            problems.append('start_hm and stop_hm must be HH:MM.')

        if raw.get('recur_until'):
            try:
                recur_until = date.fromisoformat(str(raw['recur_until']))
            except ValueError:
                problems.append('recur_until must be a YYYY-MM-DD date.')
            else:
                if recur_until <= date.today():
                    problems.append('recur_until must be in the future.')

    reason = (raw.get('reason') or '').strip()
    if not reason:
        problems.append('reason is required.')

    if problems:
        return None, problems

    return {
        'environment_id': env.id,
        'service_ids': list(requested),
        'action_type': action_type,
        'schedule_type': schedule_type,
        'start_time': start.isoformat(),
        'end_time': end.isoformat(),
        'recurrence_days': recurrence_days,
        'start_hm': start_hm,
        'stop_hm': stop_hm,
        'recur_until': recur_until.isoformat() if recur_until else None,
        'reason': reason,
    }, []


def _validate_repo(raw):
    problems = []

    repo_name = (raw.get('repo_name') or '').strip()
    if not _REPO_NAME_RE.match(repo_name):
        problems.append('repo_name must start alphanumeric and contain only '
                        'letters, digits, dots, dashes and underscores.')

    visibility = (raw.get('repo_visibility') or 'private').strip().lower()
    if visibility not in _VISIBILITIES:
        problems.append("repo_visibility must be 'private' or 'public'.")

    description = (raw.get('repo_description') or '').strip()
    reason = (raw.get('reason') or '').strip() or description
    if not reason:
        problems.append('reason or repo_description is required.')

    if problems:
        return None, problems

    return {
        'repo_name': repo_name,
        'repo_description': description,
        'repo_visibility': visibility,
        'reason': reason,
    }, []
```

- [ ] **Step 4: Confirm the repo-name regex matches the form's**

Run: `cd backend && grep -n "_REPO_NAME_RE" app/blueprints/api/requests.py`
Read the pattern it prints. If it differs from `_REPO_NAME_RE` above, change `chat_validation.py` to match it exactly and add a comment noting they must stay in step. A draft the form would reject is worse than no draft.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_chat_validation.py -q`
Expected: PASS (10 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/chat_validation.py backend/tests/test_chat_validation.py
git commit -m "feat: validate model-proposed request drafts against their project"
```

---

### Task 2: Conversation models

**Files:**
- Create: `backend/app/models/chat.py`
- Modify: `backend/app/models/__init__.py`, `backend/app/models/request.py`, `backend/seed.py`
- Test: `backend/tests/test_chat_api.py` (create)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ChatConversation(id, user_id, project_id, status, created_at)` with `messages` relationship (`lazy='dynamic'`, cascade delete) and `MAX_TURNS = 20`.
  - `ChatMessage(id, conversation_id, role, content, draft, request_type, created_at)`; `role` in `('user', 'agent')`.
  - `EnvironmentRequest.conversation_id: int | None`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_chat_api.py`:

```python
"""Chat conversations: ownership, turn limits, and the disabled-by-default gate."""
from app.extensions import db
from app.models.chat import ChatConversation, ChatMessage

from conftest import login, make_user


def test_a_conversation_holds_ordered_messages(project, users):
    convo = ChatConversation(user_id=users['dev'].id, project_id=project.id)
    db.session.add(convo)
    db.session.flush()
    db.session.add(ChatMessage(conversation_id=convo.id, role='user',
                               content='I need UAT up next week'))
    db.session.add(ChatMessage(conversation_id=convo.id, role='agent',
                               content='Which services?'))
    db.session.commit()

    assert convo.messages.count() == 2
    assert convo.turn_count == 1          # one user turn


def test_deleting_a_conversation_deletes_its_messages(project, users):
    convo = ChatConversation(user_id=users['dev'].id, project_id=project.id)
    db.session.add(convo)
    db.session.flush()
    db.session.add(ChatMessage(conversation_id=convo.id, role='user', content='hi'))
    db.session.commit()

    db.session.delete(convo)
    db.session.commit()
    assert ChatMessage.query.count() == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_chat_api.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.models.chat'`

- [ ] **Step 3: Write the models**

Create `backend/app/models/chat.py`:

```python
"""Chat intake conversations.

A developer describes what they need; the agent asks follow-ups and eventually
proposes a request draft. The transcript is kept rather than discarded: this app
already treats auditability as first-class, and an approver looking at a request
is better served by the original ask than by the tidied-up form fields.
"""
from datetime import datetime, timezone
from ..extensions import db


class ChatConversation(db.Model):
    __tablename__ = 'chat_conversations'

    # Turns are capped so a wandering conversation cannot run up unbounded
    # token spend. Past this the developer is pointed at the forms.
    MAX_TURNS = 20

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    status = db.Column(db.String(20), default='open', nullable=False)  # open | closed
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    user = db.relationship('User', foreign_keys=[user_id])
    project = db.relationship('Project', foreign_keys=[project_id])
    messages = db.relationship('ChatMessage', backref='conversation',
                               lazy='dynamic', cascade='all, delete-orphan',
                               order_by='ChatMessage.id')

    @property
    def turn_count(self):
        """User turns so far — what MAX_TURNS is measured against."""
        return self.messages.filter_by(role='user').count()

    def __repr__(self):
        return f'<ChatConversation #{self.id} project={self.project_id}>'


class ChatMessage(db.Model):
    __tablename__ = 'chat_messages'

    ROLES = ['user', 'agent']

    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('chat_conversations.id'),
                                nullable=False)
    role = db.Column(db.String(10), nullable=False)
    content = db.Column(db.Text, nullable=False)
    # The validated draft this turn produced, if any. Stored so the transcript
    # explains itself without re-running the model.
    draft = db.Column(db.JSON, nullable=True)
    request_type = db.Column(db.String(20), nullable=True)  # 'service' | 'repo'
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f'<ChatMessage {self.role} convo={self.conversation_id}>'
```

- [ ] **Step 4: Register the models**

In `backend/app/models/__init__.py`, add the import alongside the others and both names to `__all__`:

```python
from .chat import ChatConversation, ChatMessage  # noqa: F401
```

- [ ] **Step 5: Link a request to its conversation**

In `backend/app/models/request.py`, in `EnvironmentRequest`, after the `parent_request_id` column:

```python
    # The chat conversation that produced this request, if it came from the
    # agent rather than the form. Lets an approver read the original ask.
    conversation_id = db.Column(db.Integer, db.ForeignKey('chat_conversations.id'),
                                nullable=True)
```

- [ ] **Step 6: Patch the live schema**

In `backend/seed.py`, append to `_REQUEST_COLUMN_DDL`:

```python
    "ALTER TABLE environment_requests ADD COLUMN IF NOT EXISTS "
    "conversation_id INTEGER REFERENCES chat_conversations(id)",
```

This must be the **last** entry: the referenced table is created by `create_all()`, which `main()` runs before `ensure_request_columns()`.

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_chat_api.py -q`
Expected: PASS (2 passed)

- [ ] **Step 8: Run the full suite**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend/app/models/chat.py backend/app/models/__init__.py \
        backend/app/models/request.py backend/seed.py backend/tests/test_chat_api.py
git commit -m "feat: chat conversation and message models"
```

---

### Task 3: The agent service

**Files:**
- Create: `backend/app/services/chat_agent.py`
- Modify: `backend/app/config.py`, `backend/requirements.txt`, `.env.example`
- Test: `backend/tests/test_chat_agent.py` (create)

**Interfaces:**
- Consumes: `validate_draft`, `SERVICE_FIELDS`, `REPO_FIELDS` (Task 1); `ChatConversation`, `ChatMessage` (Task 2).
- Produces:
  - `is_enabled() -> bool`
  - `AgentUnavailable(Exception)`, `AgentError(Exception)`
  - `respond(conversation, user_message: str, client=None) -> dict` — returns `{'reply': str, 'ready': bool, 'missing': list[str], 'request_type': str | None, 'draft': dict | None}`. The `draft` is already validated. `client` is for tests only.
  - `build_project_context(project) -> str`
  - `RESPONSE_SCHEMA: dict`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_chat_agent.py`:

```python
"""The agent service: prompt scope, parsing, and what happens to a bad draft.

Tests inject a stub client — no network, and the suite passes with no API key.
"""
import json

import pytest

from app.extensions import db
from app.models.chat import ChatConversation, ChatMessage
from app.services import chat_agent


class StubResponse:
    def __init__(self, payload):
        self.text = json.dumps(payload)


class StubClient:
    """Records what it was asked and replays a queued list of payloads."""

    def __init__(self, *payloads):
        self.payloads = list(payloads)
        self.calls = []
        self.models = self

    def generate_content(self, model=None, contents=None, config=None):
        self.calls.append({'model': model, 'contents': contents, 'config': config})
        return StubResponse(self.payloads.pop(0))


def _convo(project, users):
    convo = ChatConversation(user_id=users['dev'].id, project_id=project.id)
    db.session.add(convo)
    db.session.commit()
    return convo


def test_the_prompt_only_describes_the_conversations_project(project, users):
    other_name = 'a-project-they-cannot-see'
    context = chat_agent.build_project_context(project)

    assert project.name in context
    assert other_name not in context
    for svc in project.environments.first().services.all():
        assert svc.name in context


def test_a_follow_up_turn_returns_no_draft(project, users):
    convo = _convo(project, users)
    client = StubClient({
        'reply': 'Which environment do you mean?',
        'ready': False, 'missing': ['environment_id'],
        'request_type': 'service', 'draft': None,
    })

    out = chat_agent.respond(convo, 'I need something up next week', client=client)

    assert out['ready'] is False
    assert out['draft'] is None
    assert 'Which environment' in out['reply']


def test_a_ready_turn_returns_a_validated_draft(project, users):
    from datetime import datetime, timedelta
    convo = _convo(project, users)
    env = project.environments.first()
    start = datetime.now() + timedelta(days=1)
    client = StubClient({
        'reply': "Here's the request I'd raise.",
        'ready': True, 'missing': [], 'request_type': 'service',
        'draft': {
            'environment_id': env.id,
            'service_ids': [s.id for s in env.services.all()],
            'action_type': 'start_stop', 'schedule_type': 'once',
            'start_time': start.replace(microsecond=0).isoformat(),
            'end_time': (start + timedelta(hours=8)).replace(microsecond=0).isoformat(),
            'reason': 'client demo',
        },
    })

    out = chat_agent.respond(convo, 'UAT up all day tomorrow for the demo', client=client)

    assert out['ready'] is True
    assert out['draft']['environment_id'] == env.id


def test_an_invalid_draft_is_dropped_and_retried_once(project, users):
    """A draft naming a foreign service must not reach the caller."""
    from datetime import datetime, timedelta
    convo = _convo(project, users)
    env = project.environments.first()
    start = datetime.now() + timedelta(days=1)
    bad = {
        'reply': 'Ready.', 'ready': True, 'missing': [], 'request_type': 'service',
        'draft': {
            'environment_id': env.id, 'service_ids': [9999],
            'action_type': 'start_stop', 'schedule_type': 'once',
            'start_time': start.isoformat(),
            'end_time': (start + timedelta(hours=1)).isoformat(),
            'reason': 'x',
        },
    }
    client = StubClient(bad, bad)     # fails, retried, fails again

    out = chat_agent.respond(convo, 'anything', client=client)

    assert out['ready'] is False
    assert out['draft'] is None
    assert len(client.calls) == 2, 'a rejected draft should be fed back once'


def test_unparseable_output_raises_agent_error(project, users):
    convo = _convo(project, users)

    class Broken(StubClient):
        def generate_content(self, model=None, contents=None, config=None):
            self.calls.append(1)
            return type('R', (), {'text': 'not json at all'})()

    with pytest.raises(chat_agent.AgentError):
        chat_agent.respond(_convo(project, users), 'hi', client=Broken())


def test_the_turn_is_persisted(project, users):
    convo = _convo(project, users)
    client = StubClient({'reply': 'ok', 'ready': False, 'missing': [],
                         'request_type': None, 'draft': None})

    chat_agent.respond(convo, 'hello there', client=client)

    roles = [m.role for m in convo.messages.all()]
    assert roles == ['user', 'agent']
    assert convo.messages.filter_by(role='user').first().content == 'hello there'


def test_disabled_without_an_api_key(app, monkeypatch):
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    app.config['GEMINI_API_KEY'] = None
    assert chat_agent.is_enabled() is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_chat_agent.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.chat_agent'`

- [ ] **Step 3: Add configuration**

In `backend/app/config.py`, inside `class Config`, after the `SCHEDULER_TIMEZONE` block:

```python
    # Chat intake agent (Gemini). Unset => the feature is off: /api/v1/chat/*
    # returns 503 and the SPA hides the entry point, so the app stays fully
    # demoable with no credentials, exactly as it is without a cloud account.
    GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
    GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash')
```

In `backend/requirements.txt`, after the cloud-provider block:

```
# --- Chat intake agent (only used when GEMINI_API_KEY is set) ---
google-genai==1.33.0
```

In `.env.example`, after the `SEED_DEMO` block:

```
# Chat intake agent. Leave blank to disable the feature entirely — the
# chat entry point disappears and /api/v1/chat returns 503.
# Get a key at https://aistudio.google.com/apikey
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

Do **not** put a real key in `.env`, which is tracked in this repo.

- [ ] **Step 4: Write the service**

Create `backend/app/services/chat_agent.py`:

```python
"""The chat intake agent — the single gate between this app and Gemini.

Mirrors CloudManagerFactory: one module owns the third-party integration, and
the SDK is imported lazily so a deployment that never enables the feature never
needs the dependency installed.

The contract with the model is deliberately dull. Every turn returns the same
JSON object (see RESPONSE_SCHEMA) — no tool calls, no streaming, no state held
on their side. That makes each turn one call, one parse, one validation, and
makes the whole thing testable with a stub client.
"""
import json
import logging

from flask import current_app

from ..extensions import db
from ..models.chat import ChatMessage
from ..models.request import EnvironmentRequest
from .chat_validation import validate_draft

logger = logging.getLogger(__name__)


class AgentUnavailable(Exception):
    """The feature is not configured."""


class AgentError(Exception):
    """The model call failed or returned something unusable."""


RESPONSE_SCHEMA = {
    'type': 'OBJECT',
    'required': ['reply', 'ready'],
    'properties': {
        'reply': {'type': 'STRING'},
        'ready': {'type': 'BOOLEAN'},
        'missing': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'request_type': {'type': 'STRING', 'enum': ['service', 'repo']},
        'draft': {
            'type': 'OBJECT',
            'properties': {
                'environment_id': {'type': 'INTEGER'},
                'service_ids': {'type': 'ARRAY', 'items': {'type': 'INTEGER'}},
                'action_type': {'type': 'STRING', 'enum': ['start_stop', 'stop_start']},
                'schedule_type': {'type': 'STRING', 'enum': ['once', 'weekly']},
                'start_time': {'type': 'STRING'},
                'end_time': {'type': 'STRING'},
                'recurrence_days': {'type': 'STRING'},
                'start_hm': {'type': 'STRING'},
                'stop_hm': {'type': 'STRING'},
                'recur_until': {'type': 'STRING'},
                'repo_name': {'type': 'STRING'},
                'repo_description': {'type': 'STRING'},
                'repo_visibility': {'type': 'STRING', 'enum': ['private', 'public']},
                'reason': {'type': 'STRING'},
            },
        },
    },
}

_SYSTEM_INSTRUCTION = """\
You help a developer turn a vague need into one concrete request in an internal
environment-management tool. You do not perform actions; you only propose a
draft that the developer then reviews on a form.

There are exactly two request types:

- "service": schedule a start/stop window on an existing environment. Needs an
  environment, the cloud services to act on, an action type, a schedule, and a
  reason.
- "repo": ask for a new Git repository. Needs a name, visibility, and a reason.
  An approver picks GitHub or GitLab later — never choose a provider yourself.

Rules:
- Ask one focused question at a time until you can fill a complete draft.
- Only ever use the environment and service ids listed in the project context
  below. Never invent an id, and never refer to anything not listed.
- Times are naive local times in the timezone stated below. Do not convert.
- Set "ready": true and fill "draft" ONLY when every required field is known.
  Otherwise set "ready": false, leave "draft" null, and list what you still
  need in "missing".
- "reply" is shown directly to the developer. Keep it short and plain.
"""


def is_enabled():
    """True if the chat feature is configured."""
    return bool(current_app.config.get('GEMINI_API_KEY'))


def _client():
    """Build a Gemini client. Imported lazily — see the module docstring."""
    if not is_enabled():
        raise AgentUnavailable('GEMINI_API_KEY is not set.')
    try:
        from google import genai
    except ImportError as exc:   # pragma: no cover - depends on the deploy
        raise AgentUnavailable('google-genai is not installed.') from exc
    return genai.Client(api_key=current_app.config['GEMINI_API_KEY'])


def build_project_context(project):
    """Everything the model is allowed to know: this project and nothing else.

    Scoping happens here rather than in the prompt's wording. A developer cannot
    be handed a draft naming a project they are not on, because that project's
    ids never enter the conversation.
    """
    from datetime import date

    tz = current_app.config.get('SCHEDULER_TIMEZONE', 'UTC')
    lines = [
        f'Project: {project.name} (id {project.id})',
        f'Timezone for all times: {tz}',
        f"Today's date: {date.today().isoformat()}",
        f'Weekday tokens: {", ".join(EnvironmentRequest.WEEKDAYS)}',
        'Time-of-day format: HH:MM (24-hour)',
        '',
        'Environments and their cloud services:',
    ]
    for env in project.environments.all():
        lines.append(f'- environment_id {env.id}: {env.display_name} ({env.name})')
        services = env.services.all()
        if not services:
            lines.append('    (no cloud services registered)')
        for svc in services:
            lines.append(f'    service_id {svc.id}: {svc.name} [{svc.service_type}]')
    return '\n'.join(lines)


def _history_contents(conversation, user_message, correction=None):
    """The transcript in the SDK's contents format, oldest first."""
    contents = []
    for msg in conversation.messages.all():
        contents.append({
            'role': 'user' if msg.role == 'user' else 'model',
            'parts': [{'text': msg.content}],
        })
    contents.append({'role': 'user', 'parts': [{'text': user_message}]})
    if correction:
        contents.append({'role': 'user', 'parts': [{'text': correction}]})
    return contents


def _call(client, conversation, user_message, correction=None):
    model = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')
    config = {
        'system_instruction': _SYSTEM_INSTRUCTION + '\n\nProject context:\n'
                              + build_project_context(conversation.project),
        'response_mime_type': 'application/json',
        'response_schema': RESPONSE_SCHEMA,
    }
    try:
        response = client.models.generate_content(
            model=model,
            contents=_history_contents(conversation, user_message, correction),
            config=config,
        )
    except Exception as exc:
        logger.exception('Gemini call failed for conversation %s', conversation.id)
        raise AgentError(str(exc)) from exc

    try:
        return json.loads(response.text)
    except (TypeError, ValueError) as exc:
        raise AgentError('The model returned output that was not JSON.') from exc


def respond(conversation, user_message, client=None):
    """One turn: call the model, validate any draft, persist both messages.

    A draft that fails validation is dropped and the specific problems are fed
    back to the model once. If the retry also fails we return the reply without
    a draft rather than passing an unchecked one to the form — the model
    proposes, it never decides.
    """
    client = client or _client()

    payload = _call(client, conversation, user_message)
    request_type = payload.get('request_type')
    draft, problems = None, []

    if payload.get('ready') and payload.get('draft') is not None:
        draft, problems = validate_draft(
            conversation.project, request_type, payload['draft'])

        if draft is None:
            correction = ('That draft was rejected: ' + ' '.join(problems)
                          + ' Correct it using only the ids in the project context.')
            payload = _call(client, conversation, user_message, correction)
            request_type = payload.get('request_type')
            if payload.get('ready') and payload.get('draft') is not None:
                draft, problems = validate_draft(
                    conversation.project, request_type, payload['draft'])

    ready = draft is not None
    reply = (payload.get('reply') or '').strip() or 'Could you tell me a bit more?'

    db.session.add(ChatMessage(conversation_id=conversation.id, role='user',
                               content=user_message))
    db.session.add(ChatMessage(conversation_id=conversation.id, role='agent',
                               content=reply, draft=draft,
                               request_type=request_type if ready else None))
    db.session.commit()

    return {
        'reply': reply,
        'ready': ready,
        'missing': payload.get('missing') or problems,
        'request_type': request_type if ready else None,
        'draft': draft,
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_chat_agent.py -q`
Expected: PASS (7 passed)

- [ ] **Step 6: Install the dependency and re-run everything**

Run: `cd backend && .venv/bin/pip install -r requirements.txt && .venv/bin/python -m pytest tests/ -q`
Expected: PASS, with `GEMINI_API_KEY` unset.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/chat_agent.py backend/app/config.py \
        backend/requirements.txt .env.example backend/tests/test_chat_agent.py
git commit -m "feat: Gemini-backed chat intake agent service"
```

---

### Task 4: Chat endpoints

**Files:**
- Create: `backend/app/blueprints/api/chat.py`
- Modify: `backend/app/blueprints/api/__init__.py`, `backend/app/blueprints/api/serializers.py`
- Test: `backend/tests/test_chat_api.py`

**Interfaces:**
- Consumes: `chat_agent.is_enabled/respond/AgentError/AgentUnavailable` (Task 3); `ChatConversation`, `ChatMessage` (Task 2).
- Produces:
  - `GET /api/v1/chat/status` → `{'enabled': bool}`
  - `POST /api/v1/chat/conversations` `{project_id}` → 201 conversation
  - `GET /api/v1/chat/conversations/<id>` → conversation + messages
  - `POST /api/v1/chat/conversations/<id>/messages` `{content}` → `{reply, ready, missing, request_type, draft}`
  - `serializers.conversation_dict(convo, with_messages=False)`, `serializers.chat_message_dict(msg)`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_chat_api.py`:

```python
import json

import pytest

from app.models.project import Project
from app.services import chat_agent


@pytest.fixture
def enabled(app):
    app.config['GEMINI_API_KEY'] = 'test-key'
    yield
    app.config['GEMINI_API_KEY'] = None


def test_status_reports_disabled_without_a_key(client, users):
    login(client, 'dev')
    assert client.get('/api/v1/chat/status').get_json() == {'enabled': False}


def test_endpoints_return_503_when_disabled(client, project, users):
    login(client, 'dev')
    resp = client.post('/api/v1/chat/conversations', json={'project_id': project.id})
    assert resp.status_code == 503


def test_a_member_can_open_a_conversation(client, project, users, enabled):
    login(client, 'dev')
    resp = client.post('/api/v1/chat/conversations', json={'project_id': project.id})
    assert resp.status_code == 201
    assert resp.get_json()['project_id'] == project.id


def test_a_non_member_cannot_open_a_conversation(client, project, users, enabled):
    make_user('outsider', 'developer')
    login(client, 'outsider')
    resp = client.post('/api/v1/chat/conversations', json={'project_id': project.id})
    assert resp.status_code == 403


def test_another_user_cannot_read_your_conversation(client, project, users, enabled):
    convo = ChatConversation(user_id=users['dev'].id, project_id=project.id)
    db.session.add(convo)
    db.session.commit()

    make_user('nosy', 'developer')
    login(client, 'nosy')
    assert client.get(f'/api/v1/chat/conversations/{convo.id}').status_code == 403


def test_sending_a_message_returns_the_agents_reply(client, project, users, enabled, monkeypatch):
    convo = ChatConversation(user_id=users['dev'].id, project_id=project.id)
    db.session.add(convo)
    db.session.commit()

    def fake_respond(conversation, content, client=None):
        return {'reply': 'Which environment?', 'ready': False,
                'missing': ['environment_id'], 'request_type': None, 'draft': None}

    monkeypatch.setattr(chat_agent, 'respond', fake_respond)

    login(client, 'dev')
    resp = client.post(f'/api/v1/chat/conversations/{convo.id}/messages',
                       json={'content': 'I need something'})
    assert resp.status_code == 200
    assert resp.get_json()['reply'] == 'Which environment?'


def test_a_model_failure_is_a_502(client, project, users, enabled, monkeypatch):
    convo = ChatConversation(user_id=users['dev'].id, project_id=project.id)
    db.session.add(convo)
    db.session.commit()

    def boom(conversation, content, client=None):
        raise chat_agent.AgentError('upstream exploded')

    monkeypatch.setattr(chat_agent, 'respond', boom)

    login(client, 'dev')
    resp = client.post(f'/api/v1/chat/conversations/{convo.id}/messages',
                       json={'content': 'hi'})
    assert resp.status_code == 502


def test_the_turn_cap_is_enforced(client, project, users, enabled):
    convo = ChatConversation(user_id=users['dev'].id, project_id=project.id)
    db.session.add(convo)
    db.session.flush()
    for i in range(ChatConversation.MAX_TURNS):
        db.session.add(ChatMessage(conversation_id=convo.id, role='user',
                                   content=f'turn {i}'))
    db.session.commit()

    login(client, 'dev')
    resp = client.post(f'/api/v1/chat/conversations/{convo.id}/messages',
                       json={'content': 'one more'})
    assert resp.status_code == 409


def test_an_empty_message_is_rejected(client, project, users, enabled):
    convo = ChatConversation(user_id=users['dev'].id, project_id=project.id)
    db.session.add(convo)
    db.session.commit()

    login(client, 'dev')
    resp = client.post(f'/api/v1/chat/conversations/{convo.id}/messages',
                       json={'content': '   '})
    assert resp.status_code == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_chat_api.py -q`
Expected: FAIL — 404 on every chat route; the blueprint does not exist.

- [ ] **Step 3: Add the serializers**

In `backend/app/blueprints/api/serializers.py`, at the end of the file:

```python
def chat_message_dict(msg):
    return {
        'id': msg.id,
        'role': msg.role,
        'content': msg.content,
        'draft': msg.draft,
        'request_type': msg.request_type,
        'created_at': _dt(msg.created_at),
    }


def conversation_dict(convo, with_messages=False):
    data = {
        'id': convo.id,
        'project_id': convo.project_id,
        'project': convo.project.name if convo.project else None,
        'status': convo.status,
        'turn_count': convo.turn_count,
        'max_turns': convo.__class__.MAX_TURNS,
        'created_at': _dt(convo.created_at),
    }
    if with_messages:
        data['messages'] = [chat_message_dict(m) for m in convo.messages.all()]
    return data
```

- [ ] **Step 4: Write the endpoints**

Create `backend/app/blueprints/api/chat.py`:

```python
"""Chat intake endpoints.

Authz is deliberately narrow: you must be a member of the conversation's
project to start one, and a conversation is readable only by the user who owns
it (or an admin). The transcript can contain a developer's unfiltered
description of a problem, which is not something to spread across a team by
default.
"""
import logging

from flask import jsonify, request
from flask_login import login_required, current_user

from ...extensions import db, limiter
from ...models.chat import ChatConversation, ChatMessage
from ...models.project import Project
from ...services import chat_agent
from . import api_bp
from .helpers import _get_or_404
from .serializers import conversation_dict

logger = logging.getLogger(__name__)


def _require_enabled():
    if not chat_agent.is_enabled():
        return jsonify({'error': 'The chat assistant is not configured.'}), 503
    return None


def _owned_conversation(conversation_id):
    """Fetch a conversation the caller is allowed to read, or an error response."""
    convo = _get_or_404(ChatConversation, conversation_id)
    if convo.user_id != current_user.id and not current_user.is_admin:
        return None, (jsonify({'error': 'Not your conversation.'}), 403)
    return convo, None


@api_bp.route('/chat/status')
@login_required
def chat_status():
    """Lets the SPA hide the entry point rather than offering a dead button."""
    return jsonify({'enabled': chat_agent.is_enabled()})


@api_bp.route('/chat/conversations', methods=['POST'])
@login_required
def chat_conversation_create():
    disabled = _require_enabled()
    if disabled:
        return disabled

    data = request.get_json(silent=True) or {}
    project_id = data.get('project_id')
    if _get_or_404(Project, project_id) and not current_user.is_member_of(project_id):
        return jsonify({'error': 'You are not a member of that project.'}), 403

    convo = ChatConversation(user_id=current_user.id, project_id=project_id)
    db.session.add(convo)
    db.session.commit()
    return jsonify(conversation_dict(convo, with_messages=True)), 201


@api_bp.route('/chat/conversations/<int:conversation_id>')
@login_required
def chat_conversation_detail(conversation_id):
    convo, denied = _owned_conversation(conversation_id)
    if denied:
        return denied
    return jsonify(conversation_dict(convo, with_messages=True))


@api_bp.route('/chat/conversations/<int:conversation_id>/messages', methods=['POST'])
@login_required
@limiter.limit('20/minute;200/hour')
def chat_message_create(conversation_id):
    disabled = _require_enabled()
    if disabled:
        return disabled

    convo, denied = _owned_conversation(conversation_id)
    if denied:
        return denied

    content = ((request.get_json(silent=True) or {}).get('content') or '').strip()
    if not content:
        return jsonify({'error': 'Say something first.'}), 400

    if convo.turn_count >= ChatConversation.MAX_TURNS:
        return jsonify({
            'error': 'This conversation has gone on long enough — start a new '
                     'one, or fill the request form directly.',
        }), 409

    try:
        result = chat_agent.respond(convo, content)
    except chat_agent.AgentUnavailable as exc:
        return jsonify({'error': str(exc)}), 503
    except chat_agent.AgentError:
        # The transcript is untouched on failure, so the developer can retry.
        return jsonify({'error': 'The assistant is having trouble right now. '
                                 'Try again in a moment.'}), 502

    return jsonify(result)
```

- [ ] **Step 5: Register the blueprint module**

In `backend/app/blueprints/api/__init__.py`, add alongside the others:

```python
from . import chat        # noqa: E402, F401
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_chat_api.py -q`
Expected: PASS (11 passed)

- [ ] **Step 7: Run the full suite**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/app/blueprints/api/chat.py backend/app/blueprints/api/__init__.py \
        backend/app/blueprints/api/serializers.py backend/tests/test_chat_api.py
git commit -m "feat: chat intake endpoints"
```

---

### Task 5: Accept `conversation_id` when creating a request

**Files:**
- Modify: `backend/app/blueprints/api/requests.py` (`_create_repo_request`, and the service-request creation path)
- Test: `backend/tests/test_chat_api.py`

**Interfaces:**
- Consumes: `EnvironmentRequest.conversation_id` (Task 2).
- Produces: both request-creation paths accept an optional `conversation_id`, honoured only when the conversation belongs to the caller and to the same project.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_chat_api.py`:

```python
from datetime import datetime, timedelta

from app.models.request import EnvironmentRequest


def test_a_request_records_the_conversation_that_produced_it(client, project, users, enabled):
    convo = ChatConversation(user_id=users['dev'].id, project_id=project.id)
    db.session.add(convo)
    db.session.commit()

    start = datetime.now() + timedelta(hours=2)
    login(client, 'dev')
    resp = client.post('/api/v1/requests', json={
        'environment_id': project.environments.first().id,
        'start_time': start.isoformat(),
        'end_time': (start + timedelta(hours=2)).isoformat(),
        'reason': 'from chat',
        'conversation_id': convo.id,
    })
    assert resp.status_code == 201
    created = db.session.get(EnvironmentRequest, resp.get_json()['id'])
    assert created.conversation_id == convo.id


def test_someone_elses_conversation_id_is_ignored(client, project, users, enabled):
    convo = ChatConversation(user_id=users['admin'].id, project_id=project.id)
    db.session.add(convo)
    db.session.commit()

    start = datetime.now() + timedelta(hours=2)
    login(client, 'dev')
    resp = client.post('/api/v1/requests', json={
        'environment_id': project.environments.first().id,
        'start_time': start.isoformat(),
        'end_time': (start + timedelta(hours=2)).isoformat(),
        'reason': 'not mine',
        'conversation_id': convo.id,
    })
    assert resp.status_code == 201
    created = db.session.get(EnvironmentRequest, resp.get_json()['id'])
    assert created.conversation_id is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_chat_api.py -q`
Expected: FAIL — `conversation_id` is `None` in the first test; the field is ignored.

- [ ] **Step 3: Add the helper**

In `backend/app/blueprints/api/requests.py`, near the other module-level helpers:

```python
def _linked_conversation_id(data, project_id):
    """The chat conversation to record on this request, if it is legitimately ours.

    Silently ignored rather than rejected when it does not check out: the link
    is provenance, not authorization, and a stale id from a reloaded tab should
    not block a valid request.
    """
    from ...models.chat import ChatConversation

    conversation_id = data.get('conversation_id')
    if not conversation_id:
        return None
    convo = db.session.get(ChatConversation, conversation_id)
    if convo is None or convo.user_id != current_user.id:
        return None
    if project_id is not None and convo.project_id != project_id:
        return None
    return convo.id
```

- [ ] **Step 4: Use it in both creation paths**

In `_create_repo_request`, add `conversation_id=_linked_conversation_id(data, project_id)` to the `EnvironmentRequest(...)` construction, where `project_id` is the project already resolved in that function.

In the service-request creation path, add the same keyword to its `EnvironmentRequest(...)` construction, passing `environment.project_id` as the project id.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_chat_api.py -q`
Expected: PASS (13 passed)

- [ ] **Step 6: Run the full suite**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/blueprints/api/requests.py backend/tests/test_chat_api.py
git commit -m "feat: link a request to the conversation that produced it"
```

---

### Task 6: The chat page

**Files:**
- Create: `frontend/src/features/chat/ChatPage.tsx`, `frontend/src/features/chat/types.ts`
- Modify: `frontend/src/App.tsx`, `frontend/src/features/requests/NewRequestChooser.tsx`

**Interfaces:**
- Consumes: the endpoints from Task 4.
- Produces: route `/requests/new/chat`; navigates to `/requests/new/service` or `/requests/new/repo` with `{ state: { prefill, conversationId } }`.

- [ ] **Step 1: Write the types**

Create `frontend/src/features/chat/types.ts`:

```ts
export interface ChatMessage {
  id: number
  role: 'user' | 'agent'
  content: string
  draft: Record<string, unknown> | null
  request_type: 'service' | 'repo' | null
  created_at: string | null
}

export interface Conversation {
  id: number
  project_id: number
  project: string | null
  status: string
  turn_count: number
  max_turns: number
  created_at: string | null
  messages: ChatMessage[]
}

export interface TurnResult {
  reply: string
  ready: boolean
  missing: string[]
  request_type: 'service' | 'repo' | null
  draft: Record<string, unknown> | null
}
```

- [ ] **Step 2: Write the page**

Create `frontend/src/features/chat/ChatPage.tsx`. Follow the conventions of `NewRepoRequestPage.tsx` — same `PageHeader`, `Card`, `Button`, `useToast` imports, same `useMutation` error handling. Structure:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { PageHeader, Spinner, ErrorState } from '../../components/ui/Page'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, Select } from '../../components/ui/Input'
import { useToast } from '../../components/ui/Toast'
import type { Conversation, ChatMessage, TurnResult } from './types'

export function ChatPage() {
  const navigate = useNavigate()
  const { notify } = useToast()
  const [projectId, setProjectId] = useState<number | null>(null)
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [draft, setDraft] = useState<TurnResult | null>(null)

  // Projects the user may raise requests on.
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects'),
  })

  const start = useMutation({
    mutationFn: (pid: number) =>
      api.post('/chat/conversations', { project_id: pid }) as Promise<Conversation>,
    onSuccess: (convo) => {
      setConversation(convo)
      setMessages(convo.messages)
    },
    onError: (e: Error) => notify(e.message, 'error'),
  })

  const send = useMutation({
    mutationFn: (content: string) =>
      api.post(`/chat/conversations/${conversation!.id}/messages`, { content }) as Promise<TurnResult>,
    onSuccess: (result, content) => {
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), role: 'user', content, draft: null, request_type: null, created_at: null },
        { id: Date.now() + 1, role: 'agent', content: result.reply, draft: result.draft, request_type: result.request_type, created_at: null },
      ])
      setInput('')
      setDraft(result.ready ? result : null)
    },
    onError: (e: Error) => notify(e.message, 'error'),
  })

  function useDraft() {
    if (!draft?.draft || !conversation) return
    const path = draft.request_type === 'repo' ? '/requests/new/repo' : '/requests/new/service'
    navigate(path, {
      state: { prefill: { ...draft.draft, project_id: conversation.project_id }, conversationId: conversation.id },
    })
  }

  // …render: project picker when `conversation` is null; otherwise the
  // transcript, a composer wired to `send`, and — when `draft` is set — a
  // summary card with a "Use this draft" button calling useDraft().
}
```

Render requirements:
- Before a conversation exists: a `Select` of the user's projects and a **Start** button calling `start.mutate(projectId)`.
- Transcript: user messages right-aligned, agent messages left-aligned, both in bordered rounded blocks using the existing `bg-surface` / `border-border` tokens.
- Composer disabled while `send.isPending`; show a `Spinner` in the send button.
- Draft card: list the draft's key/value pairs plainly, then **Use this draft**.
- When `conversation.turn_count >= conversation.max_turns`, replace the composer with a line pointing at the forms.

- [ ] **Step 3: Add the route**

In `frontend/src/App.tsx`, import `ChatPage` and add above the existing `/requests/new/service` route:

```tsx
                <Route path="/requests/new/chat" element={<ChatPage />} />
```

- [ ] **Step 4: Add the entry card**

In `frontend/src/features/requests/NewRequestChooser.tsx`, add to `CHOICES`:

```tsx
  {
    to: '/requests/new/chat',
    icon: <MessageSquare className="h-6 w-6" />,
    title: 'Not sure what you need?',
    description: 'Describe it in your own words and we\'ll draft the request for you.',
  },
```

Import `MessageSquare` from `lucide-react` alongside the existing icons.

Gate it: query `/chat/status` in `NewRequestChooser` and filter this entry out when `enabled` is false, so a deployment with no key never shows a dead card.

- [ ] **Step 5: Verify the build**

Run: `cd frontend && npm run build`
Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/chat frontend/src/App.tsx \
        frontend/src/features/requests/NewRequestChooser.tsx
git commit -m "feat: chat intake page"
```

---

### Task 7: Prefill the request forms

**Files:**
- Modify: `frontend/src/features/requests/NewRequestPage.tsx`, `frontend/src/features/requests/NewRepoRequestPage.tsx`

**Interfaces:**
- Consumes: the router state shape from Task 6 — `{ prefill: Record<string, unknown>, conversationId: number }`.
- Produces: both forms initialise from `prefill` and include `conversation_id` in their submit payload.

- [ ] **Step 1: Read the prefill in the service form**

In `NewRequestPage.tsx`, add near the top of the component:

```tsx
import { useLocation } from 'react-router-dom'

// …inside the component:
  const { state } = useLocation() as {
    state?: { prefill?: Record<string, unknown>; conversationId?: number }
  }
  const prefill = state?.prefill
```

Then seed each existing `useState` initialiser from `prefill`, e.g. `useState(prefill?.reason as string ?? '')`, `useState(prefill?.environment_id as number ?? null)`, and so on for `service_ids`, `action_type`, `schedule_type`, `start_time`, `end_time`, `recurrence_days`, `start_hm`, `stop_hm`, `recur_until`. Do not change any field's existing default when `prefill` is absent.

- [ ] **Step 2: Send the conversation id**

Add `conversation_id: state?.conversationId` to the object posted to `/requests`.

- [ ] **Step 3: Do the same for the repo form**

In `NewRepoRequestPage.tsx`, seed `repo_name`, `repo_description`, `repo_visibility` and `reason` from `prefill`, and add `conversation_id: state?.conversationId` to its POST body.

- [ ] **Step 4: Verify the build**

Run: `cd frontend && npm run build`
Expected: no TypeScript errors.

- [ ] **Step 5: Verify end to end by hand**

With `GEMINI_API_KEY` exported, run the backend (`cd backend && .venv/bin/python run.py`) and frontend (`cd frontend && npm run dev`), then as a developer:
1. `/requests/new` shows the third card. Open it, pick a project, start.
2. Ask for something vague ("I need UAT up for a client demo next Tuesday morning").
3. Answer the follow-ups; confirm the draft card appears with real service names.
4. "Use this draft" → the service form opens prefilled → submit.
5. As that project's DevOps (from the Phase 1 plan), confirm the request is in the inbox.
6. Unset `GEMINI_API_KEY`, restart, confirm the card is gone and `/api/v1/chat/status` reports `{"enabled": false}`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/requests/NewRequestPage.tsx \
        frontend/src/features/requests/NewRepoRequestPage.tsx
git commit -m "feat: prefill request forms from a chat draft"
```

---

### Task 8: Document the feature

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a section**

Add after the "Mock vs real" section:

```markdown
## Chat intake

Developers who know the outcome they want but not the fields can describe it in
plain language at **New Request → Not sure what you need?**. The agent asks
follow-ups, then hands over a prefilled request form. It **proposes only** — it
never writes to the database, and every id, enum and date it produces is
re-checked server-side against the project the chat is scoped to, so a
hallucinated service can't reach an approver.

Set `GEMINI_API_KEY` to enable it. Leave it blank and the feature disappears
entirely: the entry point is hidden and `/api/v1/chat/*` returns 503. Model
defaults to `gemini-2.5-flash` (`GEMINI_MODEL`).

Conversations are scoped to one project and readable only by the developer who
had them. A request raised from a chat records its `conversation_id`, so an
approver can read the original ask.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: describe the chat intake agent"
```

---

## Self-Review

**Spec coverage:** boundary — model never writes (Task 3, `respond` persists only messages) · flow (Tasks 6, 7) · model contract / `RESPONSE_SCHEMA` (Task 3) · context scoped to one project (Task 3, `build_project_context`, asserted in `test_the_prompt_only_describes_the_conversations_project`) · server-side validation of every listed field (Task 1) · persistence + `conversation_id` link (Tasks 2, 5) · 20-turn cap (Tasks 2, 4) · lazy import and 503-when-unset (Tasks 3, 4) · rate limiting (Task 4) · all four endpoints (Task 4) · frontend page, route, chooser card, prefill (Tasks 6, 7) · error handling 502/409 (Task 4) · every listed test case (Tasks 1, 3, 4). Documented in Task 8.

**Naming consistency:** `validate_draft` returns `(draft, problems)` in Task 1 and is unpacked that way in Task 3. `respond(conversation, user_message, client=None)` is defined in Task 3 and called with two positional args in Task 4. `conversation_dict(convo, with_messages=False)` is defined in Task 4 step 3 and used in step 4. `TurnResult` in the frontend matches `respond`'s return keys exactly.

**Deviation from the spec:** the spec named a single `chat_agent.py`; this plan splits validation into `chat_validation.py`. Validation is the security boundary and must be testable with no model client, no key and no HTTP — mixing it into the module that owns the SDK would make that impossible to assert cleanly.

**Known follow-up, not in scope:** the approver-facing UI does not yet surface the linked conversation. The `conversation_id` is stored and serialisable; showing it on `RequestDetailPage` is a small separate change once this lands.
