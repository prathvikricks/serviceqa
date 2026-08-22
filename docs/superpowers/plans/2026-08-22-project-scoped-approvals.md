# Project-Scoped Approval Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route each request's approval to the DevOps engineers on that request's project instead of every DevOps user platform-wide.

**Architecture:** `ProjectMember` gains a `project_role` column (`developer` | `devops`). A new `User.is_project_devops(project_id)` becomes the single approval-rights predicate. The approvals list filters to the caller's project-devops projects, and approve/decline check the individual request's project. `admin` keeps blanket approval rights. Global `devops` keeps emergency-stop and cross-project visibility — only approval narrows.

**Tech Stack:** Flask 3, SQLAlchemy 2, Flask-Login, pytest, React 19 + TanStack Query, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-22-chat-intake-and-project-scoped-approvals-design.md` (Phase 1)

## Global Constraints

- **No Alembic.** This app has no migration history and no `backend/migrations/` directory. Live-schema changes follow the established pattern in `backend/seed.py`: an idempotent Postgres-only DDL list applied by a `ensure_*_columns()` function called from `main()`. On SQLite (tests, dev) `create_all()` already produces the current schema. Copy the shape of `_REQUEST_COLUMN_DDL` / `ensure_request_columns()` exactly.
- **New column name is `project_role`, not `role`.** `serializers.member_dict` already emits a `role` key holding the user's *global* role (`serializers.py:182`). Reusing the name would silently change an existing API field the frontend reads.
- **Two paths to a project.** Since commit `bbde70b`, `service` requests reach their project via `environment.project_id` and `repo` requests via `EnvironmentRequest.project_id`. `EnvironmentRequest.project` (`models/request.py:142`) resolves both in Python; SQL filters must handle both explicitly.
- **Tests run on SQLite in-memory** (`TestingConfig`, `app/config.py:87`) with `RATELIMIT_ENABLED = False`.
- Run tests with `cd backend && .venv/bin/python -m pytest tests/ -q`.

---

## File Structure

**Backend**
- `app/models/user.py` — add `ProjectMember.project_role` + `ProjectMember.ROLES`; add `User.is_project_devops()`. Membership and its predicates already live here.
- `app/blueprints/api/serializers.py` — `member_dict` gains `project_role`.
- `app/blueprints/api/approvals.py` — list filter + per-request approval check.
- `app/blueprints/api/admin.py` — member add/update accept `project_role`.
- `seed.py` — `ensure_member_columns()` DDL patch + `backfill_project_devops()`.
- `tests/test_project_scoped_approvals.py` — **new**, owns every behaviour introduced here. Keeps `test_membership.py` about *read* access and `test_request_flow.py` about the request lifecycle.

**Frontend**
- `features/admin/ProjectDetailPage.tsx` — per-member role control.
- `features/approvals/ApprovalsPage.tsx` — project column.
- `features/approvals/types.ts` — `project` on the row type.

---

### Task 1: `project_role` column and the approval predicate

**Files:**
- Modify: `backend/app/models/user.py:104-129` (`ProjectMember`), `backend/app/models/user.py:76-92` (`User`)
- Modify: `backend/app/blueprints/api/serializers.py:175-187`
- Modify: `backend/seed.py`
- Test: `backend/tests/test_project_scoped_approvals.py` (create)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ProjectMember.project_role: str` — `'developer'` (default) or `'devops'`; not null.
  - `ProjectMember.ROLES: list[str]` — `['developer', 'devops']`.
  - `User.is_project_devops(project_id: int) -> bool`.
  - `member_dict(member)` gains key `project_role: str`.
  - `seed.ensure_member_columns() -> None`, `seed.backfill_project_devops() -> None`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_project_scoped_approvals.py`:

```python
"""Approval rights are scoped to the project a request belongs to.

Membership says *who is on* a project; `project_role` says *what they are* on
it. Only a project-devops (or an admin) may approve that project's requests.
"""
from app.extensions import db
from app.models.user import ProjectMember

from conftest import login, make_user


