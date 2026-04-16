"use client"

import { useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Modal } from "@/components/ui/Modal"
import { Table } from "@/components/ui/Table"
import { LoadingPage } from "@/components/ui/Spinner"
import { Plus, Pencil, Trash2 } from "lucide-react"
import toast, { Toaster } from "react-hot-toast"

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
  const [deleting, setDeleting] = useState<string | null>(null)

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

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this tax configuration?")) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/tax-configs/${id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Tax config deleted")
        refetch()
      } else {
        const err = await res.json()
        toast.error(err.error || "Failed to delete tax config")
      }
    } finally {
      setDeleting(null)
    }
  }

  const totalTax = (parseFloat(form.customsDuty) || 0) + (parseFloat(form.additionalCD) || 0) + (parseFloat(form.excise) || 0) + (parseFloat(form.salesTax) || 0) + (parseFloat(form.additionalST) || 0) + (parseFloat(form.incomeTax) || 0)

  const columns = [
    { key: "name", header: "Name", sortable: true },
    { key: "customsDuty", header: "CD", render: (row: TaxConfig) => `${row.customsDuty}%` },
    { key: "salesTax", header: "GST", render: (row: TaxConfig) => `${row.salesTax}%` },
    { key: "incomeTax", header: "IT", render: (row: TaxConfig) => `${row.incomeTax}%` },
    { key: "excise", header: "Excise", render: (row: TaxConfig) => `${row.excise}%` },
    {
      key: "total", header: "Total Tax",
      render: (row: TaxConfig) => {
        const total = row.customsDuty + row.additionalCD + row.excise + row.salesTax + row.additionalST + row.incomeTax
        return <span className="font-bold">{total.toFixed(2)}%</span>
      },
    },
    { key: "handlingPerWatt", header: "Handling/W", render: (row: TaxConfig) => `Rs ${row.handlingPerWatt}` },
    {
      key: "isDefault", header: "Default",
      render: (row: TaxConfig) => row.isDefault ? (
        <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Default</span>
      ) : null,
    },
    {
      key: "actions", header: "",
      render: (row: TaxConfig) => (
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
      <Header title="Tax Configurations" breadcrumbs={[{ label: "Settings" }, { label: "Tax Configs" }]}
        actions={<Button onClick={openAdd}><Plus size={16} className="mr-2" />Add Tax Config</Button>}
      />
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <Table columns={columns} data={(configs || [])} emptyMessage="No tax configs yet" />
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
            <label htmlFor="isDefault" className="text-sm text-gray-700">Set as default tax configuration</label>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-sm">
            <span className="font-medium text-blue-900">Total Tax Rate: {totalTax.toFixed(2)}%</span>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editingId ? "Save Changes" : "Create Config"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
