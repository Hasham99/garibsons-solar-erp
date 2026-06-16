"use client"

import { useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Modal } from "@/components/ui/Modal"
import { Table } from "@/components/ui/Table"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu"
import { PermissionMatrix } from "@/components/permissions/PermissionMatrix"
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react"
import toast from "react-hot-toast"
import type { PermMap } from "@/lib/permissions/modules"

interface RolePermissionRow {
  module: string
  canRead: boolean
  canWrite: boolean
}

interface Role {
  id: string
  title: string
  description: string | null
  fullAccess: boolean
  isSystem: boolean
  permissions: RolePermissionRow[]
  _count: { users: number }
}

interface RoleForm {
  title: string
  description: string
  fullAccess: boolean
  perms: PermMap
}

const emptyForm: RoleForm = { title: "", description: "", fullAccess: false, perms: {} }

function rowsToPermMap(rows: RolePermissionRow[]): PermMap {
  const map: PermMap = {}
  for (const r of rows) map[r.module] = { read: r.canRead, write: r.canWrite }
  return map
}

export default function RolesPage() {
  const { data: roles, loading, refetch } = useFetch<Role[]>("/api/roles")
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<RoleForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openCreate = () => {
    setEditId(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  const openEdit = (role: Role) => {
    setEditId(role.id)
    setForm({
      title: role.title,
      description: role.description ?? "",
      fullAccess: role.fullAccess,
      perms: rowsToPermMap(role.permissions),
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("Role title is required")
      return
    }
    setSaving(true)
    try {
      const url = editId ? `/api/roles/${editId}` : "/api/roles"
      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          fullAccess: form.fullAccess,
          permissions: form.perms,
        }),
      })
      if (res.ok) {
        toast.success(editId ? "Role updated" : "Role created")
        setShowModal(false)
        refetch()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to save role")
      }
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/roles/${deleteTarget.id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Role deleted")
        setDeleteTarget(null)
        refetch()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to delete role")
      }
    } finally {
      setDeleting(false)
    }
  }

  const rowActions = (role: Role): RowAction[] => {
    const actions: RowAction[] = [{ label: "Edit", icon: <Pencil size={15} />, onClick: () => openEdit(role) }]
    if (!role.isSystem) {
      actions.push({ label: "Delete", icon: <Trash2 size={15} />, danger: true, onClick: () => setDeleteTarget(role) })
    }
    return actions
  }

  const columns = [
    {
      key: "title",
      header: "Role",
      sortable: true,
      render: (row: Role) => (
        <div className="flex items-center gap-2">
          <ShieldCheck size={15} className="text-tertiary" />
          <span className="font-medium text-foreground">{row.title}</span>
          {row.isSystem && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-secondary">SYSTEM</span>
          )}
        </div>
      ),
    },
    { key: "description", header: "Description", render: (row: Role) => row.description || "—" },
    {
      key: "access",
      header: "Access",
      render: (row: Role) =>
        row.fullAccess ? (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Full Access</span>
        ) : (
          <span className="text-xs text-secondary">{row.permissions.filter((p) => p.canRead || p.canWrite).length} modules</span>
        ),
    },
    { key: "users", header: "Users", numeric: true, render: (row: Role) => row._count.users },
    {
      key: "actions",
      header: "Actions",
      render: (row: Role) => <RowActionsMenu actions={rowActions(row)} />,
    },
  ]

  if (loading) return <TableSkeleton columns={5} rows={6} />

  return (
    <div className="space-y-6 animate-fade-in-up">
      <Header
        title="Roles & Permissions"
        breadcrumbs={[{ label: "Settings" }, { label: "Roles" }]}
        actions={
          <Button onClick={openCreate}>
            <Plus size={16} className="mr-2" />
            New Role
          </Button>
        }
      />
      <div className="bg-surface rounded-xl shadow-card border border-line">
        <Table columns={columns} data={roles || []} emptyMessage="No roles yet" searchPlaceholder="Search roles…" />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? "Edit Role" : "New Role"} size="lg">
        <div className="space-y-4">
          <Input
            label="Role Title"
            required
            placeholder="e.g. Sales Manager"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <Input
            label="Description (optional)"
            placeholder="What this role is for"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div>
            <p className="text-sm font-medium text-secondary mb-2">Permissions</p>
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
              {editId ? "Update Role" : "Create Role"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Role"
        message={<>Delete role <span className="font-semibold text-foreground">&ldquo;{deleteTarget?.title}&rdquo;</span>? This cannot be undone.</>}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