def _member(project, user, project_role='developer'):
    """Add `user` to `project` with the given project role, or update it."""
    existing = project.members.filter_by(user_id=user.id).first()
    if existing:
        existing.project_role = project_role
        db.session.commit()
        return existing
    m = ProjectMember(project_id=project.id, user_id=user.id,
                      added_by=user.id, project_role=project_role)
    db.session.add(m)
    db.session.commit()
    return m


def test_membership_defaults_to_developer(project, users):
    member = project.members.filter_by(user_id=users['dev'].id).first()
    assert member.project_role == 'developer'


def test_project_devops_predicate(project, users):
    ops = make_user('ops2', 'devops')
    # A global devops with no project role does not gain approval rights.
    assert ops.is_project_devops(project.id) is False

    _member(project, ops, 'devops')
    assert ops.is_project_devops(project.id) is True


def test_developer_membership_grants_no_approval_rights(project, users):
    assert users['dev'].is_project_devops(project.id) is False


def test_admin_is_always_a_project_approver(project, users):
    assert users['admin'].is_project_devops(project.id) is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_project_scoped_approvals.py -q`
Expected: FAIL — `TypeError: 'project_role' is an invalid keyword argument for ProjectMember` and `AttributeError: 'User' object has no attribute 'is_project_devops'`.

- [ ] **Step 3: Add the column**

In `backend/app/models/user.py`, inside `ProjectMember`, directly after the `can_view_secrets` column:

```python
    # What this user IS on the project, independent of their global role.
    # 'devops' is what routes a request's approval here — see
    # User.is_project_devops. Defaults to 'developer' so adding a member never
    # silently grants approval rights.
    project_role = db.Column(db.String(20), default='developer', nullable=False)
```

And above the columns, next to the class docstring area:

```python
    ROLES = ['developer', 'devops']
```

- [ ] **Step 4: Add the predicate**

In `backend/app/models/user.py`, inside `User`, directly after `can_view_secrets_of`:

```python
    def is_project_devops(self, project_id):
        """True if this user may approve requests belonging to this project.

        Admins always may — they are the catch-all approver. Everyone else
        needs an explicit `project_role='devops'` membership: holding the
        global `devops` role grants operational reach (emergency stop,
        cross-project visibility) but no longer implies approval rights on a
        project nobody put you on.
        """
        from .project import Project
        if db.session.get(Project, project_id) is None:
            return False
        if self.is_admin:
            return True
        membership = self.project_memberships.filter_by(project_id=project_id).first()
        return bool(membership and membership.project_role == 'devops')
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_project_scoped_approvals.py -q`
Expected: PASS (4 passed)

- [ ] **Step 6: Expose it in the serializer**

In `backend/app/blueprints/api/serializers.py`, in `member_dict`, after the existing `'role'` key:

```python
        # 'role' above is the user's GLOBAL role; this is what they are on
        # this project.
        'project_role': member.project_role,
```

- [ ] **Step 7: Add the live-schema patch**

In `backend/seed.py`, after the `_REQUEST_COLUMN_DDL` block:

```python
# Added to project_members after the table already shipped. Same reasoning as
# _REQUEST_COLUMN_DDL above: no Alembic history, so patch the live schema
# idempotently. Postgres only.
_MEMBER_COLUMN_DDL = [
    "ALTER TABLE project_members ADD COLUMN IF NOT EXISTS "
    "project_role VARCHAR(20) NOT NULL DEFAULT 'developer'",
]


def ensure_member_columns():
    """Idempotently add the project_role column to an existing table (Postgres)."""
    if db.engine.dialect.name != 'postgresql':
        print('  schema: non-postgres, create_all() owns the schema — skipping patch')
        return
    with db.engine.begin() as conn:
        for stmt in _MEMBER_COLUMN_DDL:
            conn.execute(text(stmt))
    print('  schema: project_members project_role ensured')
