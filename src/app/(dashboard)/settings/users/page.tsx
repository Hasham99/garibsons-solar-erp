"use client"

import { useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Modal } from "@/components/ui/Modal"
import { Table } from "@/components/ui/Table"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu"
import { DetailsModal } from "@/components/ui/DetailsModal"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { PermissionMatrix } from "@/components/permissions/PermissionMatrix"
import { useAuth, accessOf } from "@/hooks/useAuth"
import { formatDate } from "@/lib/utils"
import { Plus, Pencil, Trash2 } from "lucide-react"
import toast from "react-hot-toast"
import { can, type PermMap } from "@/lib/permissions/modules"

interface PermRow {
  module: string
  canRead: boolean
  canWrite: boolean
}

interface User {
  id: string
  name: string
  email: string
  active: boolean
  createdAt: string
  fullAccess: boolean
  roleId: string | null
  roleRef: { id: string; title: string } | null
  permissions: PermRow[]
}

interface Role {
  id: string
  title: string
  fullAccess: boolean
  permissions: PermRow[]
}

interface UserForm {
  name: string
  email: string
  password: string
  active: boolean
  roleId: string
  fullAccess: boolean
  perms: PermMap
}

const emptyForm: UserForm = { name: "", email: "", password: "", active: true, roleId: "", fullAccess: false, perms: {} }

function rowsToPermMap(rows: PermRow[]): PermMap {
  const map: PermMap = {}
  for (const r of rows) map[r.module] = { read: r.canRead, write: r.canWrite }
  return map
}

/** Reconstruct the effective permissions = role defaults overridden by user rows. */
function effectivePerms(role: Role | undefined, overrides: PermRow[]): PermMap {
  const map = role ? rowsToPermMap(role.permissions) : {}
  for (const o of overrides) {
    if (o.canRead || o.canWrite) map[o.module] = { read: o.canRead, write: o.canWrite }
    else delete map[o.module]
  }
  return map
}

