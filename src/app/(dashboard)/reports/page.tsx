"use client"

import { useMemo, useState, type ReactNode } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { StatCard } from "@/components/ui/Card"
import { Table, type Column } from "@/components/ui/Table"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { formatCurrency, formatDate } from "@/lib/utils"
import {
  Download, TrendingUp, Wallet, Banknote, LineChart as LineIcon, Package, Clock, ClipboardList, ShoppingCart,
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

const GROUPS: { group: string; items: { key: string; label: string; icon: ReactNode; dated?: boolean }[] }[] = [
  { group: "Sales", items: [{ key: "sales", label: "Sales Analysis", icon: <TrendingUp size={16} />, dated: true }] },
  { group: "Receivables", items: [{ key: "outstanding", label: "Outstanding & Aging", icon: <Wallet size={16} /> }] },
  { group: "Collections", items: [{ key: "collections", label: "Collections", icon: <Banknote size={16} />, dated: true }] },
  { group: "Profitability", items: [{ key: "profit", label: "Gross Profit", icon: <LineIcon size={16} />, dated: true }] },
  { group: "Inventory", items: [{ key: "stock", label: "Stock Summary", icon: <Package size={16} /> }, { key: "stockAging", label: "Stock Aging", icon: <Clock size={16} /> }] },
  { group: "Procurement", items: [{ key: "poStatus", label: "PO Status", icon: <ClipboardList size={16} /> }, { key: "purchases", label: "Purchases", icon: <ShoppingCart size={16} />, dated: true }] },
]
const ALL_ITEMS = GROUPS.flatMap((g) => g.items)
const compact = (n: number) => (Math.abs(n) >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : `${n}`)

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n")
  const a = document.createElement("a")
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
  a.download = `${filename}.csv`; a.click(); URL.revokeObjectURL(a.href)
}

