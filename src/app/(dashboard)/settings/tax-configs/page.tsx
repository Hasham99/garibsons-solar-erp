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
import { Plus, Pencil, Trash2 } from "lucide-react"
import toast from "react-hot-toast"

interface TaxConfig {
  id: string
  name: string
  customsDuty: number
  additionalCD: number
  excise: number
  salesTax: number
  additionalST: number
  incomeTax: number
  handlingPerWatt: number
  isDefault: boolean
}

const emptyForm = { name: "", customsDuty: "3", additionalCD: "0", excise: "0", salesTax: "18", additionalST: "0", incomeTax: "1.5", handlingPerWatt: "2", isDefault: false }

export default function TaxConfigsPage() {
  const { data: configs, loading, refetch } = useFetch<TaxConfig[]>("/api/tax-configs")
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<typeof emptyForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TaxConfig | null>(null)
  const [detailRow, setDetailRow] = useState<TaxConfig | null>(null)

  const openAdd = () => { setEditingId(null); setForm(emptyForm); setShowModal(true) }
  const openEdit = (row: TaxConfig) => {
    setEditingId(row.id)
    setForm({
      name: row.name,
      customsDuty: String(row.customsDuty),
      additionalCD: String(row.additionalCD),
      excise: String(row.excise),
      salesTax: String(row.salesTax),
      additionalST: String(row.additionalST),
      incomeTax: String(row.incomeTax),
      handlingPerWatt: String(row.handlingPerWatt),
      isDefault: row.isDefault,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const url = editingId ? `/api/tax-configs/${editingId}` : "/api/tax-configs"
      const method = editingId ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        toast.success(editingId ? "Tax config updated" : "Tax config created")
        setShowModal(false)
        setForm(emptyForm)
        setEditingId(null)
        refetch()
      } else {
        const err = await res.json()
        toast.error(err.error || "Failed to save tax config")
      }
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/tax-configs/${deleteTarget.id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Tax config deleted")
        setDeleteTarget(null)
        refetch()
      } else {
        const err = await res.json()
        toast.error(err.error || "Failed to delete tax config")
      }
    } finally {
      setDeleting(false)
    }
  }

  const totalTax = (parseFloat(form.customsDuty) || 0) + (parseFloat(form.additionalCD) || 0) + (parseFloat(form.excise) || 0) + (parseFloat(form.salesTax) || 0) + (parseFloat(form.additionalST) || 0) + (parseFloat(form.incomeTax) || 0)

  const columns = [
    { key: "name", header: "Name", sortable: true },
    { key: "customsDuty", header: "CD", numeric: true, render: (row: TaxConfig) => `${row.customsDuty}%` },
    { key: "salesTax", header: "GST", numeric: true, render: (row: TaxConfig) => `${row.salesTax}%` },
    { key: "incomeTax", header: "IT", numeric: true, render: (row: TaxConfig) => `${row.incomeTax}%` },
    { key: "excise", header: "Excise", numeric: true, render: (row: TaxConfig) => `${row.excise}%` },
    {
      key: "total", header: "Total Tax", numeric: true,
      render: (row: TaxConfig) => {
        const total = row.customsDuty + row.additionalCD + row.excise + row.salesTax + row.additionalST + row.incomeTax
        return <span className="font-bold">{total.toFixed(2)}%</span>
      },
    },
    { key: "handlingPerWatt", header: "Handling/W", numeric: true, render: (row: TaxConfig) => `Rs ${row.handlingPerWatt}` },
    {
      key: "isDefault", header: "Default",
      render: (row: TaxConfig) => row.isDefault ? (
        <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-300">Default</span>
      ) : null,
    },
    {
      key: "actions", header: "Actions",
      render: (row: TaxConfig) => (
        <RowActionsMenu actions={[
          { label: "Edit", icon: <Pencil size={15} />, onClick: () => openEdit(row) },
          { label: "Delete Config", icon: <Trash2 size={15} />, danger: true, onClick: () => setDeleteTarget(row) },
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
        title={`Tax Configuration — ${detailRow?.name || ""}`}
        fields={detailRow ? [
          { label: "Customs Duty", value: `${detailRow.customsDuty}%` },
          { label: "Additional CD", value: `${detailRow.additionalCD}%` },
          { label: "Excise", value: `${detailRow.excise}%` },
          { label: "Sales Tax (GST)", value: `${detailRow.salesTax}%` },
          { label: "Additional ST", value: `${detailRow.additionalST}%` },
          { label: "Income Tax", value: `${detailRow.incomeTax}%` },
          { label: "Total Tax", value: <span className="font-bold">{(detailRow.customsDuty + detailRow.additionalCD + detailRow.excise + detailRow.salesTax + detailRow.additionalST + detailRow.incomeTax).toFixed(2)}%</span> },
          { label: "Handling / Watt", value: `Rs ${detailRow.handlingPerWatt}` },
          { label: "Default", value: detailRow.isDefault ? "Yes" : "No" },
        ] : []}
      />
      <Header title="Tax Configurations" breadcrumbs={[{ label: "Settings" }, { label: "Tax Configs" }]}
        actions={<Button onClick={openAdd}><Plus size={16} className="mr-2" />Add Tax Config</Button>}
      />
      <div className="bg-surface rounded-xl shadow-card border border-line">
        <Table columns={columns} data={(configs || [])} emptyMessage="No tax configs yet" searchPlaceholder="Search name…" onRowClick={(row: TaxConfig) => setDetailRow(row)} />
      </div>
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? "Edit Tax Configuration" : "Add Tax Configuration"} size="lg">
        <div className="space-y-4">
          <Input label="Configuration Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Standard Import 2024" />
          <div className="grid grid-cols-3 gap-4">
            <Input label="Customs Duty (%)" type="number" step="0.1" value={form.customsDuty} onChange={(e) => setForm({ ...form, customsDuty: e.target.value })} />
            <Input label="Additional CD (%)" type="number" step="0.1" value={form.additionalCD} onChange={(e) => setForm({ ...form, additionalCD: e.target.value })} />
            <Input label="Excise (%)" type="number" step="0.1" value={form.excise} onChange={(e) => setForm({ ...form, excise: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Sales Tax/GST (%)" type="number" step="0.1" value={form.salesTax} onChange={(e) => setForm({ ...form, salesTax: e.target.value })} />
            <Input label="Additional ST (%)" type="number" step="0.1" value={form.additionalST} onChange={(e) => setForm({ ...form, additionalST: e.target.value })} />
            <Input label="Income Tax (%)" type="number" step="0.1" value={form.incomeTax} onChange={(e) => setForm({ ...form, incomeTax: e.target.value })} />
          </div>
          <Input label="Handling per Watt (PKR)" type="number" step="0.01" value={form.handlingPerWatt} onChange={(e) => setForm({ ...form, handlingPerWatt: e.target.value })} />
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isDefault" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
            <label htmlFor="isDefault" className="text-sm text-secondary">Set as default tax configuration</label>
          </div>
          <div className="rounded-xl border border-blue-100 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 p-4 text-sm">
            <span className="font-medium text-blue-900 dark:text-blue-300">Total Tax Rate: {totalTax.toFixed(2)}%</span>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editingId ? "Save Changes" : "Create Config"}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Tax Configuration"
        message={<>Delete tax configuration <span className="font-semibold text-foreground">&ldquo;{deleteTarget?.name}&rdquo;</span>? This cannot be undone.</>}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
