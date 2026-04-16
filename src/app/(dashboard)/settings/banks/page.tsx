"use client"

import { useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Modal } from "@/components/ui/Modal"
import { Table } from "@/components/ui/Table"
import { LoadingPage } from "@/components/ui/Spinner"
import { formatDate } from "@/lib/utils"
import { Plus, Pencil, Trash2 } from "lucide-react"
import toast, { Toaster } from "react-hot-toast"

interface Bank {
  id: string
  name: string
  branch: string | null
  active: boolean
  createdAt: string
}

const emptyForm = { name: "", branch: "", active: true }

export default function BanksPage() {
  const { data: banks, loading, refetch } = useFetch<Bank[]>("/api/banks")
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<typeof emptyForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const openAdd = () => { setEditingId(null); setForm(emptyForm); setShowModal(true) }
  const openEdit = (row: Bank) => {
    setEditingId(row.id)
    setForm({ name: row.name, branch: row.branch || "", active: row.active })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const url = editingId ? `/api/banks/${editingId}` : "/api/banks"
      const method = editingId ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        toast.success(editingId ? "Bank updated" : "Bank added")
        setShowModal(false)
        setForm(emptyForm)
        setEditingId(null)
        refetch()
      } else {
        const err = await res.json()
        toast.error(err.error || "Failed to save bank")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this bank?")) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/banks/${id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Bank deleted")
        refetch()
      } else {
        const err = await res.json()
        toast.error(err.error || "Failed to delete bank")
      }
    } finally {
      setDeleting(null)
    }
  }

  const columns = [
    { key: "name", header: "Bank Name", sortable: true },
    { key: "branch", header: "Branch", render: (row: Bank) => row.branch || "-" },
    {
      key: "active", header: "Status",
      render: (row: Bank) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${row.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
          {row.active ? "Active" : "Inactive"}
        </span>
      ),
    },
    { key: "createdAt", header: "Added", render: (row: Bank) => formatDate(row.createdAt) },
    {
      key: "actions", header: "",
      render: (row: Bank) => (
        <div className="flex gap-2 justify-end">
          <button onClick={() => openEdit(row)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
            <Pencil size={15} />
          </button>
          <button onClick={() => handleDelete(row.id)} disabled={deleting === row.id} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50">
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ]

  if (loading) return <LoadingPage />

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <Header title="Banks" breadcrumbs={[{ label: "Settings" }, { label: "Banks" }]}
        actions={<Button onClick={openAdd}><Plus size={16} className="mr-2" />Add Bank</Button>}
      />
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <Table columns={columns} data={(banks || [])} emptyMessage="No banks yet" />
      </div>
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? "Edit Bank" : "Add Bank"}>
        <div className="space-y-4">
          <Input label="Bank Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. HBL" />
          <Input label="Branch" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} placeholder="e.g. Main Branch" />
          <div className="flex items-center gap-2">
            <input type="checkbox" id="activeBank" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            <label htmlFor="activeBank" className="text-sm text-gray-700">Active</label>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editingId ? "Save Changes" : "Add Bank"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
