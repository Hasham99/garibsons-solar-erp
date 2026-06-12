"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Popover } from "@/components/ui/Popover"
import { Table, type Column } from "@/components/ui/Table"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { SearchableSelect } from "@/components/ui/SearchableSelect"
import { formatCurrency, formatDate } from "@/lib/utils"
import { downloadPdf } from "@/lib/pdf"
import { downloadExcel } from "@/lib/excel"
import {
  Banknote, Boxes, Columns3, ClipboardList, Clock, FileDown, FileSpreadsheet, LayoutGrid,
  LineChart as LineIcon, Package, ShoppingCart, SlidersHorizontal, TrendingUp, Wallet, X,
} from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import toast, { Toaster } from "react-hot-toast"

// ---------- response shapes ----------
type SalesReport = {
  rows: { id: string; soNumber: string; date: string; customer: string; status: string; panels: number; watts: number; value: number; items: string }[]
  summary: { orders: number; value: number; panels: number; delivered: number; pending: number }
  byCustomer: { customer: string; value: number; panels: number; orders: number }[]
  byBrand: { brand: string; value: number; panels: number }[]
  byMonth: { month: string; value: number; panels: number; orders: number }[]
}
type Outstanding = {
  rows: { customerId: string; customer: string; soTotal: number; collected: number; outstanding: number; oldestUnpaid: string | null; buckets: Record<string, number> }[]
  summary: Record<string, number>; totalOutstanding: number; totalAdvance: number
}
type Collections = {
  rows: { id: string; receiptNo: string; date: string; customer: string; bank: string; reference: string | null; amount: number }[]
  summary: { count: number; total: number }
  byBank: { bank: string; total: number; count: number }[]
  byParty: { customer: string; total: number; count: number }[]
  byMonth: { month: string; total: number; count: number }[]
}
type Profit = {
  rows: { product: string; brand: string; panels: number; revenue: number; cogs: number; grossProfit: number; marginPct: number }[]
  summary: { revenue: number; cogs: number; grossProfit: number; marginPct: number }
}
type Purchases = {
  rows: { id: string; poNumber: string; date: string; supplier: string; product: string; lcType: string; lcNumber: string | null; panels: number; watts: number; value: number; status: string }[]
  summary: { orders: number; panels: number; value: number }
  bySupplier: { supplier: string; panels: number; value: number; orders: number }[]
  byMonth: { month: string; value: number; panels: number }[]
}
type StockAging = {
  rows: { id: string; product: string; code: string; brand: string; warehouse: string; availablePanels: number; ageDays: number; bucket: string; costPerPanel: number; value: number; receivedAt: string }[]
  summary: Record<string, { panels: number; value: number }>
}
type StockSummary = {
  rows: { id: string; product: string; productCode: string; wattage: number; warehouse: string; currentPanels: number; reservedPanels: number; availablePanels: number; availableValue: number; totalValue: number }[]
  totals: { currentPanels: number; availablePanels: number; reservedPanels: number; totalValue: number; availableValue: number }
}
type POStatus = {
  rows: { id: string; poNumber: string; product: string; supplier: string; noOfPanels: number; panelWattage: number; poAmountPkr: number; landedCostPerPanel: number | null; status: string; lcType: string; receivedPanels: number; pendingPanels: number; createdAt: string }[]
  byStatus: Record<string, number>
}
type StockPositionRow = {
  productId: string; item: string; wattage: number; packing: number | null; panelsPerContainer: number | null
  receivedLocal: number; receivedImport: number; so: number; availableForSale: number
  doIssued: number; lifted: number; unlifted: number; warehouseStock: number; balanceSO: number
  stockWatts: number; fifoRatePerWatt: number; stockValue: number
}
type StockPosition = {
  rows: StockPositionRow[]
  totals: { receivedLocal: number; receivedImport: number; so: number; availableForSale: number; doIssued: number; lifted: number; unlifted: number; warehouseStock: number; balanceSO: number; stockWatts: number; stockValue: number }
  asOf: string
}

// ---------- report registry ----------
type DimKey = "customerId" | "brand" | "bankId" | "supplierId" | "warehouseId" | "status"
type SectionKey = "summary" | "chart" | "breakdowns" | "table"
type StockUnit = "panels" | "containers" | "value"

const SECTION_LABELS: Record<SectionKey, string> = {
  summary: "Summary cards",
  chart: "Trend chart",
  breakdowns: "Breakdowns",
  table: "Detail table",
}

interface ReportDef {
  key: string
  label: string
  icon: ReactNode
  /** "range": required period · "rangeOptional": filter only when set · "asOf": single rewind date. */
  dateMode?: "range" | "rangeOptional" | "asOf"
  /** Dimension filters surfaced in the Filters panel for this report. */
  dims: DimKey[]
  /** Sections that exist on this report (toggleable include/exclude). */
  sections: SectionKey[]
  /** Dims applied client-side instead of via query string. */
  clientDims?: DimKey[]
}

const GROUPS: { group: string; items: ReportDef[] }[] = [
  { group: "Sales", items: [
    { key: "sales", label: "Sales Analysis", icon: <TrendingUp size={16} />, dateMode: "range", dims: ["customerId", "brand", "status"], sections: ["summary", "chart", "breakdowns", "table"] },
  ]},
  { group: "Receivables", items: [
    { key: "outstanding", label: "Outstanding & Aging", icon: <Wallet size={16} />, dims: ["customerId"], sections: ["summary", "breakdowns", "table"] },
  ]},
  { group: "Collections", items: [
    { key: "collections", label: "Collections", icon: <Banknote size={16} />, dateMode: "range", dims: ["customerId", "bankId"], sections: ["summary", "chart", "breakdowns", "table"] },
  ]},
  { group: "Profitability", items: [
    { key: "profit", label: "Gross Profit", icon: <LineIcon size={16} />, dateMode: "range", dims: ["brand"], sections: ["summary", "table"] },
  ]},
  { group: "Inventory", items: [
    { key: "stockPosition", label: "Stock Position", icon: <Boxes size={16} />, dateMode: "asOf", dims: [], sections: ["summary", "table"] },
    { key: "stock", label: "Stock Summary", icon: <Package size={16} />, dateMode: "asOf", dims: ["warehouseId"], sections: ["summary", "table"] },
    { key: "stockAging", label: "Stock Aging", icon: <Clock size={16} />, dateMode: "rangeOptional", dims: ["warehouseId", "brand"], sections: ["summary", "table"] },
  ]},
  { group: "Procurement", items: [
    { key: "poStatus", label: "PO Status", icon: <ClipboardList size={16} />, dims: ["status"], sections: ["summary", "table"], clientDims: ["status"] },
    { key: "purchases", label: "Purchases", icon: <ShoppingCart size={16} />, dateMode: "range", dims: ["supplierId", "status"], sections: ["summary", "chart", "breakdowns", "table"] },
  ]},
]
const ALL_ITEMS = GROUPS.flatMap((g) => g.items)
/** Report shown when no ?view= param is present — kept as the historical default. */
const DEFAULT_REPORT = "outstanding"

const SO_STATUSES = ["DRAFT", "PENDING_PAYMENT", "PAYMENT_CONFIRMED", "DO_ISSUED", "DELIVERED", "INVOICED", "CANCELLED"]
const LC_TYPES = ["SIGHT", "USANCE", "TT", "LOCAL"]

const compactNum = (n: number) => (Math.abs(n) >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : `${n}`)
const n = (v: number) => Math.round(v).toLocaleString("en-PK")
const ctr1 = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 })
/** Big rupee figures read as "Rs 2.52B" on screen — exports always keep full precision. */
const compactMoney = (v: number) => (Math.abs(v) >= 1e7 ? `Rs ${compactNum(v)}` : formatCurrency(v))
const isCompacted = (v: number) => Math.abs(v) >= 1e7

// Unit helpers for Stock Position
const inCtr = (panels: number, r: StockPositionRow) =>
  r.panelsPerContainer && r.panelsPerContainer > 0 ? ctr1(panels / r.panelsPerContainer) : "—"
const rowsToCtr = (rows: StockPositionRow[], field: (r: StockPositionRow) => number) =>
  rows.reduce((s, r) => s + (r.panelsPerContainer && r.panelsPerContainer > 0 ? field(r) / r.panelsPerContainer : 0), 0)
const availWatts = (r: StockPositionRow) => r.availableForSale * r.wattage
const availValue = (r: StockPositionRow) => Math.round(availWatts(r) * r.fifoRatePerWatt)

/**
 * Unit-aware KPI list used by both the on-screen cards and the exports.
 * `value` is the on-screen display (compacted for huge rupee figures);
 * `full` carries the precise figure for exports and tooltips.
 */
