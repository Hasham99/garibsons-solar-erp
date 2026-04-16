"use client"

import { useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Modal } from "@/components/ui/Modal"
import { Table } from "@/components/ui/Table"
import { LoadingPage } from "@/components/ui/Spinner"
import { formatDate } from "@/lib/utils"
import { Plus, Pencil } from "lucide-react"
import toast, { Toaster } from "react-hot-toast"

interface User {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  createdAt: string
}

const emptyForm = { name: "", email: "", password: "", role: "VIEWER", active: true }

export default function UsersPage() {
  const { data: users, loading, refetch } = useFetch<User[]>("/api/users")
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<typeof emptyForm & { active: boolean }>(emptyForm)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const url = editId ? `/api/users/${editId}` : "/api/users"
      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
    setForm({ name: u.name, email: u.email, password: "", role: u.role, active: u.active })
    setShowModal(true)
  }

  const columns = [
    { key: "name", header: "Name", sortable: true },
    { key: "email", header: "Email" },
    { key: "role", header: "Role", render: (row: User) => (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{row.role}</span>
    )},
    { key: "active", header: "Status", render: (row: User) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${row.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
        {row.active ? "Active" : "Inactive"}
      </span>
    )},
    { key: "createdAt", header: "Created", render: (row: User) => formatDate(row.createdAt) },
    { key: "actions", header: "Actions", render: (row: User) => (
      <Button size="sm" variant="ghost" onClick={() => handleEdit(row)}><Pencil size={14} /></Button>
    )},
  ]

  if (loading) return <LoadingPage />

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <Header title="Users" breadcrumbs={[{ label: "Settings" }, { label: "Users" }]}
        actions={<Button onClick={() => { setEditId(null); setForm(emptyForm); setShowModal(true) }}><Plus size={16} className="mr-2" />Add User</Button>}
      />
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <Table columns={columns} data={(users || [])} emptyMessage="No users found" />
      </div>
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? "Edit User" : "Add User"}>
        <div className="space-y-4">
          <Input label="Full Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label={editId ? "New Password (leave blank to keep current)" : "Password"} type="password" required={!editId} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="ADMIN">Admin</option>
            <option value="PROCUREMENT">Procurement</option>
            <option value="WAREHOUSE">Warehouse</option>
            <option value="SALES">Sales</option>
            <option value="ACCOUNTS">Accounts</option>
            <option value="VIEWER">Viewer</option>
          </Select>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="active" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            <label htmlFor="active" className="text-sm text-gray-700">Active</label>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editId ? "Update" : "Create"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