```

- [ ] **Step 8: Add the backfill**

Still in `backend/seed.py`, after `ensure_member_columns()`:

```python
def backfill_project_devops():
    """Give every existing global-devops user project-devops on every project.

    Before this change any devops could approve anything. Without a backfill
    the upgrade would empty every approval inbox on deploy and strand pending
    requests. Idempotent: it only adds what is missing, and never demotes.
    """
    from app.models.user import ProjectMember

    devops_users = [u for u in User.query.all() if u.role.name == 'devops']
    if not devops_users:
        print('  members: no global devops users to backfill')
        return

    added = promoted = 0
    for project in Project.query.filter_by(is_active=True).all():
        for user in devops_users:
            member = ProjectMember.query.filter_by(
                project_id=project.id, user_id=user.id).first()
            if member is None:
                db.session.add(ProjectMember(
                    project_id=project.id, user_id=user.id,
                    added_by=user.id, project_role='devops'))
                added += 1
            elif member.project_role != 'devops':
                member.project_role = 'devops'
                promoted += 1
    db.session.commit()
    print(f'  members: project-devops backfilled ({added} added, {promoted} promoted)')
```

- [ ] **Step 9: Call both from `main()`**

In `backend/seed.py`, in `main()`, immediately after the existing `ensure_request_columns()` call:

```python
        ensure_member_columns()
        backfill_project_devops()
```

`backfill_project_devops()` must run *after* `seed_roles()` and `seed_admin(app)` so the roles it reads exist.

- [ ] **Step 10: Run the full suite**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: PASS — all pre-existing tests plus the 4 new ones.

- [ ] **Step 11: Commit**

```bash
git add backend/app/models/user.py backend/app/blueprints/api/serializers.py \
        backend/seed.py backend/tests/test_project_scoped_approvals.py
git commit -m "feat: add ProjectMember.project_role and is_project_devops predicate"
```

---

### Task 2: Scope the approvals list

**Files:**
- Modify: `backend/app/blueprints/api/approvals.py:20-38` (`approvals_list`)
- Test: `backend/tests/test_project_scoped_approvals.py`

**Interfaces:**
- Consumes: `User.is_project_devops`, `ProjectMember.project_role` (Task 1).
- Produces: `approvals._approvable_project_ids(user) -> list[int] | None` — `None` means "no filter, sees everything" (admin only). Task 3 reuses it.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_project_scoped_approvals.py`:

```python
from datetime import datetime, timedelta

from app.models.project import Project
from app.models.environment import Environment
from app.models.request import EnvironmentRequest


def _second_project(users):
    """A second project with its own environment, so scoping is observable."""
    p = Project(name='Other', slug='other', cloud_provider='aws', mode='mock',
                created_by=users['admin'].id)
    p.set_provider_config({'region': 'us-east-1'})
    db.session.add(p)
    db.session.flush()
    env = Environment(project_id=p.id, name='dev', display_name='Dev')
    db.session.add(env)
    db.session.commit()
    return p


def _service_request(env_id, requester_id):
    start = datetime.now() + timedelta(hours=2)
    req = EnvironmentRequest(
        requester_id=requester_id, request_type='service', environment_id=env_id,
        start_time=start, end_time=start + timedelta(hours=1),
        reason='scoping fixture')
    db.session.add(req)
    db.session.commit()
    return req


def _repo_request(project_id, requester_id):
    req = EnvironmentRequest(
        requester_id=requester_id, request_type='repo', project_id=project_id,
        action_type='create_repo', repo_name='billing-svc',
        repo_visibility='private', reason='scoping fixture')
    db.session.add(req)
    db.session.commit()
    return req


def test_approvals_list_shows_only_your_projects(client, project, users):
    other = _second_project(users)
    mine = _service_request(project.environments.first().id, users['dev'].id)
    theirs = _service_request(other.environments.first().id, users['dev'].id)

    ops = make_user('ops2', 'devops')
    _member(project, ops, 'devops')

    login(client, 'ops2')
    ids = {r['id'] for r in client.get('/api/v1/approvals').get_json()['requests']}
    assert mine.id in ids
    assert theirs.id not in ids


def test_approvals_list_includes_repo_requests_of_your_projects(client, project, users):
    other = _second_project(users)
    mine = _repo_request(project.id, users['dev'].id)
    theirs = _repo_request(other.id, users['dev'].id)

    ops = make_user('ops2', 'devops')
    _member(project, ops, 'devops')

    login(client, 'ops2')
    ids = {r['id'] for r in client.get('/api/v1/approvals').get_json()['requests']}
    assert mine.id in ids
    assert theirs.id not in ids


def test_admin_sees_every_project(client, project, users):
    other = _second_project(users)
    mine = _service_request(project.environments.first().id, users['dev'].id)
    theirs = _service_request(other.environments.first().id, users['dev'].id)

    login(client, 'admin')
    ids = {r['id'] for r in client.get('/api/v1/approvals').get_json()['requests']}
    assert {mine.id, theirs.id} <= ids


def test_devops_with_no_project_role_sees_an_empty_inbox(client, project, users):
    _service_request(project.environments.first().id, users['dev'].id)
    login(client, 'ops')          # global devops, no project_role anywhere
    assert client.get('/api/v1/approvals').get_json()['requests'] == []


def test_plain_developer_is_denied_the_approvals_list(client, project, users):
    login(client, 'dev')
    assert client.get('/api/v1/approvals').status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_project_scoped_approvals.py -q`
