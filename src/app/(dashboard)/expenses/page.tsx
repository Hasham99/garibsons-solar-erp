"use client"

import { useState, useMemo } from "react"
import { useFetch } from "@/hooks/useFetch"
import { useLookups } from "@/components/lookups/LookupsProvider"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Modal } from "@/components/ui/Modal"
import { Table } from "@/components/ui/Table"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { DetailsModal } from "@/components/ui/DetailsModal"
import { formatAmount, formatCurrency, formatDate } from "@/lib/utils"
import { Plus, Pencil, Trash2, Settings2 } from "lucide-react"
import toast from "react-hot-toast"

// Color palette for categories (auto-assigned by index)
const PALETTE = [
  "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  "bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300",
  "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300",
  "bg-pink-100 text-pink-700 dark:bg-pink-500/10 dark:text-pink-300",
  "bg-muted text-secondary",
  "bg-muted text-secondary",
  "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-300",
  "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300",
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
  // Categories come from the shared lookups cache; refresh() re-pulls after edits.
  const { expenseCategories, refresh: refetchCats } = useLookups()
  const categories = expenseCategories as ExpenseCategoryDef[]

  const [showModal, setShowModal] = useState(false)
  const [showCatModal, setShowCatModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [newCatName, setNewCatName] = useState("")
  const [savingCat, setSavingCat] = useState(false)
  const [filterCategory, setFilterCategory] = useState("")
  const [filterMonth, setFilterMonth] = useState("")
  const [detailRow, setDetailRow] = useState<Expense | null>(null)
  const [deleteExpenseTarget, setDeleteExpenseTarget] = useState<Expense | null>(null)
  const [deletingExpense, setDeletingExpense] = useState(false)
  const [deactivateCategoryTarget, setDeactivateCategoryTarget] = useState<ExpenseCategoryDef | null>(null)
  const [deactivatingCategory, setDeactivatingCategory] = useState(false)

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

  const confirmDeleteExpense = async () => {
    if (!deleteExpenseTarget) return
    setDeletingExpense(true)
    try {
      const res = await fetch(`/api/expenses/${deleteExpenseTarget.id}`, { method: "DELETE" })
      if (res.ok) { toast.success("Deleted"); setDeleteExpenseTarget(null); refetch() }
      else toast.error("Failed to delete")
    } finally {
      setDeletingExpense(false)
    }
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

  const confirmDeactivateCategory = async () => {
    if (!deactivateCategoryTarget) return
    setDeactivatingCategory(true)
    try {
      const res = await fetch(`/api/expense-categories/${deactivateCategoryTarget.id}`, { method: "DELETE" })
      if (res.ok) { toast.success("Category deactivated"); setDeactivateCategoryTarget(null); refetchCats() }
      else toast.error("Failed to deactivate")
    } finally {
      setDeactivatingCategory(false)
    }
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

  const expenseRowActions = (row: Expense): RowAction[] => [
    { label: "Edit", icon: <Pencil size={15} />, onClick: () => handleEdit(row) },
    { label: "Delete Expense", icon: <Trash2 size={15} />, danger: true, onClick: () => setDeleteExpenseTarget(row) },
  ]

  const columns = [
    { key: "date", header: "Date", sortable: true, numeric: true, render: (row: Expense) => formatDate(row.date) },
    {
      key: "category", header: "Category",
      render: (row: Expense) => {
        const name = displayCategory(row)
        return (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${catColorMap[row.categoryName || ""] || "bg-muted text-secondary"}`}>
            {name}
          </span>
        )
      },
    },
    { key: "description", header: "Description" },
    { key: "paidTo", header: "Paid To", render: (row: Expense) => row.paidTo || <span className="text-tertiary">-</span> },
    { key: "reference", header: "Ref #", render: (row: Expense) => row.reference || <span className="text-tertiary">-</span> },
    { key: "amount", header: "Amount (PKR)", numeric: true, render: (row: Expense) => <span className="font-semibold text-red-700 dark:text-red-300">{formatAmount(row.amount)}</span> },
    { key: "createdBy", header: "Entered By", render: (row: Expense) => row.createdBy?.name || "-" },
    {
      key: "actions", header: "Actions",
      render: (row: Expense) => <RowActionsMenu actions={expenseRowActions(row)} />,
    },
  ]

  if (loading) return <TableSkeleton columns={7} rows={10} />

  return (
    <div className="space-y-6 animate-fade-in-up">

      {/* Row details */}
      <DetailsModal
        isOpen={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title="Expense Details"
        fields={detailRow ? [
          { label: "Date", value: formatDate(detailRow.date) },
          { label: "Category", value: detailRow.categoryName || detailRow.category },
          { label: "Amount", value: <span className="font-bold text-red-700 dark:text-red-300">{formatCurrency(detailRow.amount)}</span> },
          { label: "Paid To", value: detailRow.paidTo || "—" },
          { label: "Reference", value: detailRow.reference || "—" },
          { label: "Entered By", value: detailRow.createdBy?.name || "—" },
          { label: "Description", value: detailRow.description, wide: true },
          ...(detailRow.notes ? [{ label: "Notes", value: detailRow.notes, wide: true }] : []),
        ] : []}
        actions={detailRow ? expenseRowActions(detailRow) : []}
      />
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
          {byCategory.map((c, i) => (
            <div key={`${c.name}-${i}`} className="bg-surface rounded-xl shadow-card border border-line p-4">
              <p className="text-xs text-secondary">{c.name}</p>
              <p className="text-lg font-bold text-foreground mt-1">{formatCurrency(c.total)}</p>
            </div>
          ))}
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-4">
            <p className="text-xs text-red-700 dark:text-red-300 font-medium">Total Expenses</p>
            <p className="text-lg font-bold text-red-800 dark:text-red-300 mt-1">{formatCurrency(grandTotal)}</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-surface rounded-xl shadow-card border border-line">
        <Table columns={columns} data={filtered} emptyMessage="No expenses recorded yet" searchPlaceholder="Search description, paid to, ref #…" onRowClick={(row: Expense) => setDetailRow(row)} />
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
          <div className="border border-line rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-secondary uppercase tracking-wide">Category</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-secondary uppercase tracking-wide">Type</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(categories || []).map((c, i) => (
                  <tr key={c.id} className="hover:bg-muted">
                    <td className="px-3 py-2.5 text-[13px]">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PALETTE[i % PALETTE.length]}`}>
                        {c.name}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-secondary">{c.isSystem ? "System" : "Custom"}</td>
                    <td className="px-3 py-2.5 text-right">
                      {!c.isSystem && (
                        <Button size="sm" variant="danger" onClick={() => setDeactivateCategoryTarget(c)}>
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

      <ConfirmDialog
        isOpen={!!deleteExpenseTarget}
        title="Delete Expense"
        message={<>Delete this expense? This cannot be undone.</>}
        confirmLabel="Delete"
        variant="danger"
        loading={deletingExpense}
        onConfirm={confirmDeleteExpense}
        onClose={() => setDeleteExpenseTarget(null)}
      />

      <ConfirmDialog
        isOpen={!!deactivateCategoryTarget}
        title="Deactivate Category"
        message={<>Deactivate category <span className="font-semibold text-foreground">&ldquo;{deactivateCategoryTarget?.name}&rdquo;</span>? Existing expenses will keep it.</>}
        confirmLabel="Deactivate"
        variant="primary"
        loading={deactivatingCategory}
        onConfirm={confirmDeactivateCategory}
        onClose={() => setDeactivateCategoryTarget(null)}
      />
    </div>
  )
}