function stockPositionKpis(d: StockPosition, unit: StockUnit) {
  const money = (v: number) => ({ value: compactMoney(v), full: formatCurrency(v) })
  if (unit === "containers") {
    return [
      { label: "Warehouse Stock", value: `${ctr1(rowsToCtr(d.rows, (r) => r.warehouseStock))} ctr`, subtitle: "containers physically present" },
      { label: "Available for Sale", value: `${ctr1(rowsToCtr(d.rows, (r) => r.availableForSale))} ctr`, subtitle: "uncommitted containers" },
      { label: "Unlifted DO + Balance SO", value: `${ctr1(rowsToCtr(d.rows, (r) => r.unlifted + r.balanceSO))} ctr`, subtitle: "committed, not dispatched" },
      { label: "Stock Value (FIFO)", ...money(d.totals.stockValue), subtitle: "warehouse stock at cost" },
    ]
  }
  if (unit === "value") {
    return [
      { label: "Warehouse Stock Value", ...money(d.totals.stockValue), subtitle: "FIFO cost of stock present" },
      { label: "Available for Sale Value", ...money(d.rows.reduce((s, r) => s + availValue(r), 0)), subtitle: "uncommitted stock at cost" },
      { label: "Stock in Watts", value: `${compactNum(d.totals.stockWatts)} W`, full: `${n(d.totals.stockWatts)} W`, subtitle: "warehouse stock wattage" },
      { label: "Avg Rate / Watt", value: d.totals.stockWatts > 0 ? `Rs ${(d.totals.stockValue / d.totals.stockWatts).toFixed(2)}` : "—", subtitle: "blended FIFO cost" },
    ]
  }
  return [
    { label: "Warehouse Stock", value: `${n(d.totals.warehouseStock)} panels`, subtitle: "physically present" },
    { label: "Available for Sale", value: `${n(d.totals.availableForSale)} panels`, subtitle: "uncommitted" },
    { label: "Unlifted DO + Balance SO", value: `${n(d.totals.unlifted + d.totals.balanceSO)} panels`, subtitle: "committed, not dispatched" },
    { label: "Stock Value (FIFO)", ...money(d.totals.stockValue), subtitle: "warehouse stock at cost" },
  ]
}

// ---------- export / column specs ----------
type Cell = string | number
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ColSpec<R = any> {
  key: string
  header: string
  align?: "left" | "right"
  cell: (r: R) => Cell
}

// ---------- small UI helpers ----------
type KpiTone = "blue" | "green" | "yellow" | "red" | "purple"
const KPI_TONES: Record<KpiTone, string> = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-green-50 text-green-600",
  yellow: "bg-amber-50 text-amber-600",
  red: "bg-red-50 text-red-600",
  purple: "bg-purple-50 text-purple-600",
}

/**
 * Report KPI card. The headline never wraps — huge rupee figures arrive
 * pre-compacted (Rs 2.52B) with the precise figure on the sub-line + tooltip.
 */
function Kpi({ label, value, sub, full, icon, tone = "blue" }: {
  label: string
  value: ReactNode
  sub?: string
  /** Precise figure when `value` is compacted — shown on the sub-line and as tooltip. */
  full?: string
  icon?: ReactNode
  tone?: KpiTone
}) {
  const subLine = full && full !== value ? (sub ? `${full} · ${sub}` : full) : sub
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 min-w-0" title={full || undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 truncate" title={label}>{label}</p>
          <p className="mt-1.5 text-xl xl:text-[22px] font-bold text-gray-900 leading-none whitespace-nowrap tabular-nums">{value}</p>
          <p className={`mt-1.5 text-xs text-gray-400 truncate ${subLine ? "" : "invisible"}`} title={subLine}>{subLine || "·"}</p>
        </div>
        {icon && <div className={`p-2.5 rounded-lg shrink-0 ${KPI_TONES[tone]}`}>{icon}</div>}
      </div>
    </div>
  )
}

/** Money KPI: compact headline + precise sub-line for 10M+ figures. */
function MoneyKpi({ label, amount, sub, icon, tone }: { label: string; amount: number; sub?: string; icon?: ReactNode; tone?: KpiTone }) {
  return (
    <Kpi
      label={label}
      value={compactMoney(amount)}
      full={isCompacted(amount) ? formatCurrency(amount) : undefined}
      sub={sub}
      icon={icon}
      tone={tone}
    />
  )
}

function SectionCard({ title, subtitle, children, headerExtra }: { title: string; subtitle?: string; children: ReactNode; headerExtra?: ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {headerExtra}
      </div>
      {children}
    </div>
  )
}

function BucketStrip({ items }: { items: { label: string; value: number; tone: string }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {items.map((b) => (
        <div key={b.label} className={`rounded-xl border p-4 min-w-0 ${b.tone}`} title={formatCurrency(b.value)}>
          <p className="text-xs font-medium opacity-80 truncate">{b.label}</p>
          <p className="mt-1 text-base font-bold whitespace-nowrap tabular-nums">{compactMoney(b.value)}</p>
        </div>
      ))}
    </div>
  )
}

function TrendChart({ data, xKey, yKey, label, color = "#3b82f6" }: { data: Record<string, unknown>[]; xKey: string; yKey: string; label: string; color?: string }) {
  return (
    <SectionCard title={label}>
      <div className="p-4">
        {data.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
              <YAxis tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} tickFormatter={(v) => compactNum(Number(v))} width={48} />
              <Tooltip formatter={(v) => [formatCurrency(Number(v)), "Value"]} contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} cursor={{ fill: "#f8fafc" }} />
              <Bar dataKey={yKey} fill={color} radius={[6, 6, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        ) : <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No data</div>}
      </div>
    </SectionCard>
  )
}

function BreakdownCard<T extends Record<string, unknown>>({ title, columns, data }: { title: string; columns: Column<T>[]; data: T[] }) {
  return (
    <SectionCard title={title}>
      <div className="overflow-x-auto">
        <Table columns={columns} data={data} searchable={false} pageSizeOptions={[]} pageSize={8} compact emptyMessage="No data" />
      </div>
    </SectionCard>
  )
}

const moneyCol = <T extends Record<string, unknown>>(key: string, header: string, strong = false): Column<T> => ({
  key, header, sortable: true, className: "text-right",
  render: (r) => <span className={`whitespace-nowrap ${strong ? "font-semibold text-gray-900" : ""}`}>{formatCurrency(Number(r[key]))}</span>,
})
const numCol = <T extends Record<string, unknown>>(key: string, header: string): Column<T> => ({
  key, header, sortable: true, className: "text-right", render: (r) => Number(r[key]).toLocaleString(),
})

/** Hides table columns the user unticked in the Columns panel. */
const vis = <T,>(cols: Column<T>[], hidden: Record<string, boolean>) => cols.filter((c) => !hidden[c.key])

type Dims = Record<DimKey, string>
const EMPTY_DIMS: Dims = { customerId: "", brand: "", bankId: "", supplierId: "", warehouseId: "", status: "" }