Expected: FAIL — `test_approvals_list_shows_only_your_projects` and `test_devops_with_no_project_role_sees_an_empty_inbox` fail because the endpoint still returns every request.

- [ ] **Step 3: Add the project-id helper**

In `backend/app/blueprints/api/approvals.py`, add to the imports:

```python
from sqlalchemy import or_
```

and after the `logger = ...` line:

```python
def _approvable_project_ids(user):
    """Projects whose requests this user may see and act on.

    Returns None for an unrestricted view (admins only). An empty list means a
    genuinely empty inbox — a devops nobody has added to a project yet.
    """
    if user.is_admin:
        return None
    return [m.project_id for m in
            user.project_memberships.filter_by(project_role='devops').all()]
```

- [ ] **Step 4: Apply the filter**

Replace the body of `approvals_list` (`approvals.py:20-38`) with:

```python
@api_bp.route('/approvals')
@login_required
@devops_required
def approvals_list():
    status = request.args.get('status', 'pending')
    query = EnvironmentRequest.query

    if status == 'pending':
        query = query.filter_by(status='pending')
    elif status == 'all':
        pass
    else:
        query = query.filter_by(status=status)

    # A service request reaches its project through its environment; a repo
    # request carries a direct project_id. Both must be scoped.
    project_ids = _approvable_project_ids(current_user)
    if project_ids is not None:
        query = query.filter(or_(
            EnvironmentRequest.environment.has(Environment.project_id.in_(project_ids)),
            EnvironmentRequest.project_id.in_(project_ids),
        )) if project_ids else query.filter(db.false())

    requests_list = query.order_by(EnvironmentRequest.created_at.desc()).all()

    return jsonify({
        'requests': [request_dict(r) for r in requests_list],
        'statuses': EnvironmentRequest.STATUSES,
    })
```

`@devops_required` stays: it keeps plain developers out entirely, and the new filter narrows within that.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_project_scoped_approvals.py -q`
Expected: PASS (9 passed)

- [ ] **Step 6: Run the full suite**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: PASS. If a pre-existing test logged in as `ops` and asserted it could see a request, update it to give `ops` a `project_role='devops'` membership — that is the intended behaviour change, not a regression.

- [ ] **Step 7: Commit**

```bash
git add backend/app/blueprints/api/approvals.py backend/tests/test_project_scoped_approvals.py
git commit -m "feat: scope the approvals inbox to the caller's projects"
```

---

### Task 3: Scope approve and decline

**Files:**
- Modify: `backend/app/blueprints/api/approvals.py` (the `approve` and `decline` view functions)
- Test: `backend/tests/test_project_scoped_approvals.py`

**Interfaces:**
- Consumes: `User.is_project_devops` (Task 1), `_approvable_project_ids` (Task 2).
- Produces: `approvals._require_project_approver(env_request) -> Response | None` — returns a 403 response to return early, or `None` to proceed.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_project_scoped_approvals.py`:

