"use client"

import { useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Select } from "@/components/ui/Select"
import { Card } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Modal } from "@/components/ui/Modal"
import { LoadingPage } from "@/components/ui/Spinner"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Plus } from "lucide-react"
import toast, { Toaster } from "react-hot-toast"

interface LedgerEntry {
  id: string
  date: string
  description: string
  debit: number
  credit: number
  runningBalance: number
  invoice: { invoiceNumber: string } | null
  salesOrder: { soNumber: string } | null
}

interface Customer {
  id: string
  name: string
}

interface Supplier {
  id: string
  name: string
}

interface SOOption {
  id: string
  soNumber: string
  customer: { id: string; name: string }
  grandTotal: number
  status: string
}

interface PO {
  id: string
  poNumber: string
  supplier: { name: string }
  noOfPanels: number
  panelWattage: number
  totalValueUsd: number
  poAmountPkr: number
  totalLandedCost: number | null
  status: string
  createdAt: string
}

export default function LedgerPage() {
  const [tab, setTab] = useState<"customer" | "supplier">("customer")
  const [customerId, setCustomerId] = useState("")
  const [supplierId, setSupplierId] = useState("")
  const [showReceipt, setShowReceipt] = useState(false)
  const [savingReceipt, setSavingReceipt] = useState(false)
  const [receiptForm, setReceiptForm] = useState({
    customerId: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    description: "",
    reference: "",
    soId: "",
  })

  const { data: customers } = useFetch<Customer[]>("/api/customers")
  const { data: suppliers } = useFetch<Supplier[]>("/api/suppliers")
  const { data: salesOrders } = useFetch<SOOption[]>("/api/sales-orders")
  const { data: ledger, loading: ledgerLoading, refetch: refetchLedger } = useFetch<LedgerEntry[]>(
    customerId ? `/api/ledger?customerId=${customerId}` : "/api/ledger",
    [customerId]
  )
  const { data: pos, loading: posLoading } = useFetch<PO[]>("/api/purchase-orders")

  const eligibleSOs = (salesOrders || []).filter((o) =>
    ["PAYMENT_CONFIRMED", "DO_ISSUED", "DELIVERED", "INVOICED"].includes(o.status)
  )
  const filteredSOs = receiptForm.customerId
    ? eligibleSOs.filter((o) => o.customer.id === receiptForm.customerId)
    : eligibleSOs

  const handleRecordReceipt = async () => {
    if (!receiptForm.customerId || !receiptForm.amount || !receiptForm.date) {
      return toast.error("Customer, amount and date are required")
    }
    setSavingReceipt(true)
    try {
      const res = await fetch("/api/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: receiptForm.customerId,
          amount: receiptForm.amount,
          date: receiptForm.date,
          description: receiptForm.description || (receiptForm.reference ? `Collection — ${receiptForm.reference}` : "Collection Receipt"),
          reference: receiptForm.reference,
          soId: receiptForm.soId || undefined,
        }),
      })
      if (res.ok) {
        toast.success("Receipt recorded in ledger")
        setShowReceipt(false)
        setReceiptForm({ customerId: "", amount: "", date: new Date().toISOString().split("T")[0], description: "", reference: "", soId: "" })
        refetchLedger()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to record receipt")
      }
    } finally {
      setSavingReceipt(false)
    }
  }

  const filteredPOs = supplierId ? (pos || []).filter((p) => p.supplier && (suppliers?.find((s) => s.id === supplierId)?.name === p.supplier.name)) : (pos || [])

  const totalDebit = ledger?.reduce((s, e) => s + e.debit, 0) || 0
  const totalCredit = ledger?.reduce((s, e) => s + e.credit, 0) || 0
  const netBalance = totalDebit - totalCredit

  // Customer aging
  const now = new Date()
  const aging = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, over90: 0 }
  ledger?.forEach((entry) => {
    if (entry.debit > entry.credit) {
      const days = Math.floor((now.getTime() - new Date(entry.date).getTime()) / (1000 * 60 * 60 * 24))
      const outstanding = entry.debit - entry.credit
      if (days <= 0) aging.current += outstanding
      else if (days <= 30) aging["1-30"] += outstanding
      else if (days <= 60) aging["31-60"] += outstanding
      else if (days <= 90) aging["61-90"] += outstanding
      else aging.over90 += outstanding
    }
  })

  // Supplier summary
  const supplierTotalPkr = filteredPOs.reduce((s, p) => s + p.poAmountPkr, 0)
  const supplierTotalLanded = filteredPOs.reduce((s, p) => s + (p.totalLandedCost || 0), 0)

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <Header
        title="Party Ledger"
        actions={
          tab === "customer" ? (
            <Button onClick={() => setShowReceipt(true)}>
              <Plus size={16} className="mr-2" />Record Collection
            </Button>
          ) : undefined
        }
      />

      {/* Tab Switch */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(["customer", "supplier"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
              tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "customer" ? "Customer (Sales)" : "Supplier (Purchase)"}
          </button>
        ))}
      </div>

      {/* ── Customer Ledger ── */}
      {tab === "customer" && (
        <>
          <Card>
            <div className="flex items-end gap-4">
              <div className="w-72">
                <Select label="Select Customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">All Customers</option>
                  {customers?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Total Debit</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(totalDebit)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Total Credit</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalCredit)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Net Receivable</p>
              <p className={`text-2xl font-bold mt-1 ${netBalance > 0 ? "text-orange-600" : "text-green-600"}`}>
                {formatCurrency(Math.abs(netBalance))}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Receivables Aging</h3>
            <div className="grid grid-cols-5 gap-4">
              {[
                { label: "Current", value: aging.current, color: "green" },
                { label: "1–30 days", value: aging["1-30"], color: "yellow" },
                { label: "31–60 days", value: aging["31-60"], color: "orange" },
                { label: "61–90 days", value: aging["61-90"], color: "red" },
                { label: "Over 90", value: aging.over90, color: "red" },
              ].map(({ label, value, color }) => (
                <div key={label} className={`p-3 rounded-lg bg-${color}-50 border border-${color}-100`}>
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className={`font-bold text-${color}-700 mt-1`}>{formatCurrency(value)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Ledger Entries</h3>
            </div>
            {ledgerLoading ? (
              <LoadingPage />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Date", "Description", "Reference", "Debit", "Credit", "Balance"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {ledger && ledger.length > 0 ? ledger.map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">{formatDate(entry.date)}</td>
                        <td className="px-4 py-3 text-sm">{entry.description}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {entry.invoice?.invoiceNumber || entry.salesOrder?.soNumber || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-red-600 font-medium">
                          {entry.debit > 0 ? formatCurrency(entry.debit) : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-green-600 font-medium">
                          {entry.credit > 0 ? formatCurrency(entry.credit) : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm font-bold">{formatCurrency(entry.runningBalance)}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-gray-400">No ledger entries found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Record Collection / Receipt Modal ── */}
      <Modal isOpen={showReceipt} onClose={() => setShowReceipt(false)} title="Record Collection / Receipt" size="lg">
        <div className="space-y-4">
          <div className="rounded-xl border border-green-100 bg-green-50 p-4">
            <p className="text-sm font-semibold text-green-900">Record a customer payment or collection</p>
            <p className="mt-1 text-xs text-green-700">
              This creates a credit entry in the customer ledger. Link to a Sales Order if applicable.
            </p>
          </div>

          <Select
            label="Customer *"
            required
            value={receiptForm.customerId}
            onChange={(e) => setReceiptForm((prev) => ({ ...prev, customerId: e.target.value, soId: "" }))}
          >
            <option value="">Select customer...</option>
            {customers?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Amount (PKR) *"
              type="number"
              step="0.01"
              required
              value={receiptForm.amount}
              onChange={(e) => setReceiptForm((prev) => ({ ...prev, amount: e.target.value }))}
              placeholder="e.g. 500000"
            />
            <Input
              label="Date *"
              type="date"
              required
              value={receiptForm.date}
              onChange={(e) => setReceiptForm((prev) => ({ ...prev, date: e.target.value }))}
            />
          </div>

          <Input
            label="Description"
            value={receiptForm.description}
            onChange={(e) => setReceiptForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="e.g. Cheque payment, bank transfer..."
          />

          <Input
            label="Reference / Cheque No."
            value={receiptForm.reference}
            onChange={(e) => setReceiptForm((prev) => ({ ...prev, reference: e.target.value }))}
            placeholder="Optional"
          />

          <Select
            label="Link to Sales Order (optional)"
            value={receiptForm.soId}
            onChange={(e) => setReceiptForm((prev) => ({ ...prev, soId: e.target.value }))}
          >
            <option value="">Without SO (standalone receipt)</option>
            {filteredSOs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.soNumber} — {o.customer.name} — Rs {o.grandTotal.toLocaleString()}
              </option>
            ))}
          </Select>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowReceipt(false)}>Cancel</Button>
            <Button variant="success" onClick={handleRecordReceipt} loading={savingReceipt}>
              Record Receipt
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Supplier Ledger ── */}
      {tab === "supplier" && (
        <>
          <Card>
            <div className="flex items-end gap-4">
              <div className="w-72">
                <Select label="Select Supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">All Suppliers</option>
                  {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Total PO Value (PKR)</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(supplierTotalPkr)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Total Landed Cost (PKR)</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{formatCurrency(supplierTotalLanded)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Active POs</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {filteredPOs.filter((p) => !["RECEIVED", "CANCELLED"].includes(p.status)).length}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Purchase Orders</h3>
            </div>
            {posLoading ? (
              <LoadingPage />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Date", "PO Number", "Supplier", "Panels", "USD Value", "PKR Amount", "Landed Cost", "Status"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredPOs.length > 0 ? filteredPOs.map((po) => (
                      <tr key={po.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">{formatDate(po.createdAt)}</td>
                        <td className="px-4 py-3 text-sm font-medium">{po.poNumber}</td>
                        <td className="px-4 py-3 text-sm">{po.supplier?.name || "—"}</td>
                        <td className="px-4 py-3 text-sm">{po.noOfPanels.toLocaleString()} × {po.panelWattage}W</td>
                        <td className="px-4 py-3 text-sm">${po.totalValueUsd.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm font-medium text-red-600">{formatCurrency(po.poAmountPkr)}</td>
                        <td className="px-4 py-3 text-sm text-blue-700">
                          {po.totalLandedCost ? formatCurrency(po.totalLandedCost) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm"><Badge status={po.status} /></td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-gray-400">No purchase orders found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
