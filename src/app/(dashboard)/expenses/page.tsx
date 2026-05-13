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
import { Plus, Pencil, Trash2, Settings2 } from "lucide-react"
import toast, { Toaster } from "react-hot-toast"

// Color palette for categories (auto-assigned by index)
const PALETTE = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-orange-100 text-orange-700",
  "bg-yellow-100 text-yellow-700",
  "bg-cyan-100 text-cyan-700",
  "bg-pink-100 text-pink-700",
  "bg-gray-100 text-gray-700",
  "bg-slate-100 text-slate-700",
  "bg-green-100 text-green-700",
  "bg-red-100 text-red-700",
]

interface ExpenseCategoryDef {
  id: string
  name: string
  isSystem: boolean
  active: boolean
}

interface Expense {
  id: string
  date: string
  category: string
  categoryName: string | null
  description: string
  amount: number
  paidTo: string | null
  reference: string | null
  notes: string | null
  createdBy: { name: string } | null
}

const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  categoryName: "",
  description: "",
  amount: "",
  paidTo: "",
  reference: "",
  notes: "",
}

export default function ExpensesPage() {
  const { data: expenses, loading, refetch } = useFetch<Expense[]>("/api/expenses")
  const { data: categories, refetch: refetchCats } = useFetch<ExpenseCategoryDef[]>("/api/expense-categories")

  const [showModal, setShowModal] = useState(false)
  const [showCatModal, setShowCatModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [newCatName, setNewCatName] = useState("")
  const [savingCat, setSavingCat] = useState(false)
  const [filterCategory, setFilterCategory] = useState("")
  const [filterMonth, setFilterMonth] = useState("")

  // Map category name → color (stable by index)
  const catColorMap = useMemo(() => {
    const map: Record<string, string> = {}
    ;(categories || []).forEach((c, i) => {
      map[c.name] = PALETTE[i % PALETTE.length]
    })
    return map
  }, [categories])

  const displayCategory = (expense: Expense) =>
    expense.categoryName || expense.category.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())

  const handleSave = async () => {
    if (!form.description || !form.amount || !form.categoryName) {
      return toast.error("Category, description and amount are required")
    }
    setSaving(true)
    try {
      const url = editId ? `/api/expenses/${editId}` : "/api/expenses"
      const method = editId ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, category: "OTHER" }),
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
      categoryName: expense.categoryName || expense.category,
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
    setForm({ ...emptyForm, categoryName: categories?.[0]?.name || "" })
    setShowModal(true)
  }

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return toast.error("Category name is required")
    setSavingCat(true)
    try {
      const res = await fetch("/api/expense-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCatName.trim() }),
      })
      if (res.ok) {
        toast.success("Category added")
        setNewCatName("")
        refetchCats()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to add category")
      }
    } finally {
      setSavingCat(false)
    }
  }

  const handleDeactivateCat = async (id: string) => {
    if (!confirm("Deactivate this category? Existing expenses will keep it.")) return
    const res = await fetch(`/api/expense-categories/${id}`, { method: "DELETE" })
    if (res.ok) { toast.success("Category deactivated"); refetchCats() }
    else toast.error("Failed to deactivate")
  }

  const filtered = useMemo(() => {
    return (expenses || []).filter((e) => {
      const cat = e.categoryName || e.category
      if (filterCategory && cat !== filterCategory) return false
      if (filterMonth && e.date.slice(0, 7) !== filterMonth) return false
      return true
    })
  }, [expenses, filterCategory, filterMonth])

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of filtered) {
      const cat = e.categoryName || e.category
      map[cat] = (map[cat] || 0) + e.amount
    }
    return Object.entries(map)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
  }, [filtered])

  const grandTotal = filtered.reduce((s, e) => s + e.amount, 0)

  const columns = [
    { key: "date", header: "Date", sortable: true, render: (row: Expense) => formatDate(row.date) },
    {
      key: "category", header: "Category",
      render: (row: Expense) => {
        const name = displayCategory(row)
        return (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${catColorMap[row.categoryName || ""] || "bg-gray-100 text-gray-600"}`}>
            {name}
          </span>
        )
      },
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
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowCatModal(true)}>
              <Settings2 size={15} className="mr-2" />Manage Categories
            </Button>
            <Button onClick={handleNew}><Plus size={16} className="mr-2" />Add Expense</Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-52">
          <Select label="Filter by Category" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">All Categories</option>
            {(categories || []).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </Select>
        </div>
        <div className="w-44">
          <Input label="Filter by Month" type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} />
        </div>
        {(filterCategory || filterMonth) && (
          <Button variant="secondary" onClick={() => { setFilterCategory(""); setFilterMonth("") }}>Clear Filters</Button>
        )}
      </div>

      {/* Summary Cards */}
      {byCategory.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {byCategory.map((c) => (
            <div key={c.name} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">{c.name}</p>
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
            <Select label="Category *" value={form.categoryName} onChange={(e) => setForm({ ...form, categoryName: e.target.value })}>
              <option value="">Select category...</option>
              {(categories || []).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
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

      {/* Manage Categories Modal */}
      <Modal isOpen={showCatModal} onClose={() => setShowCatModal(false)} title="Manage Expense Categories" size="md">
        <div className="space-y-4">
          {/* Add new */}
          <div className="flex gap-2">
            <Input
              label="New Category Name"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="e.g. Vehicle Maintenance"
            />
            <div className="flex items-end">
              <Button onClick={handleAddCategory} loading={savingCat}>Add</Button>
            </div>
          </div>

          {/* List */}
          <div className="border rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Category</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(categories || []).map((c, i) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PALETTE[i % PALETTE.length]}`}>
                        {c.name}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{c.isSystem ? "System" : "Custom"}</td>
                    <td className="px-4 py-2.5 text-right">
                      {!c.isSystem && (
                        <Button size="sm" variant="danger" onClick={() => handleDeactivateCat(c.id)}>
                          <Trash2 size={12} />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setShowCatModal(false)}>Close</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