// ---------- small UI helpers ----------
function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function BucketStrip({ items }: { items: { label: string; value: number; tone: string }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
      {items.map((b) => (
        <div key={b.label} className={`rounded-xl border p-4 ${b.tone}`}>
          <p className="text-xs font-medium opacity-80">{b.label}</p>
          <p className="mt-1 text-base font-bold">{formatCurrency(b.value)}</p>
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
              <YAxis tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} tickFormatter={(v) => compact(Number(v))} width={48} />
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
      <Table columns={columns} data={data} searchable={false} pageSizeOptions={[]} pageSize={8} compact emptyMessage="No data" />
    </SectionCard>
  )
}

const moneyCol = <T extends Record<string, unknown>>(key: string, header: string, strong = false): Column<T> => ({
  key, header, sortable: true, className: "text-right",
  render: (r) => <span className={strong ? "font-semibold text-gray-900" : ""}>{formatCurrency(Number(r[key]))}</span>,
})
const numCol = <T extends Record<string, unknown>>(key: string, header: string): Column<T> => ({
  key, header, sortable: true, className: "text-right", render: (r) => Number(r[key]).toLocaleString(),
})

export default function ReportsPage() {
  const [active, setActive] = useState("outstanding")
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState("2026-05-01")
  const [to, setTo] = useState(today)

  const item = ALL_ITEMS.find((i) => i.key === active)!
  const qs = item.dated ? `?from=${from}&to=${to}` : ""
  const url = (key: string, path: string) => (active === key ? `/api/reports/${path}${qs}` : "")

  const sales = useFetch<SalesReport>(url("sales", "sales"), [active, qs])
  const outstanding = useFetch<Outstanding>(url("outstanding", "outstanding"), [active])
  const collections = useFetch<Collections>(url("collections", "collections"), [active, qs])
  const profit = useFetch<Profit>(url("profit", "profitability"), [active, qs])
  const purchases = useFetch<Purchases>(url("purchases", "purchases"), [active, qs])
  const stockAging = useFetch<StockAging>(url("stockAging", "inventory-aging"), [active])
  const stock = useFetch<StockSummary>(url("stock", "stock-summary"), [active])
  const poStatus = useFetch<POStatus>(url("poStatus", "po-status"), [active])

  const loading = [sales, outstanding, collections, profit, purchases, stockAging, stock, poStatus].some((q) => q.loading)
  const exportRows = useMemo<Record<string, unknown>[]>(() => {
    const m: Record<string, unknown[]> = {
      sales: sales.data?.rows || [], collections: collections.data?.rows || [], profit: profit.data?.rows || [],
      purchases: purchases.data?.rows || [], stockAging: stockAging.data?.rows || [], stock: stock.data?.rows || [], poStatus: poStatus.data?.rows || [],
      outstanding: outstanding.data?.rows.map((r) => ({ customer: r.customer, sales: r.soTotal, collected: r.collected, outstanding: r.outstanding })) || [],
    }
    return (m[active] as Record<string, unknown>[]) || []
  }, [active, sales.data, outstanding.data, collections.data, profit.data, purchases.data, stockAging.data, stock.data, poStatus.data])

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <Header
        title="Reports & Analytics"
        actions={<Button variant="secondary" onClick={() => exportRows.length ? downloadCsv(`report-${active}`, exportRows) : toast.error("Nothing to export")}><Download size={15} className="mr-2" />Export CSV</Button>}
      />

      <div className="grid grid-cols-12 gap-6">
        {/* ── Sidebar menu ── */}
        <aside className="col-span-12 lg:col-span-3">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 lg:sticky lg:top-4">
            {GROUPS.map((g) => (
              <div key={g.group} className="mb-3 last:mb-0">
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{g.group}</p>
                <div className="space-y-0.5">
                  {g.items.map((it) => {
                    const on = active === it.key
                    return (
                      <button key={it.key} onClick={() => setActive(it.key)}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${on ? "bg-blue-50 font-medium text-blue-700" : "text-gray-600 hover:bg-gray-50"}`}>
                        <span className={on ? "text-blue-600" : "text-gray-400"}>{it.icon}</span>
                        {it.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Report area ── */}
        <main className="col-span-12 lg:col-span-9 space-y-5">
          {item.dated && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-3.5 flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-gray-700">Period</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <span className="text-gray-400">→</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="ml-auto flex gap-2">
                {[{ l: "This month", f: today.slice(0, 8) + "01" }, { l: "From 1 May", f: "2026-05-01" }].map((p) => (
                  <button key={p.l} onClick={() => { setFrom(p.f); setTo(today) }} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">{p.l}</button>
                ))}
              </div>
            </div>
          )}

          {loading ? <TableSkeleton columns={6} rows={8} /> : (
            <>
              {active === "sales" && sales.data && <SalesView d={sales.data} />}
              {active === "outstanding" && outstanding.data && <OutstandingView d={outstanding.data} />}
              {active === "collections" && collections.data && <CollectionsView d={collections.data} />}
              {active === "profit" && profit.data && <ProfitView d={profit.data} />}
              {active === "purchases" && purchases.data && <PurchasesView d={purchases.data} />}
              {active === "stockAging" && stockAging.data && <StockAgingView d={stockAging.data} />}
              {active === "stock" && stock.data && <StockView d={stock.data} />}
              {active === "poStatus" && poStatus.data && <POStatusView d={poStatus.data} />}
            </>
          )}
        </main>
      </div>
    </div>
  )
}

// ---------- views ----------
function SalesView({ d }: { d: SalesReport }) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Sales Value" value={formatCurrency(d.summary.value)} subtitle={`${d.summary.orders} orders`} icon={<TrendingUp size={20} />} color="green" />
        <StatCard title="Panels Sold" value={d.summary.panels.toLocaleString()} icon={<Package size={20} />} color="blue" />
        <StatCard title="Delivered" value={d.summary.delivered} subtitle={`${d.summary.pending} pending`} icon={<ShoppingCart size={20} />} color="purple" />
        <StatCard title="Avg Order" value={formatCurrency(d.summary.orders ? d.summary.value / d.summary.orders : 0)} icon={<LineIcon size={20} />} color="yellow" />
      </div>
      <TrendChart data={d.byMonth} xKey="month" yKey="value" label="Monthly Sales" color="#16a34a" />
      <div className="grid lg:grid-cols-2 gap-5">
        <BreakdownCard title="Top Customers" data={d.byCustomer} columns={[{ key: "customer", header: "Customer", sortable: true }, numCol("panels", "Panels"), moneyCol("value", "Value", true)]} />
        <BreakdownCard title="By Brand" data={d.byBrand} columns={[{ key: "brand", header: "Brand", sortable: true }, numCol("panels", "Panels"), moneyCol("value", "Value", true)]} />
      </div>
      <SectionCard title="Sales Orders" subtitle={`${d.rows.length} orders`}>
        <Table data={d.rows} searchPlaceholder="Search SO #, customer…" columns={[
          { key: "soNumber", header: "SO #", sortable: true, render: (r) => <span className="font-medium text-blue-700">{r.soNumber}</span> },
          { key: "date", header: "Date", sortable: true, render: (r) => formatDate(r.date) },
          { key: "customer", header: "Customer", sortable: true },
          { key: "status", header: "Status", render: (r) => <Badge status={r.status} /> },
          numCol("panels", "Panels"), moneyCol("value", "Value", true),
        ]} emptyMessage="No sales orders" />
      </SectionCard>
    </>
  )
}

function OutstandingView({ d }: { d: Outstanding }) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Total Outstanding" value={formatCurrency(d.totalOutstanding)} subtitle={`${d.rows.length} parties`} icon={<Wallet size={20} />} color="red" />
        <StatCard title="Advance / Credit" value={formatCurrency(d.totalAdvance)} subtitle="overpaid by customers" icon={<Banknote size={20} />} color="green" />
        <StatCard title="Net Receivable" value={formatCurrency(d.totalOutstanding - d.totalAdvance)} icon={<LineIcon size={20} />} color="blue" />
      </div>
      <BucketStrip items={[
        { label: "Current", value: d.summary.current || 0, tone: "border-green-200 bg-green-50 text-green-800" },
        { label: "1–30 days", value: d.summary["1to30"] || 0, tone: "border-yellow-200 bg-yellow-50 text-yellow-800" },
        { label: "31–60 days", value: d.summary["31to60"] || 0, tone: "border-orange-200 bg-orange-50 text-orange-800" },
        { label: "61–90 days", value: d.summary["61to90"] || 0, tone: "border-red-200 bg-red-50 text-red-700" },
        { label: "90+ days", value: d.summary.over90 || 0, tone: "border-red-300 bg-red-100 text-red-900" },
      ]} />
      <SectionCard title="Customer Outstanding" subtitle="Sales − Collections, aged by oldest unpaid order">
        <Table data={d.rows} searchPlaceholder="Search customer…" columns={[
          { key: "customer", header: "Customer", sortable: true, render: (r) => <span className="font-medium text-gray-900">{r.customer}</span> },
          moneyCol("soTotal", "Sales"),
          { key: "collected", header: "Collected", sortable: true, className: "text-right", render: (r) => <span className="text-green-700">{formatCurrency(r.collected)}</span> },
          { key: "outstanding", header: "Outstanding", sortable: true, className: "text-right", render: (r) => <span className={`font-semibold ${r.outstanding > 0 ? "text-red-600" : "text-green-700"}`}>{formatCurrency(r.outstanding)}</span> },
          { key: "over90", header: "90+ d", className: "text-right", value: (r) => r.buckets.over90 || 0, render: (r) => r.buckets.over90 ? <span className="text-red-700">{formatCurrency(r.buckets.over90)}</span> : <span className="text-gray-300">—</span> },
          { key: "oldestUnpaid", header: "Oldest", render: (r) => r.oldestUnpaid ? formatDate(r.oldestUnpaid) : "—" },
        ]} emptyMessage="No outstanding balances" />
      </SectionCard>
    </>
  )
}

function CollectionsView({ d }: { d: Collections }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <StatCard title="Total Collected" value={formatCurrency(d.summary.total)} subtitle={`${d.summary.count} receipts`} icon={<Banknote size={20} />} color="green" />
        <StatCard title="Banks" value={d.byBank.length} subtitle="accounts used" icon={<Wallet size={20} />} color="blue" />
      </div>
      <TrendChart data={d.byMonth} xKey="month" yKey="total" label="Monthly Collections" color="#0ea5e9" />
      <div className="grid lg:grid-cols-2 gap-5">
        <BreakdownCard title="By Bank" data={d.byBank} columns={[{ key: "bank", header: "Bank", sortable: true }, numCol("count", "Receipts"), moneyCol("total", "Total", true)]} />
        <BreakdownCard title="Top Parties" data={d.byParty} columns={[{ key: "customer", header: "Customer", sortable: true }, numCol("count", "Receipts"), moneyCol("total", "Total", true)]} />
      </div>
      <SectionCard title="Collection Receipts" subtitle={`${d.rows.length} receipts`}>
        <Table data={d.rows} searchPlaceholder="Search receipt, customer, ref…" columns={[
          { key: "receiptNo", header: "Receipt #", sortable: true, render: (r) => <span className="font-medium text-blue-700">{r.receiptNo}</span> },
          { key: "date", header: "Date", sortable: true, render: (r) => formatDate(r.date) },
          { key: "customer", header: "Customer", sortable: true },
          { key: "bank", header: "Bank", sortable: true },
          { key: "reference", header: "Reference", render: (r) => r.reference || "—" },
          moneyCol("amount", "Amount", true),
        ]} emptyMessage="No collections in range" />
      </SectionCard>
    </>
  )
}

function ProfitView({ d }: { d: Profit }) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Revenue" value={formatCurrency(d.summary.revenue)} icon={<TrendingUp size={20} />} color="green" />
        <StatCard title="Cost (FIFO)" value={formatCurrency(d.summary.cogs)} icon={<Package size={20} />} color="red" />
        <StatCard title="Gross Profit" value={formatCurrency(d.summary.grossProfit)} icon={<LineIcon size={20} />} color="blue" />
        <StatCard title="Margin" value={`${d.summary.marginPct.toFixed(1)}%`} icon={<Wallet size={20} />} color="purple" />
      </div>
      <SectionCard title="Gross Profit by Product" subtitle="Delivered sales − FIFO landed cost">
        <Table data={d.rows} searchPlaceholder="Search product…" columns={[
          { key: "product", header: "Product", sortable: true, render: (r) => <span className="font-medium text-gray-900">{r.product}</span> },
          { key: "brand", header: "Brand", sortable: true },
          numCol("panels", "Panels"), moneyCol("revenue", "Revenue"), moneyCol("cogs", "Cost"),
          { key: "grossProfit", header: "Gross Profit", sortable: true, className: "text-right", render: (r) => <span className={`font-semibold ${r.grossProfit >= 0 ? "text-green-700" : "text-red-600"}`}>{formatCurrency(r.grossProfit)}</span> },
          { key: "marginPct", header: "Margin", sortable: true, className: "text-right", render: (r) => `${r.marginPct.toFixed(1)}%` },
        ]} emptyMessage="No delivered sales in range" />
      </SectionCard>
    </>
  )
}

function PurchasesView({ d }: { d: Purchases }) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Purchase Orders" value={d.summary.orders} icon={<ClipboardList size={20} />} color="blue" />
        <StatCard title="Panels" value={d.summary.panels.toLocaleString()} icon={<Package size={20} />} color="purple" />
        <StatCard title="Purchase Value" value={formatCurrency(d.summary.value)} icon={<ShoppingCart size={20} />} color="green" />
      </div>
      <TrendChart data={d.byMonth} xKey="month" yKey="value" label="Monthly Purchases" color="#8b5cf6" />
      <BreakdownCard title="By Supplier" data={d.bySupplier} columns={[{ key: "supplier", header: "Supplier", sortable: true }, numCol("orders", "POs"), numCol("panels", "Panels"), moneyCol("value", "Value", true)]} />
      <SectionCard title="Purchase Orders" subtitle={`${d.rows.length} POs`}>
        <Table data={d.rows} searchPlaceholder="Search PO, supplier, product…" columns={[
          { key: "poNumber", header: "PO #", sortable: true, render: (r) => <span className="font-medium text-blue-700">{r.poNumber}</span> },
          { key: "date", header: "Date", sortable: true, render: (r) => formatDate(r.date) },
          { key: "supplier", header: "Supplier", sortable: true },
          { key: "product", header: "Product", sortable: true },
          { key: "lcType", header: "Type", render: (r) => <Badge status={r.lcType} /> },
          numCol("panels", "Panels"), moneyCol("value", "PKR Value", true),
        ]} emptyMessage="No purchases in range" />
      </SectionCard>
    </>
  )
}

function StockAgingView({ d }: { d: StockAging }) {
  const tone: Record<string, string> = { "0to30": "border-green-200 bg-green-50 text-green-800", "31to60": "border-yellow-200 bg-yellow-50 text-yellow-800", "61to90": "border-orange-200 bg-orange-50 text-orange-800", over90: "border-red-200 bg-red-50 text-red-700" }
  const labels: Record<string, string> = { "0to30": "0–30 days", "31to60": "31–60 days", "61to90": "61–90 days", over90: "90+ days" }
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {["0to30", "31to60", "61to90", "over90"].map((k) => (
          <div key={k} className={`rounded-xl border p-4 ${tone[k]}`}>
            <p className="text-xs font-medium opacity-80">{labels[k]}</p>
            <p className="mt-1 text-lg font-bold">{(d.summary[k]?.panels || 0).toLocaleString()}<span className="text-xs font-normal opacity-70"> panels</span></p>
            <p className="text-xs opacity-70">{formatCurrency(d.summary[k]?.value || 0)}</p>
          </div>
        ))}
      </div>
      <SectionCard title="Stock Aging" subtitle="Available batches by age — watch the 90+ day dead stock">
        <Table data={d.rows} searchPlaceholder="Search product…" columns={[
          { key: "product", header: "Product", sortable: true, render: (r) => <span className="font-medium text-gray-900">{r.product}</span> },
          { key: "warehouse", header: "Warehouse", sortable: true },
          numCol("availablePanels", "Panels"),
          { key: "ageDays", header: "Age", sortable: true, className: "text-right", render: (r) => <span className={r.ageDays > 90 ? "font-semibold text-red-600" : ""}>{r.ageDays}d</span> },
          moneyCol("value", "Value", true),
          { key: "receivedAt", header: "Received", render: (r) => formatDate(r.receivedAt) },
        ]} emptyMessage="No stock" />
      </SectionCard>
    </>
  )
}

function StockView({ d }: { d: StockSummary }) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Current Stock" value={`${d.totals.currentPanels.toLocaleString()}`} subtitle="panels" icon={<Package size={20} />} color="blue" />
        <StatCard title="Available" value={`${d.totals.availablePanels.toLocaleString()}`} subtitle={formatCurrency(d.totals.availableValue)} icon={<Package size={20} />} color="green" />
        <StatCard title="Reserved" value={`${d.totals.reservedPanels.toLocaleString()}`} subtitle="panels" icon={<Clock size={20} />} color="yellow" />
        <StatCard title="Stock Value" value={formatCurrency(d.totals.totalValue)} icon={<Wallet size={20} />} color="purple" />
      </div>
      <SectionCard title="Stock by Batch" subtitle={`${d.rows.length} batches`}>
        <Table data={d.rows} searchPlaceholder="Search product…" columns={[
          { key: "product", header: "Product", sortable: true, render: (r) => <span className="font-medium text-gray-900">{r.product}</span> },
          { key: "warehouse", header: "Warehouse", sortable: true },
          numCol("currentPanels", "Current"), numCol("reservedPanels", "Reserved"),
          { key: "availablePanels", header: "Available", sortable: true, className: "text-right", render: (r) => <span className="font-semibold text-green-700">{r.availablePanels.toLocaleString()}</span> },
          moneyCol("availableValue", "Avail. Value", true),
        ]} emptyMessage="No stock" />
      </SectionCard>
    </>
  )
}

function POStatusView({ d }: { d: POStatus }) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(d.byStatus).map(([s, n]) => <StatCard key={s} title={s.replace(/_/g, " ")} value={n} icon={<ClipboardList size={20} />} color="blue" />)}
      </div>
      <SectionCard title="Purchase Order Status" subtitle={`${d.rows.length} POs`}>
        <Table data={d.rows} searchPlaceholder="Search PO, supplier…" columns={[
          { key: "poNumber", header: "PO #", sortable: true, render: (r) => <span className="font-medium text-blue-700">{r.poNumber}</span> },
          { key: "supplier", header: "Supplier", sortable: true },
          { key: "product", header: "Product", sortable: true },
          numCol("noOfPanels", "Ordered"), numCol("receivedPanels", "Received"),
          moneyCol("poAmountPkr", "PKR Value", true),
          { key: "status", header: "Status", render: (r) => <Badge status={r.status} /> },
        ]} emptyMessage="No purchase orders" />
      </SectionCard>
    </>
  )
}
