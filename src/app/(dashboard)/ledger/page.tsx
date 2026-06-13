"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useFetch } from "@/hooks/useFetch"
import { useAuth } from "@/hooks/useAuth"
import { Header } from "@/components/layout/Header"
import { Select } from "@/components/ui/Select"
import { Card } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Modal } from "@/components/ui/Modal"
import { Drawer } from "@/components/ui/Drawer"
import { Table } from "@/components/ui/Table"
import { CsvImport } from "@/components/ui/CsvImport"
import { SearchableSelect } from "@/components/ui/SearchableSelect"
import { Popover } from "@/components/ui/Popover"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu"
import { StatCardSkeleton, TableSkeleton } from "@/components/ui/Skeleton"
import { formatAmount, formatCurrency, formatDate } from "@/lib/utils"
import { downloadPdf } from "@/lib/pdf"
import { downloadExcel } from "@/lib/excel"
import { Banknote, CheckSquare, Eye, FileDown, FileSpreadsheet, Pencil, Plus, SlidersHorizontal, Trash2, TrendingDown, TrendingUp, Wallet, X } from "lucide-react"
import toast from "react-hot-toast"

interface ReceiptDetail {
  id: string
  receiptNo: string
  bankId: string
  bankName: string
  amount: number
  reference: string | null
  valueDate: string
  whatsappDate: string | null
  notes: string | null
}

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
  customerId: string
  customerName: string
  soId?: string
  doId?: string
  receipt?: ReceiptDetail
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

interface SODetail {
  id: string
  soNumber: string
  status: string
  orderDate: string
  createdAt: string
  subTotal: number
  gstRate: number
  gstAmount: number
  grandTotal: number
  notes: string | null
  customer: { name: string }
  lines: Array<{
    id: string
    quantity: number
    watts: number
    ratePerWatt: number
    ratePerPanel: number
    totalAmount: number
    product: { name: string; wattage: number }
  }>
  deliveryOrders: Array<{ id: string; doNumber: string; status: string; quantity: number }>
}

interface DODetail {
  id: string
  doNumber: string
  status: string
  quantity: number
  watts: number
  notes: string | null
  createdAt: string
  dispatchedAt: string | null
  warehouse: { name: string }
  salesOrder: { id: string; soNumber: string; customer: { name: string } }
  lines: Array<{ id: string; quantity: number; watts: number; product: { name: string; wattage: number } }>
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

const TYPE_LABEL = (row: LedgerRow) =>
  row.type === "SO" ? "Sales Order" : row.type === "DO" ? "Delivery" : row.type === "PARTIAL" ? "Partial" : "Collection"

const emptyReceiptForm = {
  bankId: "",
  amount: "",
  reference: "",
  valueDate: new Date().toISOString().split("T")[0],
  whatsappDate: "",
  notes: "",
}

export default function LedgerPage() {
  const { user } = useAuth()
  const canDelete = ["ADMIN", "ACCOUNTS"].includes(user?.role || "")

  const searchParams = useSearchParams()
  const [tab, setTab] = useState<"customer" | "supplier">("customer")
  // Supports deep links like /ledger?customerId=… (e.g. from the customer profile page)
  const [customerId, setCustomerId] = useState(searchParams.get("customerId") || "")
  const [range, setRange] = useState({ from: "", to: "" })
  const filteredLedgerRef = useRef<LedgerRow[]>([])
  const filteredPOsRef = useRef<PO[]>([])
  const [supplierId, setSupplierId] = useState("")
  const [showReceipt, setShowReceipt] = useState(false)
  const [savingReceipt, setSavingReceipt] = useState(false)
  const [receiptForm, setReceiptForm] = useState(emptyReceiptForm)

  // Row actions state
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [editReceiptRow, setEditReceiptRow] = useState<LedgerRow | null>(null)
  const [editForm, setEditForm] = useState(emptyReceiptForm)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ kind: "single"; row: LedgerRow } | { kind: "bulk" } | null>(null)
  const [viewSOId, setViewSOId] = useState<string | null>(null)
  const [viewDOId, setViewDOId] = useState<string | null>(null)

  const { data: customers } = useFetch<Customer[]>("/api/customers")
  const { data: suppliers } = useFetch<Supplier[]>("/api/suppliers")
  const { data: banks } = useFetch<Bank[]>("/api/banks")

  const rangeQs = [
    range.from ? `from=${range.from}` : "",
    range.to ? `to=${range.to}` : "",
  ].filter(Boolean).join("&")
  const ledgerUrl = customerId
    ? `/api/ledger?customerId=${customerId}`
    : `/api/ledger${rangeQs ? `?${rangeQs}` : ""}`
  const { data: ledgerData, loading: ledgerLoading, refetch: refetchLedger } = useFetch<LedgerResponse>(
    tab === "customer" ? ledgerUrl : "",
    [tab, customerId, rangeQs]
  )
  const { data: pos, loading: posLoading } = useFetch<PO[]>("/api/purchase-orders")
  const { data: soDetail, loading: soDetailLoading } = useFetch<SODetail>(viewSOId ? `/api/sales-orders/${viewSOId}` : "", [viewSOId])
  const { data: doDetail, loading: doDetailLoading } = useFetch<DODetail>(viewDOId ? `/api/delivery-orders/${viewDOId}` : "", [viewDOId])

