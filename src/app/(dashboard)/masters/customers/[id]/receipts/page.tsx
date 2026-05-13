"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Modal } from "@/components/ui/Modal"
import { LoadingPage } from "@/components/ui/Spinner"
import { formatCurrency, formatDate } from "@/lib/utils"
import { ArrowLeft, Plus, Pencil, TrendingDown, TrendingUp, Wallet, Search } from "lucide-react"
import toast, { Toaster } from "react-hot-toast"

interface Receipt {
  id: string
  receiptNo: string
  amount: number
  reference: string | null
  valueDate: string
  whatsappDate: string | null
  notes: string | null
  bank: { name: string }
  createdBy: { name: string } | null
}

interface ReceiptsResponse {
  receipts: Receipt[]
  total: number
}

interface BalanceResponse {
  totalCollected: number
  totalSOValue: number
  balance: number
}

interface Bank {
  id: string
  name: string
}

interface Customer {
  id: string
  name: string
}

const emptyForm = {
  bankId: "",
  amount: "",
  reference: "",
  valueDate: new Date().toISOString().split("T")[0],
  whatsappDate: "",
  notes: "",
}

export default function CustomerReceiptsPage() {
  const { id: customerId } = useParams<{ id: string }>()
  const router = useRouter()

  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")

  const { data: customer } = useFetch<Customer>(`/api/customers/${customerId}`)
  const { data: receiptsData, loading, refetch } = useFetch<ReceiptsResponse>(
    `/api/customers/${customerId}/receipts?limit=200`
  )
  const { data: balance, refetch: refetchBalance } = useFetch<BalanceResponse>(
    `/api/customers/${customerId}/balance`
  )
  const { data: banks } = useFetch<Bank[]>("/api/banks")

  const receipts = receiptsData?.receipts || []

  const filteredReceipts = receipts.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.receiptNo.toLowerCase().includes(q) ||
      r.bank.name.toLowerCase().includes(q) ||
      (r.reference || "").toLowerCase().includes(q)
    )
  })

  const openAdd = () => {
    setEditId(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  const openEdit = (r: Receipt) => {
    setEditId(r.id)
    setForm({
      bankId: banks?.find((b) => b.name === r.bank.name)?.id ?? "",
      amount: String(r.amount),
      reference: r.reference ?? "",
      valueDate: r.valueDate.split("T")[0],
      whatsappDate: r.whatsappDate ? r.whatsappDate.split("T")[0] : "",
      notes: r.notes ?? "",
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.bankId || !form.amount || !form.valueDate) {
      return toast.error("Bank, amount, and Bank Value Date are required")
    }
    setSaving(true)
    try {
      const url = editId
        ? `/api/customers/${customerId}/receipts/${editId}`
        : `/api/customers/${customerId}/receipts`
      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankId: form.bankId,
          amount: parseFloat(form.amount),
          reference: form.reference || null,
          valueDate: form.valueDate,
          whatsappDate: form.whatsappDate || null,
          notes: form.notes || null,
        }),
      })
      if (res.ok) {
        toast.success(editId ? "Receipt updated" : "Receipt recorded")
        setShowModal(false)
        refetch()
        refetchBalance()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to save receipt")
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading && !receiptsData) return <LoadingPage />

  const bal = balance?.balance ?? 0
  const totalCollected = balance?.totalCollected ?? 0
  const totalSOValue = balance?.totalSOValue ?? 0

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button type="button" onClick={() => router.push("/masters/customers")} className="hover:text-gray-800 flex items-center gap-1">
          <ArrowLeft size={14} />Customers
        </button>
        <span>/</span>
        <span className="text-gray-700 font-medium">{customer?.name || "Customer"}</span>
        <span>/</span>
        <span className="text-gray-900 font-semibold">Receipts</span>
      </div>

      <Header
        title={`Receipts — ${customer?.name || ""}`}
        actions={<Button onClick={openAdd}><Plus size={16} className="mr-2" />Add Receipt</Button>}
      />

      {/* Balance Banner */}
      {balance && (
        <div className={`rounded-xl p-4 flex items-center justify-between ${
          bal >= 0 ? "bg-green-50 border border-green-200" : "bg-orange-50 border border-orange-200"
        }`}>
          <div className="flex items-center gap-3">
            {bal >= 0
              ? <TrendingUp size={20} className="text-green-600" />
              : <TrendingDown size={20} className="text-orange-600" />
            }
            <div>
              <p className={`font-semibold text-sm ${bal >= 0 ? "text-green-900" : "text-orange-900"}`}>
                {bal >= 0
                  ? `Advance Credit: ${formatCurrency(bal)}`
                  : `Pending from Customer: ${formatCurrency(Math.abs(bal))}`
                }
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Total collected: {formatCurrency(totalCollected)} · Total SO value: {formatCurrency(totalSOValue)}
              </p>
            </div>
          </div>
          <Wallet size={24} className={bal >= 0 ? "text-green-400" : "text-orange-400"} />
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Total Collected</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalCollected)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Total SO Value</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(totalSOValue)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <p className={`text-sm ${bal >= 0 ? "text-green-600" : "text-gray-500"}`}>
            {bal >= 0 ? "Advance Credit" : "Pending"}
          </p>
          <p className={`text-2xl font-bold mt-1 ${bal >= 0 ? "text-green-600" : "text-orange-600"}`}>
            {formatCurrency(Math.abs(bal))}
          </p>
        </div>
      </div>

      {/* Search + Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
          <h3 className="font-semibold text-gray-900">All Receipts ({receiptsData?.total ?? 0})</h3>
          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search receipts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {["Receipt No.", "Bank Value Date", "Bank", "Amount", "Reference / Slip", "WhatsApp Date", "Notes", "Recorded By", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredReceipts.length > 0 ? filteredReceipts.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-blue-700">{r.receiptNo}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{formatDate(r.valueDate)}</td>
                  <td className="px-4 py-3 text-sm">{r.bank.name}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-green-700">{formatCurrency(r.amount)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{r.reference || "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {r.whatsappDate ? formatDate(r.whatsappDate) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{r.notes || "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{r.createdBy?.name || "—"}</td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                      <Pencil size={13} className="mr-1" />Edit
                    </Button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                    {search ? "No receipts match your search" : "No receipts recorded yet"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? "Edit Receipt" : "Record Receipt"} size="md">
        <div className="space-y-4">
          <Select label="Bank *" required value={form.bankId} onChange={(e) => setForm((p) => ({ ...p, bankId: e.target.value }))}>
            <option value="">Select bank...</option>
            {banks?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Input
            label="Amount in PKR *"
            type="number" step="0.01" required
            value={form.amount}
            onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
            placeholder="e.g. 500000"
          />
          <Input
            label="Reference / Slip Number"
            value={form.reference}
            onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))}
            placeholder="Cheque no, IBFT ref, etc."
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Bank Value Date *"
              type="date" required
              value={form.valueDate}
              onChange={(e) => setForm((p) => ({ ...p, valueDate: e.target.value }))}
            />
            <Input
              label="WhatsApp Confirmation Date"
              type="date"
              value={form.whatsappDate}
              onChange={(e) => setForm((p) => ({ ...p, whatsappDate: e.target.value }))}
            />
          </div>
          <Input
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editId ? "Save Changes" : "Record Receipt"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