export default function UsersPage() {
  const { data: users, loading, refetch } = useFetch<User[]>("/api/users")
  const { data: roles } = useFetch<Role[]>("/api/roles")
  const { user: me } = useAuth()
  const canManage = can(accessOf(me), "settings.users", "write")
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<UserForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [detailRow, setDetailRow] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [deleting, setDeleting] = useState(false)

  const roleList = roles || []
  const findRole = (id: string) => roleList.find((r) => r.id === id)

  const handleRoleChange = (roleId: string) => {
    const role = findRole(roleId)
    // Selecting a role prefills the matrix with that role's defaults.
    setForm((f) => ({
      ...f,
      roleId,
      fullAccess: role?.fullAccess ?? false,
      perms: role ? rowsToPermMap(role.permissions) : {},
    }))
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Name and email are required")
      return
    }
    if (!form.roleId) {
      toast.error("Please select a role")
      return
    }
    if (!editId && !form.password) {
      toast.error("Password is required")
      return
    }
    setSaving(true)
    try {
      const url = editId ? `/api/users/${editId}` : "/api/users"
      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password || undefined,
          active: form.active,
          roleId: form.roleId,
          fullAccess: form.fullAccess,
          permissions: form.perms,
        }),
      })
      if (res.ok) {
        toast.success(editId ? "User updated" : "User created")
        setShowModal(false)
        refetch()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to save user")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (u: User) => {
    setEditId(u.id)
    const role = u.roleId ? findRole(u.roleId) : undefined
    setForm({
      name: u.name,
      email: u.email,
      password: "",
      active: u.active,
      roleId: u.roleId ?? "",
      fullAccess: u.fullAccess,
      perms: effectivePerms(role, u.permissions),
    })
    setShowModal(true)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("User deleted")
        setDeleteTarget(null)
        refetch()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to delete user")
      }
    } finally {
      setDeleting(false)
    }
  }

  const userRowActions = (row: User): RowAction[] => {
    const actions: RowAction[] = [{ label: "Edit", icon: <Pencil size={15} />, onClick: () => handleEdit(row) }]
    // Managers can delete anyone but themselves.
    if (canManage && row.id !== me?.id) {
      actions.push({ label: "Delete", icon: <Trash2 size={15} />, danger: true, onClick: () => setDeleteTarget(row) })
    }
    return actions
  }

  const roleLabel = (row: User) => (row.fullAccess ? "Full Access" : row.roleRef?.title || "—")

  const columns = [
    { key: "name", header: "Name", sortable: true },
    { key: "createdAt", header: "Created", numeric: true, render: (row: User) => formatDate(row.createdAt) },
    { key: "email", header: "Email" },
    {
      key: "role",
      header: "Role",
      render: (row: User) => (
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            row.fullAccess ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
          }`}
        >
          {roleLabel(row)}
        </span>
      ),
    },
    {
      key: "active",
      header: "Status",
      render: (row: User) => (
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            row.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
          }`}
        >
          {row.active ? "Active" : "Inactive"}
        </span>
      ),
    },
    { key: "actions", header: "Actions", render: (row: User) => <RowActionsMenu actions={userRowActions(row)} /> },
  ]

  if (loading) return <TableSkeleton columns={6} rows={6} />

  return (
    <div className="space-y-6 animate-fade-in-up">
      <DetailsModal
        isOpen={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title={`User — ${detailRow?.name || ""}`}
        fields={
          detailRow
            ? [
                { label: "Email", value: detailRow.email },
                { label: "Role", value: roleLabel(detailRow) },
                { label: "Status", value: detailRow.active ? "Active" : "Inactive" },
                { label: "Created", value: formatDate(detailRow.createdAt) },
              ]
            : []
        }
        actions={detailRow ? userRowActions(detailRow) : []}
      />
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete User"
        message={
          <>
            Delete <span className="font-semibold text-slate-800">{deleteTarget?.name}</span> ({deleteTarget?.email})?
            This permanently removes their account and access. Records they created are kept. This cannot be undone.
          </>
        }
        confirmLabel="Delete User"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
      <Header
        title="Users"
        breadcrumbs={[{ label: "Settings" }, { label: "Users" }]}
        actions={
          <Button
            onClick={() => {
              setEditId(null)
              setForm(emptyForm)
              setShowModal(true)
            }}
          >
            <Plus size={16} className="mr-2" />
            Add User
          </Button>
        }
      />
      <div className="bg-white rounded-xl shadow-card border border-slate-200/70">
        <Table
          columns={columns}
          data={users || []}
          emptyMessage="No users found"
          onRowClick={(row: User) => setDetailRow(row)}
          searchPlaceholder="Search name, email…"
          filters={[
            { key: "role", label: "Role", value: (row: User) => roleLabel(row) },
            { key: "active", label: "Status", value: (row: User) => (row.active ? "Active" : "Inactive") },
          ]}
        />
      </div>
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? "Edit User" : "Add User"} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Full Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={editId ? "New Password (blank = keep)" : "Password"}
              type="password"
              required={!editId}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <Select label="Role Title" value={form.roleId} onChange={(e) => handleRoleChange(e.target.value)}>
              <option value="">Select a role…</option>
              {roleList.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                  {r.fullAccess ? " (Full Access)" : ""}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="active"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            <label htmlFor="active" className="text-sm text-gray-700">
              Active
            </label>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-1">Permissions</p>
            <p className="text-xs text-slate-400 mb-2">
              Pre-filled from the selected role. Adjust any checkbox to override this user&apos;s access.
            </p>
            <PermissionMatrix
              value={form.perms}
              fullAccess={form.fullAccess}
              onChange={(perms) => setForm({ ...form, perms })}
              onFullAccessChange={(fullAccess) => setForm({ ...form, fullAccess })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {editId ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
