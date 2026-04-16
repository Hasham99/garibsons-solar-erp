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

interface WarehouseContact {
  id?: string
  name: string
  whatsapp: string
  isPrimary?: boolean
}

interface Warehouse {
  id: string
  name: string
  location: string
  godown: string | null
  manager: string | null
  active: boolean
  contacts: WarehouseContact[]
}

const emptyForm = { name: "", location: "", godown: "", manager: "" }
const emptyContact: WarehouseContact = { name: "", whatsapp: "" }

export default function WarehousesPage() {
  const { data: warehouses, loading, refetch } = useFetch<Warehouse[]>("/api/warehouses")
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [contacts, setContacts] = useState<WarehouseContact[]>([{ ...emptyContact }])
  const [saving, setSaving] = useState(false)

  const addContact = () => setContacts((prev) => [...prev, { ...emptyContact }])
  const removeContact = (idx: number) => setContacts((prev) => prev.filter((_, i) => i !== idx))
  const updateContact = (idx: number, field: keyof WarehouseContact, value: string) => {
    setContacts((prev) => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const validContacts = contacts.filter((c) => c.name.trim() || c.whatsapp.trim())
      const url = editId ? `/api/warehouses/${editId}` : "/api/warehouses"
      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, contacts: validContacts }),
      })
      if (res.ok) {
        toast.success(editId ? "Warehouse updated" : "Warehouse created")
        setShowModal(false)
        refetch()
      } else {
        toast.error("Failed to save warehouse")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (w: Warehouse) => {
    setEditId(w.id)
    setForm({ name: w.name, location: w.location, godown: w.godown || "", manager: w.manager || "" })
    setContacts(w.contacts?.length ? w.contacts.map((x) => ({ name: x.name, whatsapp: x.whatsapp })) : [{ ...emptyContact }])
    setShowModal(true)
  }

  const openAdd = () => {
    setEditId(null)
    setForm(emptyForm)
    setContacts([{ ...emptyContact }])
    setShowModal(true)
  }

  const columns = [
    { key: "name", header: "Name", sortable: true },
    { key: "location", header: "Location" },
    { key: "godown", header: "Godown", render: (row: Warehouse) => row.godown || "-" },
    { key: "manager", header: "Manager", render: (row: Warehouse) => row.manager || "-" },
    {
      key: "contacts",
      header: "Contact Persons",
      render: (row: Warehouse) => {
        if (!row.contacts?.length) return <span className="text-gray-400">-</span>
        return (
          <div className="space-y-0.5">
            {row.contacts.slice(0, 2).map((c, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium">{c.name}</span>
                <span className="text-gray-500 ml-1">{c.whatsapp}</span>
              </div>
            ))}
            {row.contacts.length > 2 && <p className="text-xs text-gray-400">+{row.contacts.length - 2} more</p>}
          </div>
        )
      },
    },
    {
      key: "active", header: "Status", render: (row: Warehouse) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${row.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
          {row.active ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      key: "actions", header: "Actions", render: (row: Warehouse) => (
        <Button size="sm" variant="ghost" onClick={() => handleEdit(row)}><Pencil size={14} /></Button>
      ),
    },
  ]

  if (loading) return <LoadingPage />

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <Header
        title="Warehouses"
        breadcrumbs={[{ label: "Master Data" }, { label: "Warehouses" }]}
        actions={<Button onClick={openAdd}><Plus size={16} className="mr-2" />Add Warehouse</Button>}
      />
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <Table columns={columns} data={warehouses || []} emptyMessage="No warehouses yet" />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? "Edit Warehouse" : "Add Warehouse"} size="lg">
        <div className="space-y-4">
          <Input label="Warehouse Name *" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Location *" required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Godown / Building" value={form.godown} onChange={(e) => setForm({ ...form, godown: e.target.value })} />
            <Input label="Manager" value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} />
          </div>

          {/* Contact Persons */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Contact Persons</label>
              <Button size="sm" variant="ghost" onClick={addContact}>
                <Plus size={14} className="mr-1" />Add Contact
              </Button>
            </div>
            <div className="space-y-2">
              {contacts.map((contact, idx) => (
                <div key={idx} className="flex items-end gap-2 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <Input
                      label={idx === 0 ? "Name *" : "Name"}
                      value={contact.name}
                      onChange={(e) => updateContact(idx, "name", e.target.value)}
                      placeholder="Contact name"
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      label="WhatsApp Number"
                      value={contact.whatsapp}
                      onChange={(e) => updateContact(idx, "whatsapp", e.target.value)}
                      placeholder="+92 300 0000000"
                    />
                  </div>
                  {contacts.length > 1 && (
                    <Button size="sm" variant="danger" onClick={() => removeContact(idx)}>
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editId ? "Update" : "Create"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
