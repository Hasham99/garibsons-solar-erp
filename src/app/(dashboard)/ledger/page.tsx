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
import { Table } from "@/components/ui/Table"
import { CsvImport } from "@/components/ui/CsvImport"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Plus, TrendingDown, TrendingUp, Wallet } from "lucide-react"
import toast, { Toaster } from "react-hot-toast"

interface LedgerRow {
  id: string
  date: string
  type: "SO" | "DO" | "PARTIAL" | "RECEIPT"
  reference: string
  soNumber?: string
  doNumber?: string
  description: string
  qtyTotal: number
  qtyDelivered: number
  qtyRemaining: number
  debit: number
  credit: number
  runningBalance: number
}

interface LedgerResponse {
  rows: LedgerRow[]
  totalDebits: number
  totalCredits: number
  balance: number
}

interface Customer {
  id: string
  name: string
}

interface Supplier {
  id: string
  name: string
}

interface Bank {
  id: string
  name: string
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

const TYPE_STYLES: Record<string, string> = {
  SO:      "bg-blue-50 border-l-4 border-l-blue-400",
  DO:      "bg-green-50 border-l-4 border-l-green-400",
  PARTIAL: "bg-amber-50 border-l-4 border-l-amber-400",
  RECEIPT: "bg-purple-50 border-l-4 border-l-purple-400",
}

const TYPE_BADGE: Record<string, string> = {
  SO:      "bg-blue-100 text-blue-700",
  DO:      "bg-green-100 text-green-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  RECEIPT: "bg-purple-100 text-purple-700",
}

export default function LedgerPage() {
  const [tab, setTab] = useState<"customer" | "supplier">("customer")
  const [customerId, setCustomerId] = useState("")
  const [supplierId, setSupplierId] = useState("")
  const [showReceipt, setShowReceipt] = useState(false)
  const [savingReceipt, setSavingReceipt] = useState(false)
  const [receiptForm, setReceiptForm] = useState({
    bankId: "",
    amount: "",
    reference: "",
    valueDate: new Date().toISOString().split("T")[0],
    whatsappDate: "",
    notes: "",
  })

  const { data: customers } = useFetch<Customer[]>("/api/customers")
  const { data: suppliers } = useFetch<Supplier[]>("/api/suppliers")
  const { data: banks } = useFetch<Bank[]>("/api/banks")
  const { data: ledgerData, loading: ledgerLoading, refetch: refetchLedger } = useFetch<LedgerResponse>(
    customerId ? `/api/ledger?customerId=${customerId}` : "",
    [customerId]
  )
  const { data: pos, loading: posLoading } = useFetch<PO[]>("/api/purchase-orders")

  const rows = ledgerData?.rows || []
  const totalDebits = ledgerData?.totalDebits || 0
  const totalCredits = ledgerData?.totalCredits || 0
  const balance = ledgerData?.balance || 0

  const handleRecordReceipt = async () => {
    if (!customerId || !receiptForm.bankId || !receiptForm.amount || !receiptForm.valueDate) {
      return toast.error("Bank, amount and date are required")
    }
    setSavingReceipt(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/receipts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankId: receiptForm.bankId,
          amount: parseFloat(receiptForm.amount),
          reference: receiptForm.reference || null,
          valueDate: receiptForm.valueDate,
          whatsappDate: receiptForm.whatsappDate || null,
          notes: receiptForm.notes || null,
        }),
      })
      if (res.ok) {
        toast.success("Collection recorded")
        setShowReceipt(false)
        setReceiptForm({ bankId: "", amount: "", reference: "", valueDate: new Date().toISOString().split("T")[0], whatsappDate: "", notes: "" })
        refetchLedger()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to record collection")
      }
    } finally {
      setSavingReceipt(false)
    }
  }

  const filteredPOs = supplierId
    ? (pos || []).filter((p) => p.supplier && (suppliers?.find((s) => s.id === supplierId)?.name === p.supplier.name))
    : (pos || [])

  const supplierTotalPkr = filteredPOs.reduce((s, p) => s + p.poAmountPkr, 0)
  const supplierTotalLanded = filteredPOs.reduce((s, p) => s + (p.totalLandedCost || 0), 0)

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <Header
        title="Party Ledger"
        actions={
          tab === "customer" ? (
            <div className="flex gap-2">
              <CsvImport
                endpoint="/api/import/collections"
                title="Import Collections"
                sampleName="collections"
                guide="Each payment becomes a collection receipt linked to the party. Bank codes (HBL, UBL, THAL, GS HO …) are auto-mapped; blank party rows go to Bilal Riaz; S.NO is kept in notes."
                sampleColumns={["S.NO", "Date", "Party Name", "Bank", "Bank Ref", "Amount"]}
                sampleRows={[
                  ["12785", "2026-05-01", "Fd Solar", "THAL", "626169", "1000000"],
                  ["12786", "2026-05-01", "Onyx Solar", "THAL", "217152-1", "3890000"],
                ]}
                onComplete={() => customerId && refetchLedger()}
              />
              {customerId && (
                <Button onClick={() => setShowReceipt(true)}>
                  <Plus size={16} className="mr-2" />Record Collection
                </Button>
              )}
            </div>
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
                  <option value="">— Select a customer —</option>
                  {customers?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
            </div>
          </Card>

          {customerId && (
            <>
              {/* Balance Banner */}
              {!ledgerLoading && ledgerData && (
                <div className={`rounded-xl p-4 flex items-center justify-between ${
                  balance <= 0
                    ? "bg-green-50 border border-green-200"
                    : "bg-orange-50 border border-orange-200"
                }`}>
                  <div className="flex items-center gap-3">
                    {balance <= 0
                      ? <TrendingUp size={20} className="text-green-600" />
                      : <TrendingDown size={20} className="text-orange-600" />
                    }
                    <div>
                      <p className={`font-semibold text-sm ${balance <= 0 ? "text-green-900" : "text-orange-900"}`}>
                        {balance <= 0
                          ? `Advance Credit: ${formatCurrency(Math.abs(balance))}`
                          : `Pending Receivable: ${formatCurrency(balance)}`
                        }
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Total SO value: {formatCurrency(totalDebits)} · Total collected: {formatCurrency(totalCredits)}
                      </p>
                    </div>
                  </div>
                  <Wallet size={24} className={balance <= 0 ? "text-green-400" : "text-orange-400"} />
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <p className="text-sm text-gray-500">Total Debit (SOs)</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(totalDebits)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <p className="text-sm text-gray-500">Total Collected</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalCredits)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <p className={`text-sm ${balance <= 0 ? "text-green-600" : "text-gray-500"}`}>
                    {balance <= 0 ? "Advance Credit" : "Net Receivable"}
                  </p>
                  <p className={`text-2xl font-bold mt-1 ${balance <= 0 ? "text-green-600" : "text-orange-600"}`}>
                    {formatCurrency(Math.abs(balance))}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Ledger Entries</h3>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    {[
                      { color: "bg-blue-100 text-blue-700",   label: "Sales Order" },
                      { color: "bg-green-100 text-green-700", label: "Delivery Order" },
                      { color: "bg-amber-100 text-amber-700", label: "Partial" },
                      { color: "bg-purple-100 text-purple-700", label: "Collection" },
                    ].map((b) => (
                      <span key={b.label} className={`px-2 py-0.5 rounded-full font-medium ${b.color}`}>{b.label}</span>
                    ))}
                  </div>
                </div>
                {ledgerLoading ? (
                  <TableSkeleton columns={5} rows={6} />
                ) : (
                  <Table
                    data={rows}
                    emptyMessage="No ledger entries for this customer"
                    rowClassName={(row: LedgerRow) => TYPE_STYLES[row.type]}
                    searchPlaceholder="Search reference, description…"
                    filters={[
                      {
                        key: "type",
                        label: "Entry Type",
                        value: (row: LedgerRow) => row.type,
                        options: [
                          { value: "SO", label: "Sales Order" },
                          { value: "DO", label: "Delivery Order" },
                          { value: "PARTIAL", label: "Partial" },
                          { value: "RECEIPT", label: "Collection" },
                        ],
                      },
                    ]}
                    columns={[
                      { key: "date", header: "Date", sortable: true, value: (row: LedgerRow) => row.date, render: (row: LedgerRow) => <span className="text-xs text-gray-600 whitespace-nowrap">{formatDate(row.date)}</span> },
                      {
                        key: "type", header: "Type",
                        render: (row: LedgerRow) => (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${TYPE_BADGE[row.type]}`}>
                            {row.type === "SO" ? "Sales Order" : row.type === "DO" ? `DO (${row.soNumber})` : row.type === "PARTIAL" ? "Partial" : "Collection"}
                          </span>
                        ),
                      },
                      { key: "reference", header: "Reference", sortable: true, render: (row: LedgerRow) => <span className="text-xs font-medium text-gray-800 whitespace-nowrap">{row.reference}</span> },
                      { key: "description", header: "Description", render: (row: LedgerRow) => <span className="text-xs text-gray-600">{row.description}</span> },
                      { key: "qtyTotal", header: "Total Qty", render: (row: LedgerRow) => <span className="text-xs text-gray-700">{row.qtyTotal > 0 ? row.qtyTotal.toLocaleString() : "—"}</span> },
                      { key: "qtyDelivered", header: "Delivered", render: (row: LedgerRow) => <span className="text-xs text-green-700 font-medium">{row.qtyDelivered > 0 ? row.qtyDelivered.toLocaleString() : "—"}</span> },
                      { key: "qtyRemaining", header: "Remaining", render: (row: LedgerRow) => row.qtyRemaining > 0 ? <span className="text-xs text-amber-700 font-medium">{row.qtyRemaining.toLocaleString()}</span> : <span className="text-xs">—</span> },
                      { key: "debit", header: "Debit", sortable: true, render: (row: LedgerRow) => <span className="text-xs text-red-600 font-medium whitespace-nowrap">{row.debit > 0 ? formatCurrency(row.debit) : "—"}</span> },
                      { key: "credit", header: "Credit", sortable: true, render: (row: LedgerRow) => <span className="text-xs text-green-600 font-medium whitespace-nowrap">{row.credit > 0 ? formatCurrency(row.credit) : "—"}</span> },
                      { key: "runningBalance", header: "Balance", render: (row: LedgerRow) => <span className={`text-xs font-bold whitespace-nowrap ${row.runningBalance <= 0 ? "text-green-700" : "text-gray-900"}`}>{formatCurrency(row.runningBalance)}</span> },
                    ]}
                  />
                )}
              </div>
            </>
          )}

          {!customerId && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-400">
              Select a customer above to view their ledger
            </div>
          )}
        </>
      )}

      {/* ── Record Collection Modal ── */}
      <Modal isOpen={showReceipt} onClose={() => setShowReceipt(false)} title="Record Collection" size="md">
        <div className="space-y-4">
          <Select label="Bank *" required value={receiptForm.bankId} onChange={(e) => setReceiptForm((p) => ({ ...p, bankId: e.target.value }))}>
            <option value="">Select bank...</option>
            {banks?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Input
            label="Amount (PKR) *"
            type="number" step="0.01" required
            value={receiptForm.amount}
            onChange={(e) => setReceiptForm((p) => ({ ...p, amount: e.target.value }))}
            placeholder="e.g. 500000"
          />
          <Input
            label="Reference / Slip No."
            value={receiptForm.reference}
            onChange={(e) => setReceiptForm((p) => ({ ...p, reference: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Bank Value Date *"
              type="date" required
              value={receiptForm.valueDate}
              onChange={(e) => setReceiptForm((p) => ({ ...p, valueDate: e.target.value }))}
            />
            <Input
              label="WhatsApp Confirmation Date"
              type="date"
              value={receiptForm.whatsappDate}
              onChange={(e) => setReceiptForm((p) => ({ ...p, whatsappDate: e.target.value }))}
            />
          </div>
          <Input
            label="Notes"
            value={receiptForm.notes}
            onChange={(e) => setReceiptForm((p) => ({ ...p, notes: e.target.value }))}
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowReceipt(false)}>Cancel</Button>
            <Button variant="success" onClick={handleRecordReceipt} loading={savingReceipt}>Record Collection</Button>
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
              <TableSkeleton columns={5} rows={6} />
            ) : (
              <Table
                data={filteredPOs}
                emptyMessage="No purchase orders found"
                searchPlaceholder="Search PO #, supplier…"
                filters={[
                  { key: "status", label: "Status", value: (po: PO) => po.status },
                  { key: "createdAt", label: "Date", type: "date", value: (po: PO) => po.createdAt },
                ]}
                columns={[
                  { key: "createdAt", header: "Date", sortable: true, value: (po: PO) => po.createdAt, render: (po: PO) => formatDate(po.createdAt) },
                  { key: "poNumber", header: "PO Number", sortable: true, render: (po: PO) => <span className="font-medium">{po.poNumber}</span> },
                  { key: "supplier", header: "Supplier", sortable: true, value: (po: PO) => po.supplier?.name || "—", render: (po: PO) => po.supplier?.name || "—" },
                  { key: "noOfPanels", header: "Panels", sortable: true, value: (po: PO) => po.noOfPanels, render: (po: PO) => `${po.noOfPanels.toLocaleString()} × ${po.panelWattage}W` },
                  { key: "totalValueUsd", header: "USD Value", sortable: true, render: (po: PO) => `$${po.totalValueUsd.toLocaleString()}` },
                  { key: "poAmountPkr", header: "PKR Amount", sortable: true, render: (po: PO) => <span className="font-medium text-red-600">{formatCurrency(po.poAmountPkr)}</span> },
                  { key: "totalLandedCost", header: "Landed Cost", render: (po: PO) => po.totalLandedCost ? <span className="text-blue-700">{formatCurrency(po.totalLandedCost)}</span> : <span className="text-gray-400">—</span> },
                  { key: "status", header: "Status", render: (po: PO) => <Badge status={po.status} /> },
                ]}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
