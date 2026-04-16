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
import { formatCurrency } from "@/lib/utils"
import { Plus, Pencil, Trash2 } from "lucide-react"
import toast, { Toaster } from "react-hot-toast"

interface CustomerContact {
  id?: string
  name: string
  whatsapp: string
  isPrimary?: boolean
}

interface Customer {
  id: string
  name: string
  type: string
  ntn: string | null
  strn: string | null
  address: string | null
  contactPerson: string | null
  contactPhone: string | null
  contactEmail: string | null
  creditLimit: number | null
  paymentTerms: string
  active: boolean
  contacts: CustomerContact[]
}

const emptyForm = {
  name: "",
  type: "DIRECT",
  ntn: "",
  strn: "",
  address: "",
  contactPerson: "",
  contactPhone: "",
  contactEmail: "",
  creditLimit: "",
  paymentTerms: "FULL_PAYMENT",
}

const emptyContact: CustomerContact = { name: "", whatsapp: "" }

export default function CustomersPage() {
  const { data: customers, loading, refetch } = useFetch<Customer[]>("/api/customers")
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [contacts, setContacts] = useState<CustomerContact[]>([{ ...emptyContact }])
  const [saving, setSaving] = useState(false)

  const addContact = () => setContacts((prev) => [...prev, { ...emptyContact }])
  const removeContact = (idx: number) => setContacts((prev) => prev.filter((_, i) => i !== idx))
  const updateContact = (idx: number, field: keyof CustomerContact, value: string) => {
    setContacts((prev) => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const validContacts = contacts.filter((c) => c.name.trim() || c.whatsapp.trim())
      const url = editId ? `/api/customers/${editId}` : "/api/customers"
      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, contacts: validContacts }),
      })
      if (res.ok) {
        toast.success(editId ? "Customer updated" : "Customer created")
        setShowModal(false)
        refetch()
      } else {
        toast.error("Failed to save customer")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (c: Customer) => {
    setEditId(c.id)
    setForm({
      name: c.name,
      type: c.type,
      ntn: c.ntn || "",
      strn: c.strn || "",
      address: c.address || "",
      contactPerson: c.contactPerson || "",
      contactPhone: c.contactPhone || "",
      contactEmail: c.contactEmail || "",
      creditLimit: c.creditLimit ? String(c.creditLimit) : "",
      paymentTerms: c.paymentTerms,
    })
    setContacts(c.contacts?.length ? c.contacts.map((x) => ({ name: x.name, whatsapp: x.whatsapp })) : [{ ...emptyContact }])
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
    { key: "type", header: "Type", render: (row: Customer) => row.type.replace("_", " ") },
    { key: "ntn", header: "NTN", render: (row: Customer) => row.ntn || "-" },
    { key: "strn", header: "STRN", render: (row: Customer) => row.strn || "-" },
    {
      key: "contacts",
      header: "WhatsApp Contacts",
      render: (row: Customer) => {
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
    { key: "creditLimit", header: "Credit Limit", render: (row: Customer) => row.creditLimit ? formatCurrency(row.creditLimit) : "-" },
    { key: "paymentTerms", header: "Payment Terms", render: (row: Customer) => row.paymentTerms.replace(/_/g, " ") },
    {
      key: "active", header: "Status", render: (row: Customer) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${row.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
          {row.active ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      key: "actions", header: "Actions", render: (row: Customer) => (
        <Button size="sm" variant="ghost" onClick={() => handleEdit(row)}><Pencil size={14} /></Button>
      ),
    },
  ]

  if (loading) return <LoadingPage />

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <Header
        title="Customers"
        breadcrumbs={[{ label: "Master Data" }, { label: "Customers" }]}
        actions={<Button onClick={openAdd}><Plus size={16} className="mr-2" />Add Customer</Button>}
      />
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <Table columns={columns} data={customers || []} emptyMessage="No customers yet" />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? "Edit Customer" : "Add Customer"} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Customer Name *" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select label="Customer Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="DIRECT">Direct</option>
              <option value="DISTRIBUTOR">Distributor</option>
              <option value="INSTALLER">Installer</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="NTN" value={form.ntn} onChange={(e) => setForm({ ...form, ntn: e.target.value })} />
            <Input label="STRN" value={form.strn} onChange={(e) => setForm({ ...form, strn: e.target.value })} />
          </div>
          <Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <div className="grid grid-cols-3 gap-4">
            <Input label="Contact Person" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            <Input label="Phone" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            <Input label="Email" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Credit Limit (PKR)" type="number" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} />
            <Select label="Payment Terms" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}>
              <option value="FULL_PAYMENT">Full Payment</option>
              <option value="DEPOSIT_BALANCE">Deposit + Balance</option>
              <option value="CREDIT">Credit</option>
            </Select>
          </div>

          {/* WhatsApp Contacts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">WhatsApp Contacts</label>
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
