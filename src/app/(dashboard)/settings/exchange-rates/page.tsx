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
  const [deleting, setDeleting] = useState<string | null>(null)

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

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this exchange rate?")) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/exchange-rates/${id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Exchange rate deleted")
        refetch()
      } else {
        const err = await res.json()
        toast.error(err.error || "Failed to delete rate")
      }
    } finally {
      setDeleting(null)
    }
  }

  const columns = [
    { key: "date", header: "Date", render: (row: ExchangeRate) => formatDate(row.date), sortable: true },
    { key: "source", header: "Source" },
    { key: "rate", header: "Rate (PKR/USD)", render: (row: ExchangeRate) => <span className="font-bold text-blue-700">Rs {row.rate}</span> },
    { key: "notes", header: "Notes", render: (row: ExchangeRate) => row.notes || "-" },
    { key: "createdAt", header: "Added", render: (row: ExchangeRate) => formatDate(row.createdAt) },
    {
      key: "actions", header: "",
      render: (row: ExchangeRate) => (
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
      <Header title="Exchange Rates" breadcrumbs={[{ label: "Settings" }, { label: "Exchange Rates" }]}
        actions={<Button onClick={openAdd}><Plus size={16} className="mr-2" />Add Rate</Button>}
      />
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <Table columns={columns} data={(rates || [])} emptyMessage="No exchange rates yet" />
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
    </div>
  )
}
