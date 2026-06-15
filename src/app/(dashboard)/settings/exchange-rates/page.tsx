"use client"

import { useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Modal } from "@/components/ui/Modal"
import { Table } from "@/components/ui/Table"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { RowActionsMenu } from "@/components/ui/RowActionsMenu"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { DetailsModal } from "@/components/ui/DetailsModal"
import { formatDate } from "@/lib/utils"
import { Plus, Pencil, Trash2 } from "lucide-react"
import toast from "react-hot-toast"

interface ExchangeRate {
  id: string
  date: string
  source: string
  rate: number
  notes: string | null
  createdAt: string
}

const emptyForm = { date: new Date().toISOString().split("T")[0], source: "SBP", rate: "", notes: "" }

export default function ExchangeRatesPage() {
  const { data: rates, loading, refetch } = useFetch<ExchangeRate[]>("/api/exchange-rates")
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<typeof emptyForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ExchangeRate | null>(null)
  const [detailRow, setDetailRow] = useState<ExchangeRate | null>(null)

  const openAdd = () => { setEditingId(null); setForm(emptyForm); setShowModal(true) }
  const openEdit = (row: ExchangeRate) => {
    setEditingId(row.id)
    setForm({ date: row.date.split("T")[0], source: row.source, rate: String(row.rate), notes: row.notes || "" })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const url = editingId ? `/api/exchange-rates/${editingId}` : "/api/exchange-rates"
      const method = editingId ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        toast.success(editingId ? "Exchange rate updated" : "Exchange rate added")
        setShowModal(false)
        setForm(emptyForm)
        setEditingId(null)
        refetch()
      } else {
        const err = await res.json()
        toast.error(err.error || "Failed to save rate")
      }
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/exchange-rates/${deleteTarget.id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Exchange rate deleted")
        setDeleteTarget(null)
        refetch()
      } else {
        const err = await res.json()
        toast.error(err.error || "Failed to delete rate")
      }
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    { key: "date", header: "Date", render: (row: ExchangeRate) => formatDate(row.date), sortable: true, numeric: true },
    { key: "source", header: "Source" },
    { key: "rate", header: "Rate (PKR/USD)", numeric: true, render: (row: ExchangeRate) => <span className="font-bold text-blue-700 dark:text-blue-300">Rs {row.rate}</span> },
    { key: "notes", header: "Notes", render: (row: ExchangeRate) => row.notes || "-" },
    { key: "createdAt", header: "Added", numeric: true, render: (row: ExchangeRate) => formatDate(row.createdAt) },
    {
      key: "actions", header: "Actions",
      render: (row: ExchangeRate) => (
        <RowActionsMenu actions={[
          { label: "Edit", icon: <Pencil size={15} />, onClick: () => openEdit(row) },
          { label: "Delete Rate", icon: <Trash2 size={15} />, danger: true, onClick: () => setDeleteTarget(row) },
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
        title={`Exchange Rate — ${detailRow ? formatDate(detailRow.date) : ""}`}
        fields={detailRow ? [
          { label: "Rate (PKR/USD)", value: <span className="font-bold text-blue-700 dark:text-blue-300">Rs {detailRow.rate}</span> },
          { label: "Source", value: detailRow.source },
          { label: "Added", value: formatDate(detailRow.createdAt) },
          ...(detailRow.notes ? [{ label: "Notes", value: detailRow.notes, wide: true }] : []),
        ] : []}
      />
      <Header title="Exchange Rates" breadcrumbs={[{ label: "Settings" }, { label: "Exchange Rates" }]}
        actions={<Button onClick={openAdd}><Plus size={16} className="mr-2" />Add Rate</Button>}
      />
      <div className="bg-surface rounded-xl shadow-card border border-line">
        <Table
          columns={columns}
          data={(rates || [])}
          emptyMessage="No exchange rates yet"
          onRowClick={(row: ExchangeRate) => setDetailRow(row)}
          searchPlaceholder="Search source, notes…"
          filters={[
            { key: "source", label: "Source", value: (row: ExchangeRate) => row.source },
            { key: "date", label: "Date", type: "date", value: (row: ExchangeRate) => row.date },
          ]}
        />
      </div>
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? "Edit Exchange Rate" : "Add Exchange Rate"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <Input label="Source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="SBP / Interbank / Market" />
          </div>
          <Input label="Rate (PKR per 1 USD)" type="number" step="0.01" required value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} placeholder="e.g. 279" />
          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editingId ? "Save Changes" : "Add Rate"}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Exchange Rate"
        message={<>Delete exchange rate <span className="font-semibold text-foreground">&ldquo;{deleteTarget ? formatDate(deleteTarget.date) : ""}&rdquo;</span>? This cannot be undone.</>}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
