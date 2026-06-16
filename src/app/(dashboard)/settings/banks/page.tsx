"use client"

import { useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Modal } from "@/components/ui/Modal"
import { Table } from "@/components/ui/Table"
import { CsvImport } from "@/components/ui/CsvImport"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { RowActionsMenu } from "@/components/ui/RowActionsMenu"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { DetailsModal } from "@/components/ui/DetailsModal"
import { formatDate } from "@/lib/utils"
import { Plus, Pencil, Trash2 } from "lucide-react"
import toast from "react-hot-toast"

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
  const [deleting, setDeleting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Bank | null>(null)
  const [detailRow, setDetailRow] = useState<Bank | null>(null)

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

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/banks/${deleteTarget.id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Bank deleted")
        setDeleteTarget(null)
        refetch()
      } else {
        const err = await res.json()
        toast.error(err.error || "Failed to delete bank")
      }
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    { key: "name", header: "Bank Name", sortable: true },
    { key: "createdAt", header: "Added", numeric: true, render: (row: Bank) => formatDate(row.createdAt) },
    { key: "branch", header: "Branch", render: (row: Bank) => row.branch || "-" },
    {
      key: "active", header: "Status",
      render: (row: Bank) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${row.active ? "bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-300" : "bg-muted text-secondary"}`}>
          {row.active ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      key: "actions", header: "Actions",
      render: (row: Bank) => (
        <RowActionsMenu actions={[
          { label: "Edit", icon: <Pencil size={15} />, onClick: () => openEdit(row) },
          { label: "Delete Bank", icon: <Trash2 size={15} />, danger: true, onClick: () => setDeleteTarget(row) },
        ]} />
      ),
    },
  ]

  if (loading) return <TableSkeleton columns={5} rows={6} />

  return (
    <div className="space-y-6 animate-fade-in-up">

      {/* Row details */}
      <DetailsModal
        isOpen={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title={`Bank — ${detailRow?.name || ""}`}
        fields={detailRow ? [
          { label: "Branch", value: detailRow.branch || "—" },
          { label: "Status", value: detailRow.active ? "Active" : "Inactive" },
          { label: "Added", value: formatDate(detailRow.createdAt) },
        ] : []}
      />
      <Header title="Banks" breadcrumbs={[{ label: "Settings" }, { label: "Banks" }]}
        actions={
          <div className="flex gap-2">
            <CsvImport
              endpoint="/api/import/banks"
              title="Import Banks"
              sampleName="banks"
              guide="Only Name is required; Branch is optional. Use the exact bank/account names you write in your collection sheets (e.g. THAL, MBL, KB UBL, BAHL, Cash Deposit). Existing names are skipped."
              sampleColumns={["Name", "Branch"]}
              sampleRows={[
                ["FORMAT → bank/account name (required)", "Branch — optional, leave blank if none"],
                ["THAL", ""],
                ["Cash Deposit", "GS HO"],
                ["KB UBL", ""],
              ]}
              onComplete={refetch}
            />
            <Button onClick={openAdd}><Plus size={16} className="mr-2" />Add Bank</Button>
          </div>
        }
      />
      <div className="bg-surface rounded-xl shadow-card border border-line">
        <Table
          columns={columns}
          data={(banks || [])}
          emptyMessage="No banks yet"
          onRowClick={(row: Bank) => setDetailRow(row)}
          searchPlaceholder="Search bank, branch…"
          filters={[{ key: "active", label: "Status", value: (row: Bank) => (row.active ? "Active" : "Inactive") }]}
        />
      </div>
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? "Edit Bank" : "Add Bank"}>
        <div className="space-y-4">
          <Input label="Bank Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. HBL" />
          <Input label="Branch" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} placeholder="e.g. Main Branch" />
          <div className="flex items-center gap-2">
            <input type="checkbox" id="activeBank" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            <label htmlFor="activeBank" className="text-sm text-secondary">Active</label>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editingId ? "Save Changes" : "Add Bank"}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Bank"
        message={<>Delete bank <span className="font-semibold text-foreground">&ldquo;{deleteTarget?.name}&rdquo;</span>? This cannot be undone.</>}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
