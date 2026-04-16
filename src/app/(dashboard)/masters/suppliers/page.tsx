"use client"

import { useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Modal } from "@/components/ui/Modal"
import { Table } from "@/components/ui/Table"
import { LoadingPage } from "@/components/ui/Spinner"
import { Plus, Pencil } from "lucide-react"
import toast, { Toaster } from "react-hot-toast"

interface Supplier {
  id: string
  name: string
  country: string | null
  contactPerson: string | null
  contactEmail: string | null
  contactPhone: string | null
  paymentTerms: string | null
  active: boolean
}

const emptyForm = { name: "", address: "", country: "", contactPerson: "", contactEmail: "", contactPhone: "", bankDetails: "", defaultLeadTime: "", paymentTerms: "" }

export default function SuppliersPage() {
  const { data: suppliers, loading, refetch } = useFetch<Supplier[]>("/api/suppliers")
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const url = editId ? `/api/suppliers/${editId}` : "/api/suppliers"
      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        toast.success(editId ? "Supplier updated" : "Supplier created")
        setShowModal(false)
        refetch()
      } else {
        toast.error("Failed to save supplier")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (s: Supplier) => {
    setEditId(s.id)
    setForm({ name: s.name, address: "", country: s.country || "", contactPerson: s.contactPerson || "", contactEmail: s.contactEmail || "", contactPhone: s.contactPhone || "", bankDetails: "", defaultLeadTime: "", paymentTerms: s.paymentTerms || "" })
    setShowModal(true)
  }

  const columns = [
    { key: "name", header: "Name", sortable: true },
    { key: "country", header: "Country", render: (row: Supplier) => row.country || "-" },
    { key: "contactPerson", header: "Contact", render: (row: Supplier) => row.contactPerson || "-" },
    { key: "contactEmail", header: "Email", render: (row: Supplier) => row.contactEmail || "-" },
    { key: "contactPhone", header: "Phone", render: (row: Supplier) => row.contactPhone || "-" },
    { key: "paymentTerms", header: "Payment Terms", render: (row: Supplier) => row.paymentTerms || "-" },
    { key: "active", header: "Status", render: (row: Supplier) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${row.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
        {row.active ? "Active" : "Inactive"}
      </span>
    )},
    { key: "actions", header: "Actions", render: (row: Supplier) => (
      <Button size="sm" variant="ghost" onClick={() => handleEdit(row)}><Pencil size={14} /></Button>
    )},
  ]

  if (loading) return <LoadingPage />

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <Header title="Suppliers" breadcrumbs={[{ label: "Master Data" }, { label: "Suppliers" }]}
        actions={<Button onClick={() => { setEditId(null); setForm(emptyForm); setShowModal(true) }}><Plus size={16} className="mr-2" />Add Supplier</Button>}
      />
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <Table columns={columns} data={(suppliers || [])} emptyMessage="No suppliers yet" />
      </div>
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? "Edit Supplier" : "Add Supplier"} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Supplier Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </div>
          <Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <div className="grid grid-cols-3 gap-4">
            <Input label="Contact Person" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            <Input label="Email" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            <Input label="Phone" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Payment Terms" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} placeholder="e.g. 30 days" />
            <Input label="Lead Time (days)" type="number" value={form.defaultLeadTime} onChange={(e) => setForm({ ...form, defaultLeadTime: e.target.value })} />
          </div>
          <Input label="Bank Details" value={form.bankDetails} onChange={(e) => setForm({ ...form, bankDetails: e.target.value })} />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editId ? "Update" : "Create"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
