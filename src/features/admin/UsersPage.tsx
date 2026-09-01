import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import type { User } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Card, CardBody } from '../../components/ui/Card'
import { Field, Input, Select } from '../../components/ui/Input'
import { Modal, ConfirmDialog } from '../../components/ui/Modal'
import { Table, THead, TRow, TCell } from '../../components/ui/Table'
import { EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui/Page'
import { useToast } from '../../components/ui/Toast'

interface RoleOption {
  value: string
  label: string
}

interface UsersResponse {
  users: User[]
  roles: RoleOption[]
}

/** Blank form state — also what "Add user" resets to. */
const EMPTY = { username: '', email: '', password: '', role: 'developer' }

export function UsersPage() {
  const qc = useQueryClient()
  const { notify } = useToast()
  const [open, setOpen] = useState(false)
  /** null = creating; a User = editing that user. */
  const [editing, setEditing] = useState<User | null>(null)
  const [form, setForm] = useState(EMPTY)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get<UsersResponse>('/admin/users'),
  })

  const users = data?.users ?? []
  const roles = data?.roles ?? []

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY, role: roles[0]?.value ?? 'developer' })
    setOpen(true)
  }

  function openEdit(user: User) {
    setEditing(user)
    // Password stays blank on edit: submitting blank leaves it unchanged.
    setForm({ username: user.username, email: user.email, password: '', role: user.role })
    setOpen(true)
  }

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.put<User>(`/admin/users/${editing.id}`, {
            email: form.email,
            role: form.role,
            ...(form.password ? { password: form.password } : {}),
          })
        : api.post<User>('/admin/users', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      notify(editing ? 'User updated.' : 'User created.', 'success')
      setOpen(false)
    },
    onError: (err) => notify(err instanceof ApiError ? err.message : 'Save failed.', 'danger'),
  })

  const toggleActive = useMutation({
    mutationFn: (user: User) =>
      api.put<User>(`/admin/users/${user.id}`, { is_active: !user.is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      notify('User updated.', 'success')
    },
    onError: (err) => notify(err instanceof ApiError ? err.message : 'Update failed.', 'danger'),
  })

  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const resetMfa = useMutation({
    mutationFn: (user: User) => api.post<User>(`/admin/users/${user.id}/reset-mfa`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      notify('MFA reset. The user will re-enroll on their next login.', 'success')
      setResetTarget(null)
    },
    onError: (err) => notify(err instanceof ApiError ? err.message : 'Reset failed.', 'danger'),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Developers raise requests, DevOps approve them, Admins manage projects."
        action={
          <Button onClick={openCreate}>
            <UserPlus size={15} /> Add user
          </Button>
        }
      />

      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <Spinner />
          ) : isError ? (
            <ErrorState message="Could not load users." />
          ) : users.length === 0 ? (
            <EmptyState message="No users yet." />
          ) : (
            <Table>
              <THead columns={['User', 'Email', 'Role', 'MFA', 'Status', '']} />
              <tbody>
                {users.map((user) => (
                  <TRow key={user.id}>
                    <TCell className="font-medium">{user.username}</TCell>
                    <TCell className="text-text-secondary">{user.email}</TCell>
                    <TCell>
                      <Badge tone={user.is_admin ? 'warning' : user.is_devops ? 'info' : 'neutral'}>
                        {user.role}
                      </Badge>
                    </TCell>
                    <TCell>
                      <Badge tone={user.mfa_enabled ? 'success' : 'neutral'}>
                        {user.mfa_enabled ? 'Enrolled' : 'Not set up'}
                      </Badge>
                    </TCell>
                    <TCell>
                      <Badge tone={user.is_active ? 'success' : 'neutral'}>
                        {user.is_active ? 'Active' : 'Disabled'}
                      </Badge>
                    </TCell>
                    <TCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(user)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!user.mfa_enabled || resetMfa.isPending}
                          onClick={() => setResetTarget(user)}
                        >
                          Reset MFA
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={toggleActive.isPending}
                          onClick={() => toggleActive.mutate(user)}
                        >
                          {user.is_active ? 'Disable' : 'Enable'}
                        </Button>
                      </div>
                    </TCell>
                  </TRow>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.username}` : 'Add user'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {!editing && (
            <Field label="Username">
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                autoFocus
              />
            </Field>
          )}

          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>

          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={editing ? 'New password' : 'Password'}
            hint={editing ? 'Leave blank to keep the current password.' : 'At least 8 characters.'}
          >
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="new-password"
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={resetTarget !== null}
        title="Reset MFA"
        message={
          resetTarget
            ? `Reset MFA for ${resetTarget.username}? They'll be prompted to enroll a new authenticator on their next login.`
            : ''
        }
        confirmLabel="Reset MFA"
        danger
        pending={resetMfa.isPending}
        onCancel={() => setResetTarget(null)}
        onConfirm={() => resetTarget && resetMfa.mutate(resetTarget)}
      />
    </div>
  )
}