```python
def test_cannot_approve_another_projects_request_by_id(client, project, users):
    other = _second_project(users)
    theirs = _service_request(other.environments.first().id, users['dev'].id)

    ops = make_user('ops2', 'devops')
    _member(project, ops, 'devops')

    login(client, 'ops2')
    assert client.post(f'/api/v1/approvals/{theirs.id}/approve',
                       json={'comment': 'sneaking in'}).status_code == 403
    assert client.post(f'/api/v1/approvals/{theirs.id}/decline',
                       json={'comment': 'sneaking in'}).status_code == 403


def test_cannot_approve_another_projects_repo_request_by_id(client, project, users):
    other = _second_project(users)
    theirs = _repo_request(other.id, users['dev'].id)

    ops = make_user('ops2', 'devops')
    _member(project, ops, 'devops')

    login(client, 'ops2')
    assert client.post(f'/api/v1/approvals/{theirs.id}/approve',
                       json={'provider': 'github'}).status_code == 403


def test_project_devops_can_approve_their_own_projects_request(client, project, users):
    mine = _service_request(project.environments.first().id, users['dev'].id)

    ops = make_user('ops2', 'devops')
    _member(project, ops, 'devops')

    login(client, 'ops2')
    resp = client.post(f'/api/v1/approvals/{mine.id}/approve', json={'comment': 'ok'})
    assert resp.status_code == 200
    assert db.session.get(EnvironmentRequest, mine.id).status != 'pending'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_project_scoped_approvals.py -q`
Expected: FAIL — the cross-project approve returns 200, not 403.

- [ ] **Step 3: Add the guard helper**

In `backend/app/blueprints/api/approvals.py`, after `_approvable_project_ids`:

```python
def _require_project_approver(env_request):
    """403 unless the caller may approve this specific request.

    Scoping the list is not enough on its own — without this a devops could
    act on any other project's request by guessing its id.
    """
    project = env_request.project
    if project is None or not current_user.is_project_devops(project.id):
        return jsonify({'error': 'You do not approve requests on this project.'}), 403
    return None
```

- [ ] **Step 4: Guard both endpoints**

In `approve`, as the first statement after `env_request = _get_or_404(EnvironmentRequest, request_id)`:

```python
    denied = _require_project_approver(env_request)
    if denied:
        return denied
```

Add the identical three lines to `decline`, in the same position. Placing the check before the `status != 'pending'` test means a cross-project caller learns nothing about the request's state.

The repo path needs no separate guard: `_approve_repo_request` is only reached from inside `approve`, after this check.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_project_scoped_approvals.py -q`
Expected: PASS (12 passed)

- [ ] **Step 6: Run the full suite**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/blueprints/api/approvals.py backend/tests/test_project_scoped_approvals.py
git commit -m "feat: check the project on approve and decline"
```

---

### Task 4: Admin can set a member's project role

**Files:**
- Modify: `backend/app/blueprints/api/admin.py:450-505` (`admin_member_add`, `admin_member_update`)
- Test: `backend/tests/test_project_scoped_approvals.py`

**Interfaces:**
- Consumes: `ProjectMember.ROLES`, `ProjectMember.project_role` (Task 1).
- Produces: `POST /admin/projects/<pid>/members` accepts optional `project_role`; `PUT /admin/projects/<pid>/members/<mid>` accepts `can_view_secrets` and/or `project_role`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_project_scoped_approvals.py`:

```python
def test_admin_can_add_a_member_as_project_devops(client, project, users):
    make_user('ops2', 'devops')
    login(client, 'admin')

    resp = client.post(f'/api/v1/admin/projects/{project.id}/members',
                       json={'username': 'ops2', 'project_role': 'devops'})
    assert resp.status_code == 201
    assert resp.get_json()['project_role'] == 'devops'