  const rows = ledgerData?.rows || []
  const totalDebits = ledgerData?.totalDebits || 0
  const totalCredits = ledgerData?.totalCredits || 0
  const balance = ledgerData?.balance || 0
  const receiptCount = rows.filter((r) => r.type === "RECEIPT").length

  // Clear selection whenever the underlying data scope changes
  useEffect(() => { setSelected({}); setSelectMode(false) }, [customerId, rangeQs, tab])

  const selectedIds = Object.keys(selected).filter((id) => selected[id])

  const partyName = customerId ? customers?.find((c) => c.id === customerId)?.name || "" : ""

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
        setReceiptForm(emptyReceiptForm)
        refetchLedger()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to record collection")
      }
    } finally {
      setSavingReceipt(false)
    }
  }

  const openEditReceipt = (row: LedgerRow) => {
    if (!row.receipt) return
    setEditReceiptRow(row)
    setEditForm({
      bankId: row.receipt.bankId,
      amount: String(row.receipt.amount),
      reference: row.receipt.reference ?? "",
      valueDate: row.receipt.valueDate.split("T")[0],
      whatsappDate: row.receipt.whatsappDate ? row.receipt.whatsappDate.split("T")[0] : "",
      notes: row.receipt.notes ?? "",
    })
  }

  const handleSaveEdit = async () => {
    if (!editReceiptRow?.receipt) return
    if (!editForm.bankId || !editForm.amount || !editForm.valueDate) {
      return toast.error("Bank, amount and date are required")
    }
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/customers/${editReceiptRow.customerId}/receipts/${editReceiptRow.receipt.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankId: editForm.bankId,
          amount: parseFloat(editForm.amount),
          reference: editForm.reference || null,
          valueDate: editForm.valueDate,
          whatsappDate: editForm.whatsappDate || null,
          notes: editForm.notes || null,
        }),
      })
      if (res.ok) {
        toast.success("Collection updated")
        setEditReceiptRow(null)
        refetchLedger()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to update collection")
      }
    } finally {
      setSavingEdit(false)
    }
  }

  const performDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      if (confirmDelete.kind === "single") {
        const row = confirmDelete.row
        if (!row.receipt) return
        const res = await fetch(`/api/customers/${row.customerId}/receipts/${row.receipt.id}`, { method: "DELETE" })
        if (res.ok) {
          toast.success("Collection deleted")
          refetchLedger()
        } else {
          const data = await res.json()
          toast.error(data.error || "Failed to delete collection")
        }
      } else {
        const res = await fetch("/api/receipts/bulk-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: selectedIds }),
        })
        if (res.ok) {
          const data = await res.json()
          toast.success(`Deleted ${data.deleted} collection(s)`)
          setSelected({})
          setSelectMode(false)
          refetchLedger()
        } else {
          const data = await res.json()
          toast.error(data.error || "Failed to delete collections")
        }
      }
    } finally {
      setDeleting(false)
      setConfirmDelete(null)
    }
  }

  const selectAllVisibleReceipts = () => {
    const visible = (filteredLedgerRef.current.length ? filteredLedgerRef.current : rows).filter((r) => r.type === "RECEIPT")
    if (visible.length === 0) return toast.error("No collections in the current view")
    setSelected(Object.fromEntries(visible.map((r) => [r.id, true])))
  }

  // ── Exports ──
  const ledgerExportData = () => {
    const visible = filteredLedgerRef.current.length ? filteredLedgerRef.current : rows
    if (visible.length === 0) return null
    // Statement always reads oldest → newest, regardless of on-screen sort.
    const exportRows = [...visible].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const isFiltered = exportRows.length !== rows.length
    const times = exportRows.map((r) => new Date(r.date).getTime())
    const from = new Date(Math.min(...times)).toISOString()
    const to = new Date(Math.max(...times)).toISOString()
    const debits = exportRows.reduce((s, r) => s + r.debit, 0)
    const credits = exportRows.reduce((s, r) => s + r.credit, 0)
    return { exportRows, isFiltered, from, to, debits, credits }
  }

  const n = (v: number) => Math.round(v).toLocaleString("en-PK")

  const buildPartyExport = () => {
    const d = ledgerExportData()
    if (!customerId || !d) { toast.error("Nothing to export"); return null }
    return {
      title: "Party Ledger Statement",
      subtitle: `Party: ${partyName}`,
      metaLines: [
        `Period: ${formatDate(d.from)} – ${formatDate(d.to)}${d.isFiltered ? "  (filtered view)" : ""}`,
        `Entries: ${d.exportRows.length}`,
      ],
      kpis: [
        { label: "Total Sales (Charges)", value: formatCurrency(d.debits) },
        { label: "Total Payments", value: formatCurrency(d.credits) },
        { label: d.debits - d.credits >= 0 ? "Balance Owed" : "Advance Held", value: formatCurrency(Math.abs(d.debits - d.credits)) },
      ],
      headers: ["Date", "Type", "Reference", "Description", "Charges (Rs)", "Payments (Rs)", "Balance (Rs)"],
      rows: d.exportRows.map((r) => [
        formatDate(r.date), TYPE_LABEL(r), r.reference, r.description,
        r.debit > 0 ? n(r.debit) : "—", r.credit > 0 ? n(r.credit) : "—", n(r.runningBalance),
      ]),
      totalsRow: ["", "", "", "TOTAL", n(d.debits), n(d.credits), n(d.debits - d.credits)],
      fileName: `party-ledger-${partyName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
    }
  }

  const buildOverallExport = () => {
    const d = ledgerExportData()
    if (!d) { toast.error("Nothing to export"); return null }
    return {
      title: "All Parties Ledger",
      subtitle: "Combined sales, deliveries and collections — all parties",
      metaLines: [
        `Period: ${formatDate(d.from)} – ${formatDate(d.to)}${d.isFiltered ? "  (filtered view)" : ""}`,
        `Entries: ${d.exportRows.length}`,
      ],
      kpis: [
        { label: "Total Sales (Charges)", value: formatCurrency(d.debits) },
        { label: "Total Collections", value: formatCurrency(d.credits) },
        { label: "Net Receivable", value: formatCurrency(d.debits - d.credits) },
      ],
      headers: ["Date", "Type", "Party", "Reference", "Description", "Charges (Rs)", "Collections (Rs)"],
      rows: d.exportRows.map((r) => [
        formatDate(r.date), TYPE_LABEL(r), r.customerName, r.reference, r.description,
        r.debit > 0 ? n(r.debit) : "—", r.credit > 0 ? n(r.credit) : "—",
      ]),
      totalsRow: ["", "", "", "", "TOTAL", n(d.debits), n(d.credits)],
      fileName: `all-parties-ledger-${new Date().toISOString().slice(0, 10)}`,
    }
  }

  const exportLedger = (format: "pdf" | "excel") => {
    const built = customerId ? buildPartyExport() : buildOverallExport()
    if (!built) return
    if (format === "pdf") {
      downloadPdf({
        title: built.title,
        subtitle: built.subtitle,
        metaLines: built.metaLines,
        kpis: built.kpis,
        columns: built.headers.map((h) => ({ header: h, align: h.includes("(Rs)") ? "right" as const : "left" as const })),
        rows: built.rows,
        totalsRow: built.totalsRow,
        fileName: built.fileName,
        orientation: "landscape",
      })
    } else {
      downloadExcel({
        title: built.title,
        subtitle: built.subtitle,
        metaLines: built.metaLines,
        kpis: built.kpis,
        headers: built.headers,
        rows: built.rows,
        totalsRow: built.totalsRow,
        fileName: built.fileName,
        sheetName: "Ledger",
      })
    }
  }

  const filteredPOs = supplierId
    ? (pos || []).filter((p) => p.supplier && (suppliers?.find((s) => s.id === supplierId)?.name === p.supplier.name))
    : (pos || [])

  const exportSupplierPdf = () => {
    const exportRows = filteredPOsRef.current.length ? filteredPOsRef.current : filteredPOs
    if (exportRows.length === 0) return toast.error("Nothing to export")
    const supplierName = supplierId ? suppliers?.find((s) => s.id === supplierId)?.name : "All Suppliers"
    const totalPkr = exportRows.reduce((s, p) => s + p.poAmountPkr, 0)
    const totalLanded = exportRows.reduce((s, p) => s + (p.totalLandedCost || 0), 0)
    downloadPdf({
      title: "Supplier Ledger — Purchase Orders",
      subtitle: `Supplier: ${supplierName || "All Suppliers"}`,
      metaLines: [`Purchase orders: ${exportRows.length}`],
      kpis: [
        { label: "Total PO Value", value: formatCurrency(totalPkr) },
        { label: "Total Landed Cost", value: formatCurrency(totalLanded) },
        { label: "Active POs", value: String(exportRows.filter((p) => !["RECEIVED", "CANCELLED"].includes(p.status)).length) },
      ],
      columns: [
        { header: "Date" },
        { header: "PO #" },
        { header: "Supplier" },
        { header: "Panels", align: "right" },
        { header: "PKR Value", align: "right" },
        { header: "Landed Cost", align: "right" },
        { header: "Status" },
      ],
      rows: exportRows.map((p) => [
        formatDate(p.createdAt), p.poNumber, p.supplier?.name || "—",
        `${p.noOfPanels.toLocaleString()} × ${p.panelWattage}W`,
        n(p.poAmountPkr), p.totalLandedCost ? n(p.totalLandedCost) : "—", p.status,
      ]),
      totalsRow: ["", "", "", "TOTAL", n(totalPkr), n(totalLanded), ""],
      fileName: `supplier-ledger-${(supplierName || "all").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
      orientation: "landscape",
    })
  }

  const supplierTotalPkr = filteredPOs.reduce((s, p) => s + p.poAmountPkr, 0)
  const supplierTotalLanded = filteredPOs.reduce((s, p) => s + (p.totalLandedCost || 0), 0)

  // ── Shared column builders ──
  // Clicking a ledger row opens the matching record dialog (SO / DO / collection)
  const handleRowOpen = (row: LedgerRow) => {
    if ((row.type === "SO" || row.type === "PARTIAL") && row.soId) setViewSOId(row.soId)
    else if (row.type === "DO" && row.doId) setViewDOId(row.doId)
    else if (row.type === "RECEIPT" && row.receipt) openEditReceipt(row)
  }

  const showSelectCol = canDelete && selectMode
  const selectCol = {
    key: "select",
    header: "",
    className: "w-8",
    render: (row: LedgerRow) =>
      row.type === "RECEIPT" ? (
        <input
          type="checkbox"
          className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
          checked={Boolean(selected[row.id])}
          onChange={(e) => setSelected((s) => ({ ...s, [row.id]: e.target.checked }))}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select collection"
        />
      ) : null,
  }

  const actionsCol = {
    key: "actions",
    header: "Actions",
    render: (row: LedgerRow) => {
      const actions: RowAction[] = []
      if ((row.type === "SO" || row.type === "PARTIAL") && row.soId) {
        actions.push(
          { label: "View Sales Order", icon: <Eye size={15} />, onClick: () => setViewSOId(row.soId!) },
          { label: "Edit Sales Order", icon: <Pencil size={15} />, onClick: () => (window.location.href = `/sales?editId=${row.soId}`) },
        )
      }
      if (row.type === "DO" && row.doId) {
        actions.push(
          { label: "View Delivery Order", icon: <Eye size={15} />, onClick: () => setViewDOId(row.doId!) },
          { label: "Print DO", icon: <FileDown size={15} />, onClick: () => window.open(`/delivery/${row.doId}/print`, "_blank") },
          { label: "Open in Delivery Orders", icon: <TrendingUp size={15} />, onClick: () => (window.location.href = "/delivery") },
        )
      }
      if (row.type === "RECEIPT" && row.receipt) {
        actions.push({ label: "View / Edit Collection", icon: <Pencil size={15} />, onClick: () => openEditReceipt(row) })
        if (canDelete) {
          actions.push({ label: "Delete Collection", icon: <Trash2 size={15} />, danger: true, onClick: () => setConfirmDelete({ kind: "single", row }) })
        }
      }
      return <RowActionsMenu actions={actions} />
    },
  }

  const selectionBar = selectMode && (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
      <p className="text-sm font-medium text-blue-800">
        Selection mode — {selectedIds.length} collection(s) selected
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={selectAllVisibleReceipts}>Select all</Button>
        <Button size="sm" variant="secondary" onClick={() => setSelected({})} disabled={selectedIds.length === 0}>Deselect all</Button>
        <Button size="sm" variant="danger" onClick={() => setConfirmDelete({ kind: "bulk" })} disabled={selectedIds.length === 0}>
          <Trash2 size={14} className="mr-1" />Delete Selected
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setSelectMode(false); setSelected({}) }}>
          <X size={14} className="mr-1" />Done
        </Button>
      </div>
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in-up">
      <Header
        title="Party Ledger"
        actions={
          tab === "customer" ? (
            <div className="flex gap-2">
              <CsvImport
                endpoint="/api/import/collections"
                title="Import Collections"
                sampleName="collections"
                guide="Date format: DD-MM-YYYY (e.g. 09-06-2026 = 9 June). Each payment becomes a collection receipt linked to the party. Bank codes (HBL, UBL, MBL, THAL, GS HO …) are auto-mapped; S.NO is kept in notes. Amounts: plain numbers, no commas."
                sampleColumns={["S.NO", "Date", "Party Name", "Bank", "Bank Ref", "Amount"]}
                sampleRows={[
                  ["FORMAT → number", "DD-MM-YYYY (09-06-2026 = 9 June)", "Exact party name as in system", "Bank code: MBL / UBL / THAL / HBL …", "Text or number", "Number only — no commas"],
                  ["15111", "09-06-2026", "GS Islamabad", "MBL", "6766", "478800"],
                  ["15112", "09-06-2026", "Onyx Solar", "UBL", "6698613167", "864000"],
                  ["15113", "10-06-2026", "Saif Maan", "THAL", "126401", "3300000"],
                ]}
                onComplete={() => refetchLedger()}
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
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-80">
                <SearchableSelect
                  label="Select Party"
                  placeholder="All parties — type to search…"
                  options={(customers || []).map((c) => ({ value: c.id, label: c.name }))}
                  value={customerId}
                  onChange={setCustomerId}
                />
              </div>
              {!customerId && (
                <Popover button={<><SlidersHorizontal size={15} />Filters</>} badge={(range.from ? 1 : 0) + (range.to ? 1 : 0)} align="left">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">Date Range</span>
                    {(range.from || range.to) && (
                      <button type="button" onClick={() => setRange({ from: "", to: "" })} className="text-xs font-medium text-blue-600 hover:text-blue-800">
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    <Input label="From" type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
                    <Input label="To" type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
                    <div className="flex flex-wrap gap-2">
                      {[
                        { l: "Today", f: () => { const t = new Date().toISOString().slice(0, 10); setRange({ from: t, to: t }) } },
                        { l: "Last 7 days", f: () => { const t = new Date(); const f = new Date(); f.setDate(t.getDate() - 6); setRange({ from: f.toISOString().slice(0, 10), to: t.toISOString().slice(0, 10) }) } },
                        { l: "This Month", f: () => { const t = new Date().toISOString().slice(0, 10); setRange({ from: t.slice(0, 8) + "01", to: t }) } },
                        { l: "All Time", f: () => setRange({ from: "", to: "" }) },
                      ].map((p) => (
                        <button key={p.l} type="button" onClick={p.f}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                          {p.l}
                        </button>
                      ))}
                    </div>
                  </div>
                </Popover>
              )}
              {!customerId && (range.from || range.to) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1.5 text-xs font-medium text-blue-700 mb-0.5">
                  {range.from ? formatDate(range.from) : "Start"} → {range.to ? formatDate(range.to) : "Today"}
                  <button type="button" onClick={() => setRange({ from: "", to: "" })} className="hover:text-blue-900" aria-label="Clear date range">
                    <X size={12} />
                  </button>
                </span>
              )}
            </div>
            {!customerId && (
              <p className="mt-3 text-xs text-gray-400">
                Showing all parties combined. Use Filters to pick a date range (e.g. Today) and see total collections received in that period, or select a party for their full statement.
              </p>
            )}
          </Card>

          {/* ── Per-party view ── */}
          {customerId && ledgerLoading && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => <StatCardSkeleton key={i} />)}
              </div>
              <TableSkeleton columns={9} rows={8} />
            </div>
          )}
          {customerId && !ledgerLoading && (
            <>
              {ledgerData && (
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
                <div className="bg-white rounded-xl shadow-card border border-slate-200/70 p-5">
                  <p className="text-sm text-gray-500">Total Debit (SOs)</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(totalDebits)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-card border border-slate-200/70 p-5">
                  <p className="text-sm text-gray-500">Total Collected</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalCredits)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-card border border-slate-200/70 p-5">
                  <p className={`text-sm ${balance <= 0 ? "text-green-600" : "text-gray-500"}`}>
                    {balance <= 0 ? "Advance Credit" : "Net Receivable"}
                  </p>
                  <p className={`text-2xl font-bold mt-1 ${balance <= 0 ? "text-green-600" : "text-orange-600"}`}>
                    {formatCurrency(Math.abs(balance))}
                  </p>
                </div>
              </div>

              {selectionBar}

              <div className="bg-white rounded-xl shadow-card border border-slate-200/70">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">Ledger Entries</h3>
                    <Button size="sm" variant="secondary" onClick={() => exportLedger("pdf")}>
                      <FileDown size={14} className="mr-1" />PDF
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => exportLedger("excel")}>
                      <FileSpreadsheet size={14} className="mr-1" />Excel
                    </Button>
                    {canDelete && receiptCount > 0 && !selectMode && (
                      <Button size="sm" variant="ghost" onClick={() => setSelectMode(true)}>
                        <CheckSquare size={14} className="mr-1" />Select
                      </Button>
                    )}
                  </div>
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
                {(
                  <Table
                    data={rows}
                    emptyMessage="No ledger entries for this customer"
                    rowClassName={(row: LedgerRow) => TYPE_STYLES[row.type]}
                    onRowClick={handleRowOpen}
                    onFilteredChange={(r: LedgerRow[]) => { filteredLedgerRef.current = r }}
                    defaultSortKey="date"
                    defaultSortDir="desc"
                    searchPlaceholder="Search reference, description…"
                    filters={[
                      {
                        key: "date",
                        label: "Date Range",
                        type: "date",
                        value: (row: LedgerRow) => row.date,
                      },
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
                      ...(showSelectCol ? [selectCol] : []),
                      {
                        key: "type", header: "Type",
                        render: (row: LedgerRow) => (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${TYPE_BADGE[row.type]}`}>
                            {row.type === "SO" ? "Sales Order" : row.type === "DO" ? `DO (${row.soNumber})` : row.type === "PARTIAL" ? "Partial" : "Collection"}
                          </span>
                        ),
                      },
                      { key: "reference", header: "Reference", sortable: true, render: (row: LedgerRow) => <span className="text-xs font-medium text-gray-800 whitespace-nowrap">{row.reference}</span> },
                      { key: "date", header: "Date", sortable: true, numeric: true, value: (row: LedgerRow) => row.date, render: (row: LedgerRow) => <span className="text-xs text-gray-600 whitespace-nowrap">{formatDate(row.date)}</span> },
                      { key: "description", header: "Description", render: (row: LedgerRow) => <span className="text-xs text-gray-600">{row.description}</span> },
                      { key: "qtyTotal", header: "Total Qty", numeric: true, render: (row: LedgerRow) => <span className="text-xs text-gray-700">{row.qtyTotal > 0 ? row.qtyTotal.toLocaleString() : "—"}</span> },
                      { key: "qtyDelivered", header: "Delivered", numeric: true, render: (row: LedgerRow) => <span className="text-xs text-green-700 font-medium">{row.qtyDelivered > 0 ? row.qtyDelivered.toLocaleString() : "—"}</span> },
                      { key: "qtyRemaining", header: "Remaining", numeric: true, render: (row: LedgerRow) => row.qtyRemaining > 0 ? <span className="text-xs text-amber-700 font-medium">{row.qtyRemaining.toLocaleString()}</span> : <span className="text-xs">—</span> },
                      { key: "debit", header: "Debit (PKR)", sortable: true, numeric: true, render: (row: LedgerRow) => <span className="text-xs text-red-600 font-medium whitespace-nowrap">{row.debit > 0 ? formatAmount(row.debit) : "—"}</span> },
                      { key: "credit", header: "Credit (PKR)", sortable: true, numeric: true, render: (row: LedgerRow) => <span className="text-xs text-green-600 font-medium whitespace-nowrap">{row.credit > 0 ? formatAmount(row.credit) : "—"}</span> },
                      { key: "runningBalance", header: "Balance (PKR)", numeric: true, render: (row: LedgerRow) => <span className={`text-xs font-bold whitespace-nowrap ${row.runningBalance <= 0 ? "text-green-700" : "text-gray-900"}`}>{formatAmount(row.runningBalance)}</span> },
                      actionsCol,
                    ]}
                  />
                )}
              </div>
            </>
          )}

          {/* ── All-parties overview ── */}
          {!customerId && ledgerLoading && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
              </div>
              <TableSkeleton columns={8} rows={8} />
            </div>
          )}
          {!customerId && !ledgerLoading && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl shadow-card border border-slate-200/70 p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">Total Collections</p>
                    <Banknote size={18} className="text-green-400" />
                  </div>
                  <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalCredits)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{receiptCount} receipt(s){rangeQs ? " in period" : " all time"}</p>
                </div>
                <div className="bg-white rounded-xl shadow-card border border-slate-200/70 p-5">
                  <p className="text-sm text-gray-500">Total Sales (SO Value)</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(totalDebits)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-card border border-slate-200/70 p-5">
                  <p className="text-sm text-gray-500">Net Receivable</p>
                  <p className={`text-2xl font-bold mt-1 ${balance <= 0 ? "text-green-600" : "text-orange-600"}`}>{formatCurrency(balance)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-card border border-slate-200/70 p-5">
                  <p className="text-sm text-gray-500">Entries</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{rows.length.toLocaleString()}</p>
                </div>
              </div>

              {selectionBar}

              <div className="bg-white rounded-xl shadow-card border border-slate-200/70">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">All Parties — Ledger Entries</h3>
                    <Button size="sm" variant="secondary" onClick={() => exportLedger("pdf")}>
                      <FileDown size={14} className="mr-1" />PDF
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => exportLedger("excel")}>
                      <FileSpreadsheet size={14} className="mr-1" />Excel
                    </Button>
                    {canDelete && receiptCount > 0 && !selectMode && (
                      <Button size="sm" variant="ghost" onClick={() => setSelectMode(true)}>
                        <CheckSquare size={14} className="mr-1" />Select
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">Tip: filter Entry Type to “Collection” to see only payments received</p>
                </div>
                {(
                  <Table
                    data={rows}
                    emptyMessage="No ledger entries in this period"
                    rowClassName={(row: LedgerRow) => TYPE_STYLES[row.type]}
                    onRowClick={handleRowOpen}
                    onFilteredChange={(r: LedgerRow[]) => { filteredLedgerRef.current = r }}
                    defaultSortKey="date"
                    defaultSortDir="desc"
                    searchPlaceholder="Search party, reference, description…"
                    filters={[
                      { key: "party", label: "Party", value: (row: LedgerRow) => row.customerName },
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
                      { key: "date", label: "Date Range", type: "date", value: (row: LedgerRow) => row.date },
                    ]}
                    columns={[
                      ...(showSelectCol ? [selectCol] : []),
                      {
                        key: "type", header: "Type",
                        render: (row: LedgerRow) => (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${TYPE_BADGE[row.type]}`}>
                            {TYPE_LABEL(row)}
                          </span>
                        ),
                      },
                      { key: "customerName", header: "Party", sortable: true, render: (row: LedgerRow) => <span className="text-xs font-medium text-gray-900 whitespace-nowrap">{row.customerName}</span> },
                      { key: "reference", header: "Reference", sortable: true, render: (row: LedgerRow) => <span className="text-xs font-medium text-gray-800 whitespace-nowrap">{row.reference}</span> },
                      { key: "date", header: "Date", sortable: true, numeric: true, value: (row: LedgerRow) => row.date, render: (row: LedgerRow) => <span className="text-xs text-gray-600 whitespace-nowrap">{formatDate(row.date)}</span> },
                      { key: "description", header: "Description", render: (row: LedgerRow) => <span className="text-xs text-gray-600">{row.description}</span> },
                      { key: "debit", header: "Debit (PKR)", sortable: true, numeric: true, render: (row: LedgerRow) => <span className="text-xs text-red-600 font-medium whitespace-nowrap">{row.debit > 0 ? formatAmount(row.debit) : "—"}</span> },
                      { key: "credit", header: "Credit (PKR)", sortable: true, numeric: true, render: (row: LedgerRow) => <span className="text-xs text-green-600 font-medium whitespace-nowrap">{row.credit > 0 ? formatAmount(row.credit) : "—"}</span> },
                      actionsCol,
                    ]}
                  />
                )}
              </div>
            </>
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

      {/* ── Edit Collection Modal ── */}
      <Modal
        isOpen={Boolean(editReceiptRow)}
        onClose={() => setEditReceiptRow(null)}
        title={`Collection — ${editReceiptRow?.receipt?.receiptNo || ""}`}
        size="md"
      >
        {editReceiptRow && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              <p className="font-medium text-gray-900">{editReceiptRow.customerName}</p>
              <p className="text-xs text-gray-500 mt-0.5">Receipt {editReceiptRow.receipt?.receiptNo}</p>
            </div>
            <Select label="Bank *" required value={editForm.bankId} onChange={(e) => setEditForm((p) => ({ ...p, bankId: e.target.value }))}>
              <option value="">Select bank...</option>
              {banks?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
            <Input
              label="Amount (PKR) *"
              type="number" step="0.01" required
              value={editForm.amount}
              onChange={(e) => setEditForm((p) => ({ ...p, amount: e.target.value }))}
            />
            <Input
              label="Reference / Slip No."
              value={editForm.reference}
              onChange={(e) => setEditForm((p) => ({ ...p, reference: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Bank Value Date *"
                type="date" required
                value={editForm.valueDate}
                onChange={(e) => setEditForm((p) => ({ ...p, valueDate: e.target.value }))}
              />
              <Input
                label="WhatsApp Confirmation Date"
                type="date"
                value={editForm.whatsappDate}
                onChange={(e) => setEditForm((p) => ({ ...p, whatsappDate: e.target.value }))}
              />
            </div>
            <Input
              label="Notes"
              value={editForm.notes}
              onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))}
            />
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setEditReceiptRow(null)}>Cancel</Button>
              <Button onClick={handleSaveEdit} loading={savingEdit}>Save Changes</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Delete Confirmation ── */}
      <ConfirmDialog
        isOpen={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={performDelete}
        loading={deleting}
        title={confirmDelete?.kind === "bulk" ? "Delete Selected Collections" : "Delete Collection"}
        confirmLabel={confirmDelete?.kind === "bulk" ? `Delete ${selectedIds.length} Collection(s)` : "Delete Collection"}
        message={
          confirmDelete?.kind === "single" && confirmDelete.row.receipt ? (
            <span>
              Delete collection <strong>{confirmDelete.row.receipt.receiptNo}</strong> of{" "}
              <strong>{formatCurrency(confirmDelete.row.receipt.amount)}</strong> ({confirmDelete.row.customerName})?
              <br />This cannot be undone — the party&apos;s balance will update immediately.
            </span>
          ) : (
            <span>
              Delete <strong>{selectedIds.length}</strong> selected collection(s)?
              <br />This cannot be undone — party balances will update immediately.
            </span>
          )
        }
      />

      {/* ── Sales Order Detail Modal ── */}
      <Drawer isOpen={Boolean(viewSOId)} onClose={() => setViewSOId(null)} title={`Sales Order — ${soDetail?.soNumber || ""}`} size="xl">
        {soDetailLoading || !soDetail ? (
          <TableSkeleton columns={4} rows={3} />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{soDetail.customer?.name}</p>
                <p className="text-xs text-gray-500">Order date: {formatDate(soDetail.orderDate || soDetail.createdAt)}</p>
              </div>
              <Badge status={soDetail.status} />
            </div>
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Product</th>
                    <th className="px-3 py-2.5 text-right">Panels</th>
                    <th className="px-3 py-2.5 text-right">Rate / Watt</th>
                    <th className="px-3 py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {soDetail.lines?.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2.5 text-[13px]">{l.product?.name} <span className="text-xs text-gray-400">({l.product?.wattage}W)</span></td>
                      <td className="px-3 py-2.5 text-[13px] text-right tabular-nums">{l.quantity.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-[13px] text-right tabular-nums">{l.ratePerWatt.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-[13px] text-right font-medium tabular-nums">{formatCurrency(l.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Sub Total</p>
                <p className="font-semibold tabular-nums">{formatCurrency(soDetail.subTotal)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">GST {soDetail.gstRate > 0 ? `(${soDetail.gstRate}%)` : ""}</p>
                <p className="font-semibold tabular-nums">{soDetail.gstAmount > 0 ? formatCurrency(soDetail.gstAmount) : "—"}</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs text-blue-700">Grand Total</p>
                <p className="font-bold text-blue-900 tabular-nums">{formatCurrency(soDetail.grandTotal)}</p>
              </div>
            </div>
            {soDetail.deliveryOrders?.length > 0 && (
              <div className="text-sm">
                <p className="text-xs font-medium text-gray-500 mb-1.5">Delivery Orders</p>
                <div className="flex flex-wrap gap-2">
                  {soDetail.deliveryOrders.map((d) => (
                    <span key={d.id} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs">
                      <span className="font-medium">{d.doNumber}</span>
                      <span className="text-gray-500 tabular-nums">{d.quantity.toLocaleString()} pnl</span>
                      <Badge status={d.status} />
                    </span>
                  ))}
                </div>
              </div>
            )}
            {soDetail.notes && <p className="text-xs text-gray-500">Notes: {soDetail.notes}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setViewSOId(null)}>Close</Button>
              <Button onClick={() => (window.location.href = `/sales?editId=${soDetail.id}`)}>
                <Pencil size={14} className="mr-1" />Edit in Sales Orders
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* ── Delivery Order Detail slide-over ── */}
      <Drawer isOpen={Boolean(viewDOId)} onClose={() => setViewDOId(null)} title={`Delivery Order — ${doDetail?.doNumber || ""}`} size="xl">
        {doDetailLoading || !doDetail ? (
          <TableSkeleton columns={4} rows={3} />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{doDetail.salesOrder?.customer?.name}</p>
                <p className="text-xs text-gray-500">
                  SO {doDetail.salesOrder?.soNumber} · {doDetail.warehouse?.name} · Created {formatDate(doDetail.createdAt)}
                  {doDetail.dispatchedAt ? ` · Dispatched ${formatDate(doDetail.dispatchedAt)}` : ""}
                </p>
              </div>
              <Badge status={doDetail.status} />
            </div>
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Product</th>
                    <th className="px-3 py-2.5 text-right">Panels</th>
                    <th className="px-3 py-2.5 text-right">Watts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(doDetail.lines?.length ? doDetail.lines : []).map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2.5 text-[13px]">{l.product?.name} <span className="text-xs text-gray-400">({l.product?.wattage}W)</span></td>
                      <td className="px-3 py-2.5 text-[13px] text-right tabular-nums">{l.quantity.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-[13px] text-right tabular-nums">{l.watts.toLocaleString()}</td>
                    </tr>
                  ))}
                  {!doDetail.lines?.length && (
                    <tr>
                      <td className="px-3 py-2.5 text-[13px] text-gray-500">All products</td>
                      <td className="px-3 py-2.5 text-[13px] text-right tabular-nums">{doDetail.quantity.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-[13px] text-right tabular-nums">{doDetail.watts.toLocaleString()}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {doDetail.notes && <p className="text-xs text-gray-500">Notes: {doDetail.notes}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setViewDOId(null)}>Close</Button>
              <Button variant="secondary" onClick={() => window.open(`/delivery/${doDetail.id}/print`, "_blank")}>Print</Button>
              <Button onClick={() => (window.location.href = "/delivery")}>Open Delivery Orders</Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* ── Supplier Ledger ── */}
      {tab === "supplier" && (
        <>
          <Card>
            <div className="flex items-end gap-4">
              <div className="w-80">
                <SearchableSelect
                  label="Select Supplier"
                  placeholder="All suppliers — type to search…"
                  options={(suppliers || []).map((s) => ({ value: s.id, label: s.name }))}
                  value={supplierId}
                  onChange={setSupplierId}
                />
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-card border border-slate-200/70 p-5">
              <p className="text-sm text-gray-500">Total PO Value (PKR)</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(supplierTotalPkr)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-card border border-slate-200/70 p-5">
              <p className="text-sm text-gray-500">Total Landed Cost (PKR)</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{formatCurrency(supplierTotalLanded)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-card border border-slate-200/70 p-5">
              <p className="text-sm text-gray-500">Active POs</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {filteredPOs.filter((p) => !["RECEIVED", "CANCELLED"].includes(p.status)).length}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-card border border-slate-200/70">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3">
              <h3 className="font-semibold text-gray-900">Purchase Orders</h3>
              <Button size="sm" variant="secondary" onClick={exportSupplierPdf}>
                <FileDown size={14} className="mr-1" />Export PDF
              </Button>
            </div>
            {posLoading ? (
              <TableSkeleton columns={5} rows={6} />
            ) : (
              <Table
                data={filteredPOs}
                emptyMessage="No purchase orders found"
                searchPlaceholder="Search PO #, supplier…"
                onFilteredChange={(r: PO[]) => { filteredPOsRef.current = r }}
                defaultSortKey="createdAt"
                defaultSortDir="desc"
                filters={[
                  { key: "status", label: "Status", value: (po: PO) => po.status },
                  { key: "createdAt", label: "Date", type: "date", value: (po: PO) => po.createdAt },
                ]}
                columns={[
                  { key: "poNumber", header: "PO Number", sortable: true, render: (po: PO) => <span className="font-medium">{po.poNumber}</span> },
                  { key: "createdAt", header: "Date", sortable: true, numeric: true, value: (po: PO) => po.createdAt, render: (po: PO) => formatDate(po.createdAt) },
                  { key: "supplier", header: "Supplier", sortable: true, value: (po: PO) => po.supplier?.name || "—", render: (po: PO) => po.supplier?.name || "—" },
                  { key: "noOfPanels", header: "Panels", sortable: true, numeric: true, value: (po: PO) => po.noOfPanels, render: (po: PO) => `${po.noOfPanels.toLocaleString()} × ${po.panelWattage}W` },
                  { key: "totalValueUsd", header: "USD Value", sortable: true, numeric: true, render: (po: PO) => `$${po.totalValueUsd.toLocaleString()}` },
                  { key: "poAmountPkr", header: "PKR Amount", sortable: true, numeric: true, render: (po: PO) => <span className="font-medium text-red-600">{formatAmount(po.poAmountPkr)}</span> },
                  { key: "totalLandedCost", header: "Landed Cost (PKR)", numeric: true, render: (po: PO) => po.totalLandedCost ? <span className="text-blue-700">{formatAmount(po.totalLandedCost)}</span> : <span className="text-gray-400">—</span> },
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