export default function ReportsPage() {
  // The active report is driven by the sidebar via ?view=<key>
  const searchParams = useSearchParams()
  const viewParam = searchParams.get("view")
  const active = ALL_ITEMS.some((i) => i.key === viewParam) ? viewParam! : DEFAULT_REPORT
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState("2026-05-01")
  const [to, setTo] = useState(today)
  const [optRange, setOptRange] = useState({ from: "", to: "" })
  const [asOfDate, setAsOfDate] = useState("")
  const [dims, setDims] = useState<Dims>(EMPTY_DIMS)
  const [sections, setSections] = useState<Record<SectionKey, boolean>>({ summary: true, chart: true, breakdowns: true, table: true })
  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>({})
  const [stockUnit, setStockUnit] = useState<StockUnit>("panels")

  const item = ALL_ITEMS.find((i) => i.key === active)!

  // Filters and column choices rarely carry over between reports
  useEffect(() => { setDims(EMPTY_DIMS); setHiddenCols({}); setOptRange({ from: "", to: "" }); setAsOfDate("") }, [active])
  useEffect(() => { setHiddenCols({}) }, [stockUnit])

  // Option sources for the Filters panel
  const { data: customers } = useFetch<{ id: string; name: string }[]>("/api/customers")
  const { data: banks } = useFetch<{ id: string; name: string }[]>("/api/banks")
  const { data: suppliersList } = useFetch<{ id: string; name: string }[]>("/api/suppliers")
  const { data: warehousesList } = useFetch<{ id: string; name: string }[]>("/api/warehouses")
  const { data: productsList } = useFetch<{ id: string; brand: string }[]>("/api/products")
  const brands = useMemo(() => [...new Set((productsList || []).map((p) => p.brand).filter(Boolean))].sort(), [productsList])

  const serverDims = item.dims.filter((d) => !(item.clientDims || []).includes(d))
  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (item.dateMode === "range") { p.set("from", from); p.set("to", to) }
    if (item.dateMode === "rangeOptional") {
      if (optRange.from) p.set("from", optRange.from)
      if (optRange.to) p.set("to", optRange.to)
    }
    if (item.dateMode === "asOf" && asOfDate) p.set("asOf", asOfDate)
    for (const d of serverDims) if (dims[d]) p.set(d, dims[d])
    const s = p.toString()
    return s ? `?${s}` : ""
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, from, to, optRange, asOfDate, dims])

  const url = (key: string, path: string) => (active === key ? `/api/reports/${path}${qs}` : "")

  const sales = useFetch<SalesReport>(url("sales", "sales"), [active, qs])
  const outstanding = useFetch<Outstanding>(url("outstanding", "outstanding"), [active, qs])
  const collections = useFetch<Collections>(url("collections", "collections"), [active, qs])
  const profit = useFetch<Profit>(url("profit", "profitability"), [active, qs])
  const purchases = useFetch<Purchases>(url("purchases", "purchases"), [active, qs])
  const stockAging = useFetch<StockAging>(url("stockAging", "inventory-aging"), [active, qs])
  const stock = useFetch<StockSummary>(url("stock", "stock-summary"), [active, qs])
  const poStatus = useFetch<POStatus>(url("poStatus", "po-status"), [active])
  const stockPosition = useFetch<StockPosition>(url("stockPosition", "stock-position"), [active, qs])

  const loading = [sales, outstanding, collections, profit, purchases, stockAging, stock, poStatus, stockPosition].some((q) => q.loading)

  // PO Status rows with client-side status filter applied
  const poRows = useMemo(
    () => (poStatus.data?.rows || []).filter((r) => !dims.status || r.status === dims.status),
    [poStatus.data, dims.status]
  )

  const activeDimCount = item.dims.filter((d) => dims[d]).length
  const hiddenSectionCount = item.sections.filter((s) => !sections[s]).length

  // Human-readable labels of active filters — shown as chips and printed on exports
  const dimChips: { key: DimKey; label: string }[] = []
  if (dims.customerId && item.dims.includes("customerId")) dimChips.push({ key: "customerId", label: `Party: ${customers?.find((c) => c.id === dims.customerId)?.name || "…"}` })
  if (dims.bankId && item.dims.includes("bankId")) dimChips.push({ key: "bankId", label: `Bank: ${banks?.find((b) => b.id === dims.bankId)?.name || "…"}` })
  if (dims.supplierId && item.dims.includes("supplierId")) dimChips.push({ key: "supplierId", label: `Supplier: ${suppliersList?.find((s) => s.id === dims.supplierId)?.name || "…"}` })
  if (dims.warehouseId && item.dims.includes("warehouseId")) dimChips.push({ key: "warehouseId", label: `Warehouse: ${warehousesList?.find((w) => w.id === dims.warehouseId)?.name || "…"}` })
  if (dims.brand && item.dims.includes("brand")) dimChips.push({ key: "brand", label: `Brand: ${dims.brand}` })
  if (dims.status && item.dims.includes("status")) dimChips.push({ key: "status", label: `${active === "purchases" ? "LC Type" : "Status"}: ${dims.status.replace(/_/g, " ")}` })

  // ---------- column specs (drive the Columns picker AND the exports) ----------
  const columnSpecs = useMemo<ColSpec[]>(() => {
    switch (active) {
      case "sales": return [
        { key: "soNumber", header: "SO #", cell: (r: SalesReport["rows"][0]) => r.soNumber },
        { key: "date", header: "Date", cell: (r: SalesReport["rows"][0]) => formatDate(r.date) },
        { key: "customer", header: "Customer", cell: (r: SalesReport["rows"][0]) => r.customer },
        { key: "status", header: "Status", cell: (r: SalesReport["rows"][0]) => r.status },
        { key: "panels", header: "Panels", align: "right", cell: (r: SalesReport["rows"][0]) => n(r.panels) },
        { key: "value", header: "Value (Rs)", align: "right", cell: (r: SalesReport["rows"][0]) => n(r.value) },
      ]
      case "outstanding": return [
        { key: "customer", header: "Party", cell: (r: Outstanding["rows"][0]) => r.customer },
        { key: "soTotal", header: "Sales (Rs)", align: "right", cell: (r: Outstanding["rows"][0]) => n(r.soTotal) },
        { key: "collected", header: "Collected (Rs)", align: "right", cell: (r: Outstanding["rows"][0]) => n(r.collected) },
        { key: "outstanding", header: "Outstanding (Rs)", align: "right", cell: (r: Outstanding["rows"][0]) => n(r.outstanding) },
        { key: "over90", header: "90+ days (Rs)", align: "right", cell: (r: Outstanding["rows"][0]) => r.buckets.over90 ? n(r.buckets.over90) : "—" },
        { key: "oldestUnpaid", header: "Oldest Unpaid", cell: (r: Outstanding["rows"][0]) => r.oldestUnpaid ? formatDate(r.oldestUnpaid) : "—" },
      ]
      case "collections": return [
        { key: "receiptNo", header: "Receipt #", cell: (r: Collections["rows"][0]) => r.receiptNo },
        { key: "date", header: "Date", cell: (r: Collections["rows"][0]) => formatDate(r.date) },
        { key: "customer", header: "Party", cell: (r: Collections["rows"][0]) => r.customer },
        { key: "bank", header: "Bank", cell: (r: Collections["rows"][0]) => r.bank },
        { key: "reference", header: "Reference", cell: (r: Collections["rows"][0]) => r.reference || "—" },
        { key: "amount", header: "Amount (Rs)", align: "right", cell: (r: Collections["rows"][0]) => n(r.amount) },
      ]
      case "profit": return [
        { key: "product", header: "Product", cell: (r: Profit["rows"][0]) => r.product },
        { key: "brand", header: "Brand", cell: (r: Profit["rows"][0]) => r.brand },
        { key: "panels", header: "Panels", align: "right", cell: (r: Profit["rows"][0]) => n(r.panels) },
        { key: "revenue", header: "Revenue (Rs)", align: "right", cell: (r: Profit["rows"][0]) => n(r.revenue) },
        { key: "cogs", header: "Cost (Rs)", align: "right", cell: (r: Profit["rows"][0]) => n(r.cogs) },
        { key: "grossProfit", header: "Gross Profit (Rs)", align: "right", cell: (r: Profit["rows"][0]) => n(r.grossProfit) },
        { key: "marginPct", header: "Margin", align: "right", cell: (r: Profit["rows"][0]) => `${r.marginPct.toFixed(1)}%` },
      ]
      case "purchases": return [
        { key: "poNumber", header: "PO #", cell: (r: Purchases["rows"][0]) => r.poNumber },
        { key: "date", header: "Date", cell: (r: Purchases["rows"][0]) => formatDate(r.date) },
        { key: "supplier", header: "Supplier", cell: (r: Purchases["rows"][0]) => r.supplier },
        { key: "product", header: "Product", cell: (r: Purchases["rows"][0]) => r.product },
        { key: "lcType", header: "Type", cell: (r: Purchases["rows"][0]) => r.lcType },
        { key: "panels", header: "Panels", align: "right", cell: (r: Purchases["rows"][0]) => n(r.panels) },
        { key: "value", header: "Value (Rs)", align: "right", cell: (r: Purchases["rows"][0]) => n(r.value) },
      ]
      case "stockAging": return [
        { key: "product", header: "Product", cell: (r: StockAging["rows"][0]) => r.product },
        { key: "warehouse", header: "Warehouse", cell: (r: StockAging["rows"][0]) => r.warehouse },
        { key: "availablePanels", header: "Panels", align: "right", cell: (r: StockAging["rows"][0]) => n(r.availablePanels) },
        { key: "ageDays", header: "Age (days)", align: "right", cell: (r: StockAging["rows"][0]) => String(r.ageDays) },
        { key: "value", header: "Value (Rs)", align: "right", cell: (r: StockAging["rows"][0]) => n(r.value) },
        { key: "receivedAt", header: "Received", cell: (r: StockAging["rows"][0]) => formatDate(r.receivedAt) },
      ]
      case "stock": return [
        { key: "product", header: "Product", cell: (r: StockSummary["rows"][0]) => r.product },
        { key: "warehouse", header: "Warehouse", cell: (r: StockSummary["rows"][0]) => r.warehouse },
        { key: "currentPanels", header: "Current", align: "right", cell: (r: StockSummary["rows"][0]) => n(r.currentPanels) },
        { key: "reservedPanels", header: "Reserved", align: "right", cell: (r: StockSummary["rows"][0]) => n(r.reservedPanels) },
        { key: "availablePanels", header: "Available", align: "right", cell: (r: StockSummary["rows"][0]) => n(r.availablePanels) },
        { key: "availableValue", header: "Avail. Value (Rs)", align: "right", cell: (r: StockSummary["rows"][0]) => n(r.availableValue) },
      ]
      case "poStatus": return [
        { key: "poNumber", header: "PO #", cell: (r: POStatus["rows"][0]) => r.poNumber },
        { key: "supplier", header: "Supplier", cell: (r: POStatus["rows"][0]) => r.supplier },
        { key: "product", header: "Product", cell: (r: POStatus["rows"][0]) => r.product },
        { key: "noOfPanels", header: "Ordered", align: "right", cell: (r: POStatus["rows"][0]) => n(r.noOfPanels) },
        { key: "receivedPanels", header: "Received", align: "right", cell: (r: POStatus["rows"][0]) => n(r.receivedPanels) },
        { key: "poAmountPkr", header: "Value (Rs)", align: "right", cell: (r: POStatus["rows"][0]) => n(r.poAmountPkr) },
        { key: "status", header: "Status", cell: (r: POStatus["rows"][0]) => r.status },
      ]
      case "stockPosition":
        if (stockUnit === "containers") return [
          { key: "item", header: "Item", cell: (r: StockPositionRow) => r.item },
          { key: "receivedLocal", header: "Ctr Recv Local", align: "right", cell: (r: StockPositionRow) => inCtr(r.receivedLocal, r) },
          { key: "receivedImport", header: "Ctr Recv Import", align: "right", cell: (r: StockPositionRow) => inCtr(r.receivedImport, r) },
          { key: "doIssued", header: "Sales (DO Issued)", align: "right", cell: (r: StockPositionRow) => inCtr(r.doIssued, r) },
          { key: "warehouseStock", header: "WH Stock", align: "right", cell: (r: StockPositionRow) => inCtr(r.warehouseStock, r) },
          { key: "balanceSO", header: "Sales Deals (Bal. SO)", align: "right", cell: (r: StockPositionRow) => inCtr(r.balanceSO, r) },
          { key: "availableForSale", header: "Ctr Available", align: "right", cell: (r: StockPositionRow) => inCtr(r.availableForSale, r) },
        ]
        if (stockUnit === "value") return [
          { key: "item", header: "Item", cell: (r: StockPositionRow) => r.item },
          { key: "packing", header: "Packing", align: "right", cell: (r: StockPositionRow) => r.packing ?? "—" },
          { key: "availableForSale", header: "Panels Available", align: "right", cell: (r: StockPositionRow) => n(r.availableForSale) },
          { key: "fifoRatePerWatt", header: "Cost Rate/Watt (FIFO)", align: "right", cell: (r: StockPositionRow) => r.fifoRatePerWatt ? r.fifoRatePerWatt.toFixed(2) : "—" },
          { key: "availWatts", header: "Stock in Watts", align: "right", cell: (r: StockPositionRow) => n(availWatts(r)) },
          { key: "availValue", header: "Stock Value (Rs)", align: "right", cell: (r: StockPositionRow) => n(availValue(r)) },
        ]
        return [
          { key: "item", header: "Item", cell: (r: StockPositionRow) => r.item },
          { key: "packing", header: "Packing", align: "right", cell: (r: StockPositionRow) => r.packing ?? "—" },
          { key: "receivedLocal", header: "Recv Local", align: "right", cell: (r: StockPositionRow) => n(r.receivedLocal) },
          { key: "receivedImport", header: "Recv Import", align: "right", cell: (r: StockPositionRow) => n(r.receivedImport) },
          { key: "so", header: "SO", align: "right", cell: (r: StockPositionRow) => n(r.so) },
          { key: "doIssued", header: "DO Issued", align: "right", cell: (r: StockPositionRow) => n(r.doIssued) },
          { key: "lifted", header: "Lifted DO", align: "right", cell: (r: StockPositionRow) => n(r.lifted) },
          { key: "unlifted", header: "Unlifted DO", align: "right", cell: (r: StockPositionRow) => n(r.unlifted) },
          { key: "warehouseStock", header: "WH Stock", align: "right", cell: (r: StockPositionRow) => n(r.warehouseStock) },
          { key: "balanceSO", header: "Bal. SO", align: "right", cell: (r: StockPositionRow) => n(r.balanceSO) },
          { key: "availableForSale", header: "Available", align: "right", cell: (r: StockPositionRow) => n(r.availableForSale) },
        ]
      default: return []
    }
  }, [active, stockUnit])

  const hiddenColCount = columnSpecs.filter((c) => hiddenCols[c.key]).length

  // ---------- export ----------
  const buildExport = (): { title: string; kpis?: { label: string; value: string }[]; dataRows: unknown[]; totals?: Record<string, Cell> } | null => {
    if (active === "sales" && sales.data) {
      const d = sales.data
      return { title: "Sales Analysis",
        kpis: [{ label: "Sales Value", value: formatCurrency(d.summary.value) }, { label: "Orders", value: String(d.summary.orders) }, { label: "Panels", value: n(d.summary.panels) }, { label: "Delivered / Pending", value: `${d.summary.delivered} / ${d.summary.pending}` }],
        dataRows: d.rows,
        totals: { status: "TOTAL", panels: n(d.summary.panels), value: n(d.summary.value) } }
    }
    if (active === "outstanding" && outstanding.data) {
      const d = outstanding.data
      return { title: "Customer Outstanding & Aging",
        kpis: [{ label: "Total Outstanding", value: formatCurrency(d.totalOutstanding) }, { label: "Advance / Credit", value: formatCurrency(d.totalAdvance) }, { label: "Net Receivable", value: formatCurrency(d.totalOutstanding - d.totalAdvance) }],
        dataRows: d.rows,
        totals: { customer: "TOTAL", outstanding: n(d.totalOutstanding - d.totalAdvance), over90: n(d.summary.over90 || 0) } }
    }
    if (active === "collections" && collections.data) {
      const d = collections.data
      return { title: "Collections Report",
        kpis: [{ label: "Total Collected", value: formatCurrency(d.summary.total) }, { label: "Receipts", value: String(d.summary.count) }, { label: "Banks Used", value: String(d.byBank.length) }],
        dataRows: d.rows,
        totals: { reference: "TOTAL", amount: n(d.summary.total) } }
    }
    if (active === "profit" && profit.data) {
      const d = profit.data
      return { title: "Gross Profit (FIFO)",
        kpis: [{ label: "Revenue", value: formatCurrency(d.summary.revenue) }, { label: "Cost (FIFO)", value: formatCurrency(d.summary.cogs) }, { label: "Gross Profit", value: formatCurrency(d.summary.grossProfit) }, { label: "Margin", value: `${d.summary.marginPct.toFixed(1)}%` }],
        dataRows: d.rows,
        totals: { product: "TOTAL", revenue: n(d.summary.revenue), cogs: n(d.summary.cogs), grossProfit: n(d.summary.grossProfit), marginPct: `${d.summary.marginPct.toFixed(1)}%` } }
    }
    if (active === "purchases" && purchases.data) {
      const d = purchases.data
      return { title: "Purchases Report",
        kpis: [{ label: "Purchase Orders", value: String(d.summary.orders) }, { label: "Panels", value: n(d.summary.panels) }, { label: "Value", value: formatCurrency(d.summary.value) }],
        dataRows: d.rows,
        totals: { lcType: "TOTAL", panels: n(d.summary.panels), value: n(d.summary.value) } }
    }
    if (active === "stockAging" && stockAging.data) {
      const d = stockAging.data
      return { title: "Stock Aging",
        kpis: ["0to30", "31to60", "61to90", "over90"].map((k) => ({ label: { "0to30": "0–30 days", "31to60": "31–60 days", "61to90": "61–90 days", over90: "90+ days" }[k]!, value: `${n(d.summary[k]?.panels || 0)} panels` })),
        dataRows: d.rows }
    }
    if (active === "stock" && stock.data) {
      const d = stock.data
      return { title: "Stock Summary",
        kpis: [{ label: "Current", value: `${n(d.totals.currentPanels)} panels` }, { label: "Available", value: `${n(d.totals.availablePanels)} panels` }, { label: "Reserved", value: `${n(d.totals.reservedPanels)} panels` }, { label: "Stock Value", value: formatCurrency(d.totals.totalValue) }],
        dataRows: d.rows,
        totals: { product: "TOTAL", currentPanels: n(d.totals.currentPanels), reservedPanels: n(d.totals.reservedPanels), availablePanels: n(d.totals.availablePanels), availableValue: n(d.totals.availableValue) } }
    }
    if (active === "poStatus" && poStatus.data) {
      return { title: "Purchase Order Status",
        kpis: Object.entries(poStatus.data.byStatus).map(([s, c]) => ({ label: s.replace(/_/g, " "), value: String(c) })),
        dataRows: poRows }
    }
    if (active === "stockPosition" && stockPosition.data) {
      const d = stockPosition.data
      const kpis = stockPositionKpis(d, stockUnit).map((k) => ({ label: k.label, value: String((k as { full?: string }).full ?? k.value) }))
      const unitTitle = { panels: "Panels", containers: "Containers", value: "PKR Values" }[stockUnit]
      let totals: Record<string, Cell> | undefined
      if (stockUnit === "panels") {
        totals = { item: "TOTAL", receivedLocal: n(d.totals.receivedLocal), receivedImport: n(d.totals.receivedImport), so: n(d.totals.so), doIssued: n(d.totals.doIssued), lifted: n(d.totals.lifted), unlifted: n(d.totals.unlifted), warehouseStock: n(d.totals.warehouseStock), balanceSO: n(d.totals.balanceSO), availableForSale: n(d.totals.availableForSale) }
      } else if (stockUnit === "containers") {
        totals = { item: "TOTAL", receivedLocal: ctr1(rowsToCtr(d.rows, (r) => r.receivedLocal)), receivedImport: ctr1(rowsToCtr(d.rows, (r) => r.receivedImport)), doIssued: ctr1(rowsToCtr(d.rows, (r) => r.doIssued)), warehouseStock: ctr1(rowsToCtr(d.rows, (r) => r.warehouseStock)), balanceSO: ctr1(rowsToCtr(d.rows, (r) => r.balanceSO)), availableForSale: ctr1(rowsToCtr(d.rows, (r) => r.availableForSale)) }
      } else {
        totals = { item: "TOTAL", availableForSale: n(d.totals.availableForSale), availValue: n(d.rows.reduce((s, r) => s + availValue(r), 0)) }
      }
      return { title: `Stock Position — ${unitTitle}`, kpis, dataRows: d.rows, totals }
    }
    return null
  }

  const exportReport = (format: "pdf" | "excel") => {
    const built = buildExport()
    if (!built || built.dataRows.length === 0) return toast.error("Nothing to export")
    const specs = columnSpecs.filter((s) => !hiddenCols[s.key])
    if (specs.length === 0) return toast.error("All columns are hidden — enable at least one in Columns")

    const dateLine =
      item.dateMode === "range" ? `Period: ${formatDate(from)} – ${formatDate(to)}`
      : item.dateMode === "rangeOptional" && (optRange.from || optRange.to) ? `Received: ${optRange.from ? formatDate(optRange.from) : "start"} – ${optRange.to ? formatDate(optRange.to) : "today"}`
      : item.dateMode === "asOf" && asOfDate ? `As of: ${formatDate(asOfDate)}`
      : `As of: ${formatDate(today)}`
    const metaLines = [
      dateLine,
      ...(dimChips.length ? [`Filters: ${dimChips.map((c) => c.label).join("  ·  ")}`] : []),
    ]
    const kpis = sections.summary ? built.kpis : undefined
    const headers = specs.map((s) => s.header)
    const rows = built.dataRows.map((r) => specs.map((s) => s.cell(r)))
    const totalsRow = built.totals ? specs.map((s) => built.totals![s.key] ?? "") : undefined
    const fileName = `report-${active}${active === "stockPosition" ? `-${stockUnit}` : ""}-${asOfDate || today}`

    if (format === "pdf") {
      downloadPdf({
        title: built.title,
        metaLines,
        kpis,
        columns: specs.map((s) => ({ header: s.header, align: s.align ?? "left" })),
        rows,
        totalsRow,
        fileName,
        orientation: "landscape",
      })
    } else {
      downloadExcel({
        title: built.title,
        metaLines,
        kpis,
        headers,
        rows,
        totalsRow,
        fileName,
        sheetName: item.label,
      })
    }
  }

  const dimSelect = (key: DimKey, label: string, options: { value: string; label: string }[], searchable = false) => (
    <div key={key}>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      {searchable ? (
        <SearchableSelect
          options={options}
          value={dims[key]}
          onChange={(v) => setDims((d) => ({ ...d, [key]: v }))}
          placeholder="All — type to search…"
        />
      ) : (
        <select
          value={dims[key]}
          onChange={(e) => setDims((d) => ({ ...d, [key]: e.target.value }))}
          className="block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </div>
  )

  const dateInput = (value: string, onChange: (v: string) => void) => (
    <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
  )

  const showFiltersPopover = item.dims.length > 0 || item.dateMode === "rangeOptional" || item.dateMode === "asOf"
  const dateFilterCount =
    item.dateMode === "rangeOptional" ? (optRange.from ? 1 : 0) + (optRange.to ? 1 : 0)
    : item.dateMode === "asOf" && asOfDate ? 1
    : 0

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <Header title="Reports & Analytics" />

      <div className="space-y-5">
          {/* Toolbar: period + detailed filters + sections + columns + exports */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-3.5 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold text-gray-900 mr-1">{item.label}</h2>

              {item.dateMode === "range" && (
                <div className="flex flex-wrap items-center gap-2">
                  {dateInput(from, setFrom)}
                  <span className="text-gray-400">→</span>
                  {dateInput(to, setTo)}
                  {[
                    { l: "Today", f: today, t: today },
                    { l: "This month", f: today.slice(0, 8) + "01", t: today },
                    { l: "From 1 May", f: "2026-05-01", t: today },
                  ].map((p) => (
                    <button key={p.l} onClick={() => { setFrom(p.f); setTo(p.t) }} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 whitespace-nowrap">{p.l}</button>
                  ))}
                </div>
              )}

              <div className="ml-auto flex flex-wrap items-center gap-2">
                {showFiltersPopover && (
                  <Popover button={<><SlidersHorizontal size={15} />Filters</>} badge={activeDimCount + dateFilterCount}>
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-900">Report Filters</span>
                      {(activeDimCount + dateFilterCount) > 0 && (
                        <button type="button" onClick={() => { setDims(EMPTY_DIMS); setOptRange({ from: "", to: "" }); setAsOfDate("") }} className="text-xs font-medium text-blue-600 hover:text-blue-800">Clear all</button>
                      )}
                    </div>
                    <div className="space-y-3">
                      {item.dateMode === "asOf" && (
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">Stock as of date</label>
                          <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)}
                            className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          <div className="mt-2 flex flex-wrap gap-2">
                            {[
                              { l: "Today (live)", v: "" },
                              { l: "1 week ago", v: (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10) })() },
                              { l: "1 month ago", v: (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10) })() },
                            ].map((p) => (
                              <button key={p.l} type="button" onClick={() => setAsOfDate(p.v)}
                                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50">{p.l}</button>
                            ))}
                          </div>
                          <p className="mt-1.5 text-[11px] text-gray-400">Rewinds the whole report to end of that day — leave empty for live position.</p>
                        </div>
                      )}
                      {item.dateMode === "rangeOptional" && (
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">Received between</label>
                          <div className="space-y-2">
                            <input type="date" value={optRange.from} onChange={(e) => setOptRange((r) => ({ ...r, from: e.target.value }))}
                              className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            <input type="date" value={optRange.to} onChange={(e) => setOptRange((r) => ({ ...r, to: e.target.value }))}
                              className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          </div>
                        </div>
                      )}
                      {item.dims.includes("customerId") && dimSelect("customerId", "Party", (customers || []).map((c) => ({ value: c.id, label: c.name })), true)}
                      {item.dims.includes("bankId") && dimSelect("bankId", "Bank", (banks || []).map((b) => ({ value: b.id, label: b.name })))}
                      {item.dims.includes("supplierId") && dimSelect("supplierId", "Supplier", (suppliersList || []).map((s) => ({ value: s.id, label: s.name })))}
                      {item.dims.includes("warehouseId") && dimSelect("warehouseId", "Warehouse", (warehousesList || []).map((w) => ({ value: w.id, label: w.name })))}
                      {item.dims.includes("brand") && dimSelect("brand", "Brand", brands.map((b) => ({ value: b, label: b })))}
                      {item.dims.includes("status") && dimSelect(
                        "status",
                        active === "purchases" ? "LC Type" : "Status",
                        (active === "purchases"
                          ? LC_TYPES
                          : active === "poStatus"
                            ? Object.keys(poStatus.data?.byStatus || {})
                            : SO_STATUSES
                        ).map((s) => ({ value: s, label: s.replace(/_/g, " ") }))
                      )}
                    </div>
                  </Popover>
                )}

                <Popover button={<><Columns3 size={15} />Columns</>} badge={hiddenColCount}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">Table & export columns</span>
                    {hiddenColCount > 0 && (
                      <button type="button" onClick={() => setHiddenCols({})} className="text-xs font-medium text-blue-600 hover:text-blue-800">Show all</button>
                    )}
                  </div>
                  <div className="space-y-1 max-h-72 overflow-y-auto">
                    {columnSpecs.map((c) => (
                      <label key={c.key} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded accent-blue-600"
                          checked={!hiddenCols[c.key]}
                          onChange={(e) => setHiddenCols((cur) => ({ ...cur, [c.key]: !e.target.checked }))}
                        />
                        <span className="text-sm text-gray-700">{c.header}</span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-gray-400">Unticked columns are hidden in the table below and left out of PDF / Excel exports.</p>
                </Popover>

                <Popover button={<><LayoutGrid size={15} />Sections</>} badge={hiddenSectionCount}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">Include in page & exports</span>
                  </div>
                  <div className="space-y-1">
                    {item.sections.map((s) => (
                      <label key={s} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded accent-blue-600"
                          checked={sections[s]}
                          onChange={(e) => setSections((cur) => ({ ...cur, [s]: e.target.checked }))}
                        />
                        <span className="text-sm text-gray-700">{SECTION_LABELS[s]}</span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-gray-400">Unticked sections are hidden on screen and left out of the exported PDF / Excel.</p>
                </Popover>

                <Button variant="secondary" size="sm" onClick={() => exportReport("pdf")}><FileDown size={14} className="mr-1.5" />PDF</Button>
                <Button variant="secondary" size="sm" onClick={() => exportReport("excel")}><FileSpreadsheet size={14} className="mr-1.5" />Excel</Button>
              </div>
            </div>

            {(dimChips.length > 0 || dateFilterCount > 0) && (
              <div className="flex flex-wrap items-center gap-2">
                {item.dateMode === "asOf" && asOfDate && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 border border-purple-200 px-2.5 py-1 text-xs font-medium text-purple-700">
                    As of {formatDate(asOfDate)}
                    <button type="button" onClick={() => setAsOfDate("")} className="hover:text-purple-900" aria-label="Back to live"><X size={12} /></button>
                  </span>
                )}
                {item.dateMode === "rangeOptional" && (optRange.from || optRange.to) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 border border-purple-200 px-2.5 py-1 text-xs font-medium text-purple-700">
                    Received {optRange.from ? formatDate(optRange.from) : "start"} → {optRange.to ? formatDate(optRange.to) : "today"}
                    <button type="button" onClick={() => setOptRange({ from: "", to: "" })} className="hover:text-purple-900" aria-label="Clear date range"><X size={12} /></button>
                  </span>
                )}
                {dimChips.map((c) => (
                  <span key={c.key} className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-medium text-blue-700">
                    {c.label}
                    <button type="button" onClick={() => setDims((d) => ({ ...d, [c.key]: "" }))} className="hover:text-blue-900" aria-label="Remove filter">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {loading ? <TableSkeleton columns={6} rows={8} /> : (
            <>
              {active === "sales" && sales.data && <SalesView d={sales.data} sections={sections} hidden={hiddenCols} />}
              {active === "outstanding" && outstanding.data && <OutstandingView d={outstanding.data} sections={sections} hidden={hiddenCols} />}
              {active === "collections" && collections.data && <CollectionsView d={collections.data} sections={sections} hidden={hiddenCols} />}
              {active === "profit" && profit.data && <ProfitView d={profit.data} sections={sections} hidden={hiddenCols} />}
              {active === "purchases" && purchases.data && <PurchasesView d={purchases.data} sections={sections} hidden={hiddenCols} />}
              {active === "stockAging" && stockAging.data && <StockAgingView d={stockAging.data} sections={sections} hidden={hiddenCols} />}
              {active === "stock" && stock.data && <StockView d={stock.data} sections={sections} hidden={hiddenCols} asOfDate={asOfDate} />}
              {active === "poStatus" && poStatus.data && <POStatusView d={poStatus.data} rows={poRows} sections={sections} hidden={hiddenCols} />}
              {active === "stockPosition" && stockPosition.data && (
                <StockPositionView d={stockPosition.data} sections={sections} hidden={hiddenCols} unit={stockUnit} setUnit={setStockUnit} />
              )}
            </>
          )}
      </div>
    </div>
  )
}

// ---------- views ----------
type Sections = Record<SectionKey, boolean>
type Hidden = Record<string, boolean>

function SalesView({ d, sections, hidden }: { d: SalesReport; sections: Sections; hidden: Hidden }) {
  return (
    <>
      {sections.summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <MoneyKpi label="Sales Value" amount={d.summary.value} sub={`${d.summary.orders} orders`} icon={<TrendingUp size={18} />} tone="green" />
          <Kpi label="Panels Sold" value={d.summary.panels.toLocaleString()} icon={<Package size={18} />} tone="blue" />
          <Kpi label="Delivered" value={d.summary.delivered} sub={`${d.summary.pending} pending`} icon={<ShoppingCart size={18} />} tone="purple" />
          <MoneyKpi label="Avg Order" amount={d.summary.orders ? d.summary.value / d.summary.orders : 0} icon={<LineIcon size={18} />} tone="yellow" />
        </div>
      )}
      {sections.chart && <TrendChart data={d.byMonth} xKey="month" yKey="value" label="Monthly Sales" color="#16a34a" />}
      {sections.breakdowns && (
        <div className="grid lg:grid-cols-2 gap-5">
          <BreakdownCard title="Top Customers" data={d.byCustomer} columns={[{ key: "customer", header: "Customer", sortable: true }, numCol("panels", "Panels"), moneyCol("value", "Value", true)]} />
          <BreakdownCard title="By Brand" data={d.byBrand} columns={[{ key: "brand", header: "Brand", sortable: true }, numCol("panels", "Panels"), moneyCol("value", "Value", true)]} />
        </div>
      )}
      {sections.table && (
        <SectionCard title="Sales Orders" subtitle={`${d.rows.length} orders`}>
          <Table data={d.rows} searchPlaceholder="Search SO #, customer…" columns={vis<SalesReport["rows"][0]>([
            { key: "soNumber", header: "SO #", sortable: true, render: (r) => <span className="font-medium text-blue-700 whitespace-nowrap">{r.soNumber}</span> },
            { key: "date", header: "Date", sortable: true, render: (r) => <span className="whitespace-nowrap">{formatDate(r.date)}</span> },
            { key: "customer", header: "Customer", sortable: true },
            { key: "status", header: "Status", render: (r) => <Badge status={r.status} /> },
            numCol("panels", "Panels"), moneyCol("value", "Value", true),
          ], hidden)} emptyMessage="No sales orders" />
        </SectionCard>
      )}
    </>
  )
}

function OutstandingView({ d, sections, hidden }: { d: Outstanding; sections: Sections; hidden: Hidden }) {
  return (
    <>
      {sections.summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MoneyKpi label="Total Outstanding" amount={d.totalOutstanding} sub={`${d.rows.length} parties`} icon={<Wallet size={18} />} tone="red" />
          <MoneyKpi label="Advance / Credit" amount={d.totalAdvance} sub="overpaid by customers" icon={<Banknote size={18} />} tone="green" />
          <MoneyKpi label="Net Receivable" amount={d.totalOutstanding - d.totalAdvance} icon={<LineIcon size={18} />} tone="blue" />
        </div>
      )}
      {sections.breakdowns && (
        <BucketStrip items={[
          { label: "Current", value: d.summary.current || 0, tone: "border-green-200 bg-green-50 text-green-800" },
          { label: "1–30 days", value: d.summary["1to30"] || 0, tone: "border-yellow-200 bg-yellow-50 text-yellow-800" },
          { label: "31–60 days", value: d.summary["31to60"] || 0, tone: "border-orange-200 bg-orange-50 text-orange-800" },
          { label: "61–90 days", value: d.summary["61to90"] || 0, tone: "border-red-200 bg-red-50 text-red-700" },
          { label: "90+ days", value: d.summary.over90 || 0, tone: "border-red-300 bg-red-100 text-red-900" },
        ]} />
      )}
      {sections.table && (
        <SectionCard title="Customer Outstanding" subtitle="Sales − Collections, aged by oldest unpaid order">
          <Table data={d.rows} keyField="customerId" searchPlaceholder="Search customer…" columns={vis<Outstanding["rows"][0]>([
            { key: "customer", header: "Customer", sortable: true, render: (r) => <span className="font-medium text-gray-900">{r.customer}</span> },
            moneyCol("soTotal", "Sales"),
            { key: "collected", header: "Collected", sortable: true, className: "text-right", render: (r) => <span className="text-green-700 whitespace-nowrap">{formatCurrency(r.collected)}</span> },
            { key: "outstanding", header: "Outstanding", sortable: true, className: "text-right", render: (r) => <span className={`font-semibold whitespace-nowrap ${r.outstanding > 0 ? "text-red-600" : "text-green-700"}`}>{formatCurrency(r.outstanding)}</span> },
            { key: "over90", header: "90+ d", className: "text-right", value: (r) => r.buckets.over90 || 0, render: (r) => r.buckets.over90 ? <span className="text-red-700 whitespace-nowrap">{formatCurrency(r.buckets.over90)}</span> : <span className="text-gray-300">—</span> },
            { key: "oldestUnpaid", header: "Oldest", render: (r) => <span className="whitespace-nowrap">{r.oldestUnpaid ? formatDate(r.oldestUnpaid) : "—"}</span> },
          ], hidden)} emptyMessage="No outstanding balances" />
        </SectionCard>
      )}
    </>
  )
}

function CollectionsView({ d, sections, hidden }: { d: Collections; sections: Sections; hidden: Hidden }) {
  return (
    <>
      {sections.summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MoneyKpi label="Total Collected" amount={d.summary.total} sub={`${d.summary.count} receipts`} icon={<Banknote size={18} />} tone="green" />
          <Kpi label="Banks" value={d.byBank.length} sub="accounts used" icon={<Wallet size={18} />} tone="blue" />
        </div>
      )}
      {sections.chart && <TrendChart data={d.byMonth} xKey="month" yKey="total" label="Monthly Collections" color="#0ea5e9" />}
      {sections.breakdowns && (
        <div className="grid lg:grid-cols-2 gap-5">
          <BreakdownCard title="By Bank" data={d.byBank} columns={[{ key: "bank", header: "Bank", sortable: true }, numCol("count", "Receipts"), moneyCol("total", "Total", true)]} />
          <BreakdownCard title="Top Parties" data={d.byParty} columns={[{ key: "customer", header: "Customer", sortable: true }, numCol("count", "Receipts"), moneyCol("total", "Total", true)]} />
        </div>
      )}
      {sections.table && (
        <SectionCard title="Collection Receipts" subtitle={`${d.rows.length} receipts`}>
          <Table data={d.rows} searchPlaceholder="Search receipt, customer, ref…" columns={vis<Collections["rows"][0]>([
            { key: "receiptNo", header: "Receipt #", sortable: true, render: (r) => <span className="font-medium text-blue-700 whitespace-nowrap">{r.receiptNo}</span> },
            { key: "date", header: "Date", sortable: true, render: (r) => <span className="whitespace-nowrap">{formatDate(r.date)}</span> },
            { key: "customer", header: "Customer", sortable: true },
            { key: "bank", header: "Bank", sortable: true },
            { key: "reference", header: "Reference", render: (r) => r.reference || "—" },
            moneyCol("amount", "Amount", true),
          ], hidden)} emptyMessage="No collections in range" />
        </SectionCard>
      )}
    </>
  )
}

function ProfitView({ d, sections, hidden }: { d: Profit; sections: Sections; hidden: Hidden }) {
  return (
    <>
      {sections.summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <MoneyKpi label="Revenue" amount={d.summary.revenue} icon={<TrendingUp size={18} />} tone="green" />
          <MoneyKpi label="Cost (FIFO)" amount={d.summary.cogs} icon={<Package size={18} />} tone="red" />
          <MoneyKpi label="Gross Profit" amount={d.summary.grossProfit} icon={<LineIcon size={18} />} tone="blue" />
          <Kpi label="Margin" value={`${d.summary.marginPct.toFixed(1)}%`} icon={<Wallet size={18} />} tone="purple" />
        </div>
      )}
      {sections.table && (
        <SectionCard title="Gross Profit by Product" subtitle="Delivered sales − FIFO landed cost">
          <Table data={d.rows} keyField="product" searchPlaceholder="Search product…" columns={vis<Profit["rows"][0]>([
            { key: "product", header: "Product", sortable: true, render: (r) => <span className="font-medium text-gray-900">{r.product}</span> },
            { key: "brand", header: "Brand", sortable: true },
            numCol("panels", "Panels"), moneyCol("revenue", "Revenue"), moneyCol("cogs", "Cost"),
            { key: "grossProfit", header: "Gross Profit", sortable: true, className: "text-right", render: (r) => <span className={`font-semibold whitespace-nowrap ${r.grossProfit >= 0 ? "text-green-700" : "text-red-600"}`}>{formatCurrency(r.grossProfit)}</span> },
            { key: "marginPct", header: "Margin", sortable: true, className: "text-right", render: (r) => `${r.marginPct.toFixed(1)}%` },
          ], hidden)} emptyMessage="No delivered sales in range" />
        </SectionCard>
      )}
    </>
  )
}

function PurchasesView({ d, sections, hidden }: { d: Purchases; sections: Sections; hidden: Hidden }) {
  return (
    <>
      {sections.summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Kpi label="Purchase Orders" value={d.summary.orders} icon={<ClipboardList size={18} />} tone="blue" />
          <Kpi label="Panels" value={d.summary.panels.toLocaleString()} icon={<Package size={18} />} tone="purple" />
          <MoneyKpi label="Purchase Value" amount={d.summary.value} icon={<ShoppingCart size={18} />} tone="green" />
        </div>
      )}
      {sections.chart && <TrendChart data={d.byMonth} xKey="month" yKey="value" label="Monthly Purchases" color="#8b5cf6" />}
      {sections.breakdowns && (
        <BreakdownCard title="By Supplier" data={d.bySupplier} columns={[{ key: "supplier", header: "Supplier", sortable: true }, numCol("orders", "POs"), numCol("panels", "Panels"), moneyCol("value", "Value", true)]} />
      )}
      {sections.table && (
        <SectionCard title="Purchase Orders" subtitle={`${d.rows.length} POs`}>
          <Table data={d.rows} searchPlaceholder="Search PO, supplier, product…" columns={vis<Purchases["rows"][0]>([
            { key: "poNumber", header: "PO #", sortable: true, render: (r) => <span className="font-medium text-blue-700 whitespace-nowrap">{r.poNumber}</span> },
            { key: "date", header: "Date", sortable: true, render: (r) => <span className="whitespace-nowrap">{formatDate(r.date)}</span> },
            { key: "supplier", header: "Supplier", sortable: true },
            { key: "product", header: "Product", sortable: true },
            { key: "lcType", header: "Type", render: (r) => <Badge status={r.lcType} /> },
            numCol("panels", "Panels"), moneyCol("value", "PKR Value", true),
          ], hidden)} emptyMessage="No purchases in range" />
        </SectionCard>
      )}
    </>
  )
}

function StockAgingView({ d, sections, hidden }: { d: StockAging; sections: Sections; hidden: Hidden }) {
  const tone: Record<string, string> = { "0to30": "border-green-200 bg-green-50 text-green-800", "31to60": "border-yellow-200 bg-yellow-50 text-yellow-800", "61to90": "border-orange-200 bg-orange-50 text-orange-800", over90: "border-red-200 bg-red-50 text-red-700" }
  const labels: Record<string, string> = { "0to30": "0–30 days", "31to60": "31–60 days", "61to90": "61–90 days", over90: "90+ days" }
  return (
    <>
      {sections.summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {["0to30", "31to60", "61to90", "over90"].map((k) => (
            <div key={k} className={`rounded-xl border p-4 min-w-0 ${tone[k]}`} title={formatCurrency(d.summary[k]?.value || 0)}>
              <p className="text-xs font-medium opacity-80">{labels[k]}</p>
              <p className="mt-1 text-lg font-bold tabular-nums">{(d.summary[k]?.panels || 0).toLocaleString()}<span className="text-xs font-normal opacity-70"> panels</span></p>
              <p className="text-xs opacity-70 whitespace-nowrap">{compactMoney(d.summary[k]?.value || 0)}</p>
            </div>
          ))}
        </div>
      )}
      {sections.table && (
        <SectionCard title="Stock Aging" subtitle="Available batches by age — watch the 90+ day dead stock">
          <Table data={d.rows} searchPlaceholder="Search product…" columns={vis<StockAging["rows"][0]>([
            { key: "product", header: "Product", sortable: true, render: (r) => <span className="font-medium text-gray-900">{r.product}</span> },
            { key: "warehouse", header: "Warehouse", sortable: true },
            numCol("availablePanels", "Panels"),
            { key: "ageDays", header: "Age", sortable: true, className: "text-right", render: (r) => <span className={r.ageDays > 90 ? "font-semibold text-red-600" : ""}>{r.ageDays}d</span> },
            moneyCol("value", "Value", true),
            { key: "receivedAt", header: "Received", render: (r) => <span className="whitespace-nowrap">{formatDate(r.receivedAt)}</span> },
          ], hidden)} emptyMessage="No stock" />
        </SectionCard>
      )}
    </>
  )
}

function StockView({ d, sections, hidden, asOfDate }: { d: StockSummary; sections: Sections; hidden: Hidden; asOfDate: string }) {
  return (
    <>
      {sections.summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Kpi label="Current Stock" value={d.totals.currentPanels.toLocaleString()} sub="panels" icon={<Package size={18} />} tone="blue" />
          <Kpi label="Available" value={d.totals.availablePanels.toLocaleString()} sub={formatCurrency(d.totals.availableValue)} icon={<Package size={18} />} tone="green" />
          <Kpi label="Reserved" value={d.totals.reservedPanels.toLocaleString()} sub="panels" icon={<Clock size={18} />} tone="yellow" />
          <MoneyKpi label="Stock Value" amount={d.totals.totalValue} icon={<Wallet size={18} />} tone="purple" />
        </div>
      )}
      {sections.table && (
        <SectionCard title="Stock by Batch" subtitle={`${d.rows.length} batches${asOfDate ? ` — as of ${formatDate(asOfDate)}` : ""}`}>
          <Table data={d.rows} searchPlaceholder="Search product…" columns={vis<StockSummary["rows"][0]>([
            { key: "product", header: "Product", sortable: true, render: (r) => <span className="font-medium text-gray-900">{r.product}</span> },
            { key: "warehouse", header: "Warehouse", sortable: true },
            numCol("currentPanels", "Current"), numCol("reservedPanels", "Reserved"),
            { key: "availablePanels", header: "Available", sortable: true, className: "text-right", render: (r) => <span className="font-semibold text-green-700">{r.availablePanels.toLocaleString()}</span> },
            moneyCol("availableValue", "Avail. Value", true),
          ], hidden)} emptyMessage="No stock" />
        </SectionCard>
      )}
    </>
  )
}