def test_admin_can_change_a_members_project_role(client, project, users):
    member = project.members.filter_by(user_id=users['dev'].id).first()
    login(client, 'admin')

    resp = client.put(f'/api/v1/admin/projects/{project.id}/members/{member.id}',
                      json={'project_role': 'devops'})
    assert resp.status_code == 200
    assert resp.get_json()['project_role'] == 'devops'


def test_an_unknown_project_role_is_rejected(client, project, users):
    member = project.members.filter_by(user_id=users['dev'].id).first()
    login(client, 'admin')

    resp = client.put(f'/api/v1/admin/projects/{project.id}/members/{member.id}',
                      json={'project_role': 'superuser'})
    assert resp.status_code == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_project_scoped_approvals.py -q`
Expected: FAIL — `project_role` is ignored on add, and the PUT returns 400 "Nothing to update."

- [ ] **Step 3: Accept the role on add**

In `backend/app/blueprints/api/admin.py`, in `admin_member_add`, replace the `member = ProjectMember(...)` construction with:

```python
    project_role = (data.get('project_role') or 'developer').strip().lower()
    if project_role not in ProjectMember.ROLES:
        return jsonify({'error': f'Role must be one of: {", ".join(ProjectMember.ROLES)}.'}), 400

    member = ProjectMember(project_id=project.id, user_id=user.id,
                           added_by=current_user.id, project_role=project_role)
```

Keep every other line of the function — including the existing `AuditLog.log('member_added', ...)` call — as it is, but add `'project_role': project_role` to that call's `details` dict.

- [ ] **Step 4: Accept the role on update**

Replace the body of `admin_member_update` after `if member.project_id != pid:` with:

```python
    data = request.get_json(silent=True) or {}
    if 'can_view_secrets' not in data and 'project_role' not in data:
        return jsonify({'error': 'Nothing to update.'}), 400

    if 'project_role' in data:
        project_role = (data.get('project_role') or '').strip().lower()
        if project_role not in ProjectMember.ROLES:
            return jsonify({'error': f'Role must be one of: {", ".join(ProjectMember.ROLES)}.'}), 400
        member.project_role = project_role

    if 'can_view_secrets' in data:
        member.can_view_secrets = bool(data['can_view_secrets'])

    db.session.commit()

    AuditLog.log('member_permission_updated', 'project', pid,
                 user_id=current_user.id, ip_address=request.remote_addr,
                 details={'username': member.user.username,
                          'can_view_secrets': member.can_view_secrets,
                          'project_role': member.project_role})
    return jsonify(member_dict(member))
```

Also update the docstring to `"""Update this member's project role and/or their permission to reveal project secrets."""`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_project_scoped_approvals.py -q`
Expected: PASS (15 passed)

