"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Modal } from "@/components/ui/Modal"
import { Table } from "@/components/ui/Table"
import { SearchableSelect } from "@/components/ui/SearchableSelect"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { formatCurrency, formatDate } from "@/lib/utils"
import { ArrowLeft, ArrowRightLeft, Plus, Pencil, TrendingDown, TrendingUp, Wallet } from "lucide-react"
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
  const [transferReceipt, setTransferReceipt] = useState<Receipt | null>(null)
  const [transferTo, setTransferTo] = useState("")
  const [transferring, setTransferring] = useState(false)

  const { data: customer } = useFetch<Customer>(`/api/customers/${customerId}`)
  const { data: allCustomers } = useFetch<Customer[]>("/api/customers")
  const { data: receiptsData, loading, refetch } = useFetch<ReceiptsResponse>(
    `/api/customers/${customerId}/receipts?limit=200`
  )
  const { data: balance, refetch: refetchBalance } = useFetch<BalanceResponse>(
    `/api/customers/${customerId}/balance`
  )
  const { data: banks } = useFetch<Bank[]>("/api/banks")

  const receipts = receiptsData?.receipts || []

  const openAdd = () => {
    setEditId(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  const handleTransfer = async () => {
    if (!transferReceipt || !transferTo) return toast.error("Select the party to transfer to")
    setTransferring(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/receipts/${transferReceipt.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toCustomerId: transferTo }),
      })
      if (res.ok) {
        const target = allCustomers?.find((c) => c.id === transferTo)
        toast.success(`Collection transferred to ${target?.name || "party"}`)
        setTransferReceipt(null)
        setTransferTo("")
        refetch()
        refetchBalance()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to transfer collection")
      }
    } finally {
      setTransferring(false)
    }
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

  if (loading && !receiptsData) return <TableSkeleton columns={5} rows={6} />

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

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">All Receipts ({receiptsData?.total ?? 0})</h3>
        </div>
        <Table
          data={receipts}
          emptyMessage="No receipts recorded yet"
          searchPlaceholder="Search receipt #, bank, reference…"
          defaultSortKey="valueDate"
          defaultSortDir="desc"
          filters={[
            { key: "bank", label: "Bank", value: (r: Receipt) => r.bank.name },
            { key: "valueDate", label: "Value Date", type: "date", value: (r: Receipt) => r.valueDate },
          ]}
          columns={[
            { key: "receiptNo", header: "Receipt No.", sortable: true, render: (r: Receipt) => <span className="font-medium text-blue-700">{r.receiptNo}</span> },
            { key: "valueDate", header: "Bank Value Date", sortable: true, value: (r: Receipt) => r.valueDate, render: (r: Receipt) => <span className="whitespace-nowrap">{formatDate(r.valueDate)}</span> },
            { key: "bank", header: "Bank", sortable: true, value: (r: Receipt) => r.bank.name, render: (r: Receipt) => r.bank.name },
            { key: "amount", header: "Amount", sortable: true, value: (r: Receipt) => r.amount, render: (r: Receipt) => <span className="font-semibold text-green-700">{formatCurrency(r.amount)}</span> },
            { key: "reference", header: "Reference / Slip", render: (r: Receipt) => <span className="text-gray-500">{r.reference || "—"}</span> },
            { key: "whatsappDate", header: "WhatsApp Date", render: (r: Receipt) => <span className="text-gray-500 whitespace-nowrap">{r.whatsappDate ? formatDate(r.whatsappDate) : "—"}</span> },
            { key: "notes", header: "Notes", render: (r: Receipt) => <span className="text-gray-500 max-w-xs truncate inline-block align-bottom">{r.notes || "—"}</span> },
            { key: "createdBy", header: "Recorded By", value: (r: Receipt) => r.createdBy?.name || "—", render: (r: Receipt) => <span className="text-gray-400">{r.createdBy?.name || "—"}</span> },
            { key: "actions", header: "Actions", render: (r: Receipt) => (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil size={13} className="mr-1" />Edit</Button>
                <Button size="sm" variant="ghost" title="Transfer to another party" onClick={() => { setTransferReceipt(r); setTransferTo("") }}>
                  <ArrowRightLeft size={13} className="mr-1" />Transfer
                </Button>
              </div>
            ) },
          ]}
        />
      </div>

      {/* Transfer Modal */}
      <Modal isOpen={Boolean(transferReceipt)} onClose={() => setTransferReceipt(null)} title={`Transfer Collection — ${transferReceipt?.receiptNo}`} size="md">
        {transferReceipt && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              <p className="font-medium text-gray-900">{formatCurrency(transferReceipt.amount)} · {transferReceipt.bank.name}</p>
              <p className="text-gray-500 mt-0.5">
                {formatDate(transferReceipt.valueDate)}{transferReceipt.reference ? ` · Ref: ${transferReceipt.reference}` : ""} — currently under <span className="font-medium">{customer?.name}</span>
              </p>
            </div>
            <SearchableSelect
              label="Transfer to Party"
              required
              placeholder="Type party name to search…"
              options={(allCustomers || []).filter((c) => c.id !== customerId).map((c) => ({ value: c.id, label: c.name }))}
              value={transferTo}
              onChange={setTransferTo}
            />
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              This moves the payment to the selected party&apos;s ledger. Both parties&apos; balances update immediately.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setTransferReceipt(null)}>Cancel</Button>
              <Button onClick={handleTransfer} loading={transferring} disabled={!transferTo}>Transfer Collection</Button>
            </div>
          </div>
        )}
      </Modal>

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
