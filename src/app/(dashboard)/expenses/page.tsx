"use client"

import { useState, useMemo } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Modal } from "@/components/ui/Modal"
import { Table } from "@/components/ui/Table"
import { LoadingPage } from "@/components/ui/Spinner"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Plus, Pencil, Trash2 } from "lucide-react"
import toast, { Toaster } from "react-hot-toast"

const CATEGORIES = [
  { value: "SALARY",        label: "Salary" },
  { value: "COMMISSION",    label: "Commission" },
  { value: "WAREHOUSE_RENT",label: "Warehouse Rent" },
  { value: "UTILITIES",     label: "Utilities" },
  { value: "TRANSPORT",     label: "Transport" },
  { value: "MARKETING",     label: "Marketing" },
  { value: "OFFICE",        label: "Office / Admin" },
  { value: "OTHER",         label: "Other" },
]

const CATEGORY_COLORS: Record<string, string> = {
  SALARY:         "bg-blue-100 text-blue-700",
  COMMISSION:     "bg-purple-100 text-purple-700",
  WAREHOUSE_RENT: "bg-orange-100 text-orange-700",
  UTILITIES:      "bg-yellow-100 text-yellow-700",
  TRANSPORT:      "bg-cyan-100 text-cyan-700",
  MARKETING:      "bg-pink-100 text-pink-700",
  OFFICE:         "bg-gray-100 text-gray-700",
  OTHER:          "bg-slate-100 text-slate-700",
}

interface Expense {
  id: string
  date: string
  category: string
  description: string
  amount: number
  paidTo: string | null
  reference: string | null
  notes: string | null
  createdBy: { name: string } | null
}

const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  category: "SALARY",
  description: "",
  amount: "",
  paidTo: "",
  reference: "",
  notes: "",
}

export default function ExpensesPage() {
  const { data: expenses, loading, refetch } = useFetch<Expense[]>("/api/expenses")
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [filterCategory, setFilterCategory] = useState("")
  const [filterMonth, setFilterMonth] = useState("")

  const handleSave = async () => {
    if (!form.description || !form.amount) return toast.error("Description and amount are required")
    setSaving(true)
    try {
      const url = editId ? `/api/expenses/${editId}` : "/api/expenses"
      const method = editId ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        toast.success(editId ? "Expense updated" : "Expense recorded")
        setShowModal(false)
        refetch()
      } else {
        toast.error("Failed to save expense")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (expense: Expense) => {
    setEditId(expense.id)
    setForm({
      date: expense.date.split("T")[0],
      category: expense.category,
      description: expense.description,
      amount: String(expense.amount),
      paidTo: expense.paidTo || "",
      reference: expense.reference || "",
      notes: expense.notes || "",
    })
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this expense?")) return
    const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" })
    if (res.ok) { toast.success("Deleted"); refetch() }
    else toast.error("Failed to delete")
  }

  const handleNew = () => {
    setEditId(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  // Filtered list
  const filtered = useMemo(() => {
    return (expenses || []).filter((e) => {
      if (filterCategory && e.category !== filterCategory) return false
      if (filterMonth) {
        const eMonth = e.date.slice(0, 7) // "YYYY-MM"
        if (eMonth !== filterMonth) return false
      }
      return true
    })
  }, [expenses, filterCategory, filterMonth])

  // Summary by category
  const byCategory = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of filtered) {
      map[e.category] = (map[e.category] || 0) + e.amount
    }
    return CATEGORIES.map((c) => ({ ...c, total: map[c.value] || 0 })).filter((c) => c.total > 0)
  }, [filtered])

  const grandTotal = filtered.reduce((s, e) => s + e.amount, 0)

  const columns = [
    { key: "date", header: "Date", sortable: true, render: (row: Expense) => formatDate(row.date) },
    {
      key: "category", header: "Category",
      render: (row: Expense) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[row.category] || "bg-gray-100 text-gray-600"}`}>
          {CATEGORIES.find((c) => c.value === row.category)?.label || row.category}
        </span>
      ),
    },
    { key: "description", header: "Description" },
    { key: "paidTo", header: "Paid To", render: (row: Expense) => row.paidTo || <span className="text-gray-400">-</span> },
    { key: "reference", header: "Ref #", render: (row: Expense) => row.reference || <span className="text-gray-400">-</span> },
    { key: "amount", header: "Amount", render: (row: Expense) => <span className="font-semibold text-red-700">{formatCurrency(row.amount)}</span> },
    { key: "createdBy", header: "Entered By", render: (row: Expense) => row.createdBy?.name || "-" },
    {
      key: "actions", header: "",
      render: (row: Expense) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => handleEdit(row)}><Pencil size={13} /></Button>
          <Button size="sm" variant="danger" onClick={() => handleDelete(row.id)}><Trash2 size={13} /></Button>
        </div>
      ),
    },
  ]

  if (loading) return <LoadingPage />

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <Header
        title="Expense Management"
        breadcrumbs={[{ label: "Expenses" }]}
        actions={<Button onClick={handleNew}><Plus size={16} className="mr-2" />Add Expense</Button>}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-48">
          <Select label="Filter by Category" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </div>
        <div className="w-44">
          <Input
            label="Filter by Month"
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
          />
        </div>
        {(filterCategory || filterMonth) && (
          <Button variant="secondary" onClick={() => { setFilterCategory(""); setFilterMonth("") }}>
            Clear Filters
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      {byCategory.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {byCategory.map((c) => (
            <div key={c.value} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">{c.label}</p>
              <p className="text-lg font-bold text-gray-900 mt-1">{formatCurrency(c.total)}</p>
            </div>
          ))}
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-xs text-red-700 font-medium">Total Expenses</p>
            <p className="text-lg font-bold text-red-800 mt-1">{formatCurrency(grandTotal)}</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <Table columns={columns} data={filtered} emptyMessage="No expenses recorded yet" />
      </div>

      {/* Add / Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? "Edit Expense" : "Add Expense"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Date *" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <Select label="Category *" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </div>
          <Input label="Description *" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Monthly warehouse rent — Ravi Road" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Amount (PKR) *" type="number" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <Input label="Paid To" value={form.paidTo} onChange={(e) => setForm({ ...form, paidTo: e.target.value })} placeholder="Person or vendor name" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Reference #" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Receipt, voucher or slip #" />
            <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editId ? "Update" : "Save Expense"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