- [ ] **Step 6: Run the full suite**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/blueprints/api/admin.py backend/tests/test_project_scoped_approvals.py
git commit -m "feat: admin sets a member's project role"
```

---

### Task 5: Surface the role and the project

**Files:**
- Modify: `frontend/src/features/admin/ProjectDetailPage.tsx:199-215` (mutations), `:328-370` (members table)
- Modify: `frontend/src/features/approvals/ApprovalsPage.tsx`
- Modify: `frontend/src/features/approvals/types.ts`

**Interfaces:**
- Consumes: `project_role` on `member_dict` (Task 1), the member endpoints (Task 4), the scoped approvals list (Task 2).
- Produces: no backend interface.

- [ ] **Step 1: Add the mutation**

In `ProjectDetailPage.tsx`, directly after the existing `setMemberSecrets` mutation:

```tsx
  const setMemberRole = useMutation({
    mutationFn: ({ mid, project_role }: { mid: number; project_role: string }) =>
      api.put(`/admin/projects/${id}/members/${mid}`, { project_role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', id] })
      notify('Member role updated.', 'success')
    },
  })
```

Match the `onSuccess`/`onError` shape of `setMemberSecrets` exactly — copy its error handler verbatim rather than inventing one.

- [ ] **Step 2: Add the control to the members table**

In the members table body (around `ProjectDetailPage.tsx:346`), add a cell alongside the existing `can_view_secrets` checkbox cell:

```tsx
                  <TCell>
                    <Select
                      value={m.project_role}
                      onChange={(e) =>
                        setMemberRole.mutate({ mid: m.id, project_role: e.target.value })
                      }
                    >
                      <option value="developer">Developer</option>
                      <option value="devops">DevOps (approves)</option>
                    </Select>
                  </TCell>
```

Add a matching `Project Role` header to that table's `THead`. `Select` is already imported in this file's sibling pages from `../../components/ui/Input` — add it to this file's import from the same module if absent.

- [ ] **Step 3: Add `project_role` to the member type**

Find the member interface used by `ProjectDetailPage` (it is declared in that file or in a sibling `types.ts`) and add:

```ts
  project_role: string
```

- [ ] **Step 4: Show the project on approvals rows**

In `frontend/src/features/approvals/types.ts`, add to `ApprovalRequest`:

```ts
  project: string | null
```

Confirm `request_dict` already emits a project name; if it does not, add `'project': req.project.name if req.project else None` to `serializers.request_dict` and commit that with this step.

In `ApprovalsPage.tsx`, add a `Project` column to the table header and `<TCell>{r.project ?? '—'}</TCell>` to each row. The inbox now mixes projects only for admins, but the column is what makes that legible.

- [ ] **Step 5: Verify the build**

Run: `cd frontend && npm run build`
Expected: no TypeScript errors.

- [ ] **Step 6: Verify by hand**

Run the stack (`cd backend && .venv/bin/python run.py`, `cd frontend && npm run dev`), then:
1. As `admin`, open a project and set a devops user's project role to DevOps.
2. Log in as that user — the approvals inbox shows that project's pending requests and nothing else.
3. Log in as a devops user with no project role — the inbox is empty.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/admin/ProjectDetailPage.tsx \
        frontend/src/features/approvals/ApprovalsPage.tsx \
        frontend/src/features/approvals/types.ts
git commit -m "feat: project role control and project column in approvals"
```

---

### Task 6: Document the behaviour change

**Files:**
- Modify: `README.md` (the "Roles" line under Concepts)

- [ ] **Step 1: Update the roles description**

Replace the existing roles paragraph with:

```markdown
Roles: **developer** raises requests on projects they're a member of ·
**devops** operates environments and can emergency-stop · **admin** manages
projects, users and secrets.

Approval is **project-scoped**: a request is approved by the members whose
`project_role` on that project is `devops`, or by any admin. Holding the global
`devops` role grants operational reach but not approval rights — an admin adds
you to a project as DevOps. Upgrading an existing deployment backfills every
global-devops user as project-devops on every active project, so no inbox
empties on deploy.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: describe project-scoped approval"
```

---

## Self-Review

**Spec coverage:** Model (Task 1) · authz predicate (Task 1) · approvals list filter incl. both request types (Task 2) · per-request approve/decline check incl. repo path (Task 3) · migration safety / backfill (Task 1, steps 7-9) · surface (Task 5) · unchanged emergency-stop and visibility (asserted implicitly by the untouched full suite in Tasks 2, 3, 4) · every listed test case (Tasks 1-4). Documented in Task 6.

**Naming consistency:** `project_role` is the column, the JSON key, and the request-body field throughout. `is_project_devops` is the only predicate. `_approvable_project_ids` and `_require_project_approver` are defined in Task 2 and Task 3 respectively and used only after definition.

**Deviation from the spec:** the spec said "Alembic migration". There is no `backend/migrations/` directory and no Alembic history in this repo; `seed.py` already carries an established idempotent-DDL pattern (`ensure_request_columns`) for exactly this situation. Task 1 follows that pattern instead. The backfill requirement is unchanged — it just runs in `seed.py` rather than in a migration.