function StockPositionView({ d, sections, hidden, unit, setUnit }: {
  d: StockPosition
  sections: Sections
  hidden: Hidden
  unit: StockUnit
  setUnit: (u: StockUnit) => void
}) {
  const num = (v: number) => v.toLocaleString()
  const totalAvailValue = d.rows.reduce((s, r) => s + availValue(r), 0)
  const kpis = stockPositionKpis(d, unit)
  const kpiIcons = [<Package key="a" size={18} />, <Boxes key="b" size={18} />, <Clock key="c" size={18} />, <Wallet key="d" size={18} />]
  const kpiTones: KpiTone[] = ["blue", "green", "yellow", "purple"]

  return (
    <>
      {sections.summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {kpis.map((k, i) => (
            <Kpi
              key={k.label}
              label={k.label}
              value={k.value}
              full={(k as { full?: string }).full}
              sub={k.subtitle}
              icon={kpiIcons[i]}
              tone={kpiTones[i]}
            />
          ))}
        </div>
      )}

      {sections.table && (
        <SectionCard
          title="Stock Position"
          subtitle={`As of ${formatDate(d.asOf)} — received → sold → delivered → available, like the manual stock sheet`}
          headerExtra={
            <div className="flex gap-1">
              {([["panels", "Panels"], ["containers", "Containers"], ["value", "PKR Value"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setUnit(k)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${unit === k ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {l}
                </button>
              ))}
            </div>
          }
        >
          {unit === "panels" && (
            <div className="overflow-x-auto">
              <Table data={d.rows} keyField="productId" searchPlaceholder="Search item…" compact columns={vis<StockPositionRow>([
                { key: "item", header: "Item", sortable: true, render: (r) => <span className="font-medium text-gray-900 whitespace-nowrap">{r.item}</span> },
                { key: "packing", header: "Packing", className: "text-right", render: (r) => r.packing ?? "—" },
                { key: "receivedLocal", header: "Recv Local", sortable: true, className: "text-right", render: (r) => num(r.receivedLocal) },
                { key: "receivedImport", header: "Recv Import", sortable: true, className: "text-right", render: (r) => num(r.receivedImport) },
                { key: "so", header: "SO", sortable: true, className: "text-right", render: (r) => num(r.so) },
                { key: "doIssued", header: "DO Issued", sortable: true, className: "text-right", render: (r) => num(r.doIssued) },
                { key: "lifted", header: "Lifted DO", sortable: true, className: "text-right", render: (r) => num(r.lifted) },
                { key: "unlifted", header: "Unlifted DO", sortable: true, className: "text-right", render: (r) => r.unlifted ? <span className="text-amber-700">{num(r.unlifted)}</span> : "—" },
                { key: "warehouseStock", header: "WH Stock", sortable: true, className: "text-right", render: (r) => <span className="font-semibold">{num(r.warehouseStock)}</span> },
                { key: "balanceSO", header: "Bal. SO", sortable: true, className: "text-right", render: (r) => r.balanceSO ? <span className="text-orange-700">{num(r.balanceSO)}</span> : "—" },
                { key: "availableForSale", header: "Available", sortable: true, className: "text-right", render: (r) => <span className={`font-bold ${r.availableForSale < 0 ? "text-red-600" : "text-green-700"}`}>{num(r.availableForSale)}</span> },
              ], hidden)} emptyMessage="No stock data" />
            </div>
          )}

          {unit === "containers" && (
            <div className="overflow-x-auto">
              <Table data={d.rows} keyField="productId" searchPlaceholder="Search item…" compact columns={vis<StockPositionRow>([
                { key: "item", header: "Item", sortable: true, render: (r) => <span className="font-medium text-gray-900 whitespace-nowrap">{r.item}</span> },
                { key: "receivedLocal", header: "Ctr Recv Local", className: "text-right", render: (r) => inCtr(r.receivedLocal, r) },
                { key: "receivedImport", header: "Ctr Recv Import", className: "text-right", render: (r) => inCtr(r.receivedImport, r) },
                { key: "doIssued", header: "Sales (DO Issued)", className: "text-right", render: (r) => inCtr(r.doIssued, r) },
                { key: "warehouseStock", header: "WH Stock", className: "text-right", render: (r) => <span className="font-semibold">{inCtr(r.warehouseStock, r)}</span> },
                { key: "balanceSO", header: "Sales Deals (Bal. SO)", className: "text-right", render: (r) => inCtr(r.balanceSO, r) },
                { key: "availableForSale", header: "Ctr Available", className: "text-right", render: (r) => <span className={`font-bold ${r.availableForSale < 0 ? "text-red-600" : "text-green-700"}`}>{inCtr(r.availableForSale, r)}</span> },
              ], hidden)} emptyMessage="No stock data" />
            </div>
          )}

          {unit === "value" && (
            <>
              <div className="overflow-x-auto">
                <Table data={d.rows} keyField="productId" searchPlaceholder="Search item…" compact columns={vis<StockPositionRow>([
                  { key: "item", header: "Item", sortable: true, render: (r) => <span className="font-medium text-gray-900 whitespace-nowrap">{r.item}</span> },
                  { key: "packing", header: "Packing", className: "text-right", render: (r) => r.packing ?? "—" },
                  { key: "availableForSale", header: "Panels Available", sortable: true, className: "text-right", render: (r) => <span className={r.availableForSale < 0 ? "text-red-600 font-semibold" : ""}>{num(r.availableForSale)}</span> },
                  { key: "fifoRatePerWatt", header: "Cost Rate/Watt (FIFO)", sortable: true, className: "text-right", render: (r) => r.fifoRatePerWatt ? `Rs ${r.fifoRatePerWatt.toFixed(2)}` : "—" },
                  { key: "availWatts", header: "Stock in Watts", className: "text-right", value: (r) => availWatts(r), render: (r) => num(availWatts(r)) },
                  { key: "availValue", header: "Stock Value (Rs)", sortable: true, className: "text-right", value: (r) => availValue(r), render: (r) => <span className={`font-semibold ${availValue(r) < 0 ? "text-red-600" : "text-gray-900"}`}>{formatCurrency(availValue(r))}</span> },
                ], hidden)} emptyMessage="No stock data" />
              </div>
              <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-sm">
                <span className="font-medium text-gray-600">Total — Available for Sale valuation (FIFO base)</span>
                <span className="font-bold text-gray-900">{formatCurrency(totalAvailValue)}</span>
              </div>
            </>
          )}
        </SectionCard>
      )}
    </>
  )
}

function POStatusView({ d, rows, sections, hidden }: { d: POStatus; rows: POStatus["rows"]; sections: Sections; hidden: Hidden }) {
  return (
    <>
      {sections.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
          {Object.entries(d.byStatus).map(([s, c]) => <Kpi key={s} label={s.replace(/_/g, " ")} value={c} sub="purchase orders" icon={<ClipboardList size={18} />} tone="blue" />)}
        </div>
      )}
      {sections.table && (
        <SectionCard title="Purchase Order Status" subtitle={`${rows.length} POs`}>
          <Table data={rows} searchPlaceholder="Search PO, supplier…" columns={vis<POStatus["rows"][0]>([
            { key: "poNumber", header: "PO #", sortable: true, render: (r) => <span className="font-medium text-blue-700 whitespace-nowrap">{r.poNumber}</span> },
            { key: "supplier", header: "Supplier", sortable: true },
            { key: "product", header: "Product", sortable: true },
            numCol("noOfPanels", "Ordered"), numCol("receivedPanels", "Received"),
            moneyCol("poAmountPkr", "PKR Value", true),
            { key: "status", header: "Status", render: (r) => <Badge status={r.status} /> },
          ], hidden)} emptyMessage="No purchase orders" />
        </SectionCard>
      )}
    </>
  )
}
