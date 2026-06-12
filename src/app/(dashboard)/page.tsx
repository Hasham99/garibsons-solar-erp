"use client"

import { useFetch } from "@/hooks/useFetch"
import { StatCard } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { DashboardSkeleton } from "@/components/ui/Skeleton"
import { formatCurrency, formatDate } from "@/lib/utils"
import {
  Package,
  PackageCheck,
  Wallet,
  Banknote,
  TrendingUp,
  ShoppingCart,
  Truck,
  ReceiptText,
  Lock,
  Landmark,
  AlertTriangle,
  CalendarClock,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Line,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts"

interface DashboardData {
  summary: {
    totalPanels: number
    availablePanels: number
    reservedPanels: number
    totalStockValue: number
    availableStockValue: number
    reservedStockValue: number
    todaySales: number
    todaySalesCount: number
    monthSales: number
    monthSalesCount: number
    totalReceivables: number
    monthCollections: number
    monthCollectionsCount: number
    todayCollections: number
    todayCollectionsCount: number
    monthExpenses: number
    monthExpensesCount: number
    totalGstInStock: number
    activePOs: number
    activePOPanels: number
    activePOValue: number
    openDeliveryOrders: number
    agingDeliveryOrders: number
  }
  monthlyTrend: Array<{ label: string; sales: number; collections: number }>
  poStatusBreakdown: Array<{ status: string; count: number; panels: number; value: number }>
  soStatusBreakdown: Array<{ status: string; count: number }>
  recentOrders: Array<{
    id: string
    soNumber: string
    customer: { name: string }
    grandTotal: number
    status: string
    createdAt: string
  }>
  recentReceipts: Array<{
    id: string
    receiptNo: string
    amount: number
    valueDate: string
    customer: { name: string }
    bank: { name: string }
  }>
  warehouseStock: Array<{ name: string; availablePanels: number; reservedPanels: number; value: number }>
  lowStock: Array<{ name: string; code: string; wattage: number; threshold: number; available: number }>
  topOutstanding: Array<{ customerId: string; name: string; outstanding: number }>
}

const EMPTY_SUMMARY: DashboardData["summary"] = {
  totalPanels: 0,
  availablePanels: 0,
  reservedPanels: 0,
  totalStockValue: 0,
  availableStockValue: 0,
  reservedStockValue: 0,
  todaySales: 0,
  todaySalesCount: 0,
  monthSales: 0,
  monthSalesCount: 0,
  totalReceivables: 0,
  monthCollections: 0,
  monthCollectionsCount: 0,
  todayCollections: 0,
  todayCollectionsCount: 0,
  monthExpenses: 0,
  monthExpensesCount: 0,
  totalGstInStock: 0,
  activePOs: 0,
  activePOPanels: 0,
  activePOValue: 0,
  openDeliveryOrders: 0,
  agingDeliveryOrders: 0,
}

const PO_STATUS_COLORS: Record<string, string> = {
  DRAFT: "#94a3b8",
  CONFIRMED: "#3b82f6",
  SHIPPED: "#6366f1",
  CLEARED: "#a855f7",
  RECEIVED: "#22c55e",
  CANCELLED: "#ef4444",
}

const SO_STATUS_COLORS: Record<string, string> = {
  DRAFT: "#94a3b8",
  PENDING_PAYMENT: "#f59e0b",
  PAYMENT_CONFIRMED: "#14b8a6",
  DO_ISSUED: "#3b82f6",
  DELIVERED: "#6366f1",
  INVOICED: "#22c55e",
}

/* Compact PKR for chart axes: Rs 12.4M / Rs 850K */
function fmtCompact(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return v.toFixed(0)
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return ((current - previous) / previous) * 100
}

function statusLabel(s: string) {
  return s.replace(/_/g, " ")
}

export default function DashboardPage() {
  const { data, loading } = useFetch<DashboardData>("/api/dashboard")

  if (loading) return <DashboardSkeleton />

  const summary = data?.summary || EMPTY_SUMMARY
  const trend = data?.monthlyTrend || []
  const prevMonth = trend.length >= 2 ? trend[trend.length - 2] : null
  const curMonth = trend.length >= 1 ? trend[trend.length - 1] : null
  const salesChange = prevMonth && curMonth ? pctChange(curMonth.sales, prevMonth.sales) : null
  const collectionsChange = prevMonth && curMonth ? pctChange(curMonth.collections, prevMonth.collections) : null

  const poBreakdown = (data?.poStatusBreakdown || []).filter((g) => g.count > 0)
  const soBreakdown = (data?.soStatusBreakdown || []).filter((g) => g.count > 0)
  const soTotal = soBreakdown.reduce((s, g) => s + g.count, 0)
  const maxOutstanding = Math.max(...(data?.topOutstanding || []).map((c) => c.outstanding), 1)

  const today = new Date().toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "long", year: "numeric" })

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Welcome back — here's how Garibsons Solar is doing.</p>
        </div>
        <p className="inline-flex items-center gap-2 text-sm text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
          <CalendarClock size={15} className="text-blue-500" />
          {today}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Sales This Month"
          value={formatCurrency(summary.monthSales)}
          subtitle={`${summary.monthSalesCount} orders · ${formatCurrency(summary.todaySales)} today`}
          trend={salesChange !== null ? { value: salesChange, label: "vs last month" } : undefined}
          icon={<TrendingUp size={20} />}
          color="indigo"
        />
        <StatCard
          title="Collections This Month"
          value={formatCurrency(summary.monthCollections)}
          subtitle={`${summary.monthCollectionsCount} receipts · ${formatCurrency(summary.todayCollections)} today`}
          trend={collectionsChange !== null ? { value: collectionsChange, label: "vs last month" } : undefined}
          icon={<Banknote size={20} />}
          color="emerald"
        />
        <StatCard
          title="Receivables Outstanding"
          value={formatCurrency(summary.totalReceivables)}
          subtitle="Total sales minus collections"
          icon={<Wallet size={20} />}
          color="rose"
        />
        <StatCard
          title="Expenses This Month"
          value={formatCurrency(summary.monthExpenses)}
          subtitle={`${summary.monthExpensesCount} entries recorded`}
          icon={<ReceiptText size={20} />}
          color="pink"
        />
        <StatCard
          title="Stock in Hand"
          value={`${summary.totalPanels.toLocaleString()} panels`}
          subtitle={formatCurrency(summary.totalStockValue)}
          icon={<Package size={20} />}
          color="blue"
        />
        <StatCard
          title="Available to Sell"
          value={`${summary.availablePanels.toLocaleString()} panels`}
          subtitle={formatCurrency(summary.availableStockValue)}
          icon={<PackageCheck size={20} />}
          color="green"
        />
        <StatCard
          title="POs in Pipeline"
          value={summary.activePOs}
          subtitle={`${summary.activePOPanels.toLocaleString()} panels · ${formatCurrency(summary.activePOValue)}`}
          icon={<ShoppingCart size={20} />}
          color="violet"
        />
        <StatCard
          title="Open Delivery Orders"
          value={summary.openDeliveryOrders}
          subtitle={`${summary.agingDeliveryOrders} aging 2+ days`}
          icon={<Truck size={20} />}
          color="amber"
        />
      </div>

      {/* Secondary stat strip */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-lg bg-amber-50 text-amber-600"><Lock size={16} /></span>
          <div className="min-w-0">
            <p className="text-xs text-slate-500">Reserved Stock</p>
            <p className="text-sm font-semibold text-slate-900 tabular-nums">
              {summary.reservedPanels.toLocaleString()} panels · {formatCurrency(summary.reservedStockValue)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-4 sm:pt-0 sm:pl-4">
          <span className="p-2 rounded-lg bg-purple-50 text-purple-600"><Landmark size={16} /></span>
          <div className="min-w-0">
            <p className="text-xs text-slate-500">Import GST Locked in Stock</p>
            <p className="text-sm font-semibold text-slate-900 tabular-nums">{formatCurrency(summary.totalGstInStock)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-4 sm:pt-0 sm:pl-4">
          <span className="p-2 rounded-lg bg-blue-50 text-blue-600"><CalendarClock size={16} /></span>
          <div className="min-w-0">
            <p className="text-xs text-slate-500">Today's Activity</p>
            <p className="text-sm font-semibold text-slate-900 tabular-nums">
              {summary.todaySalesCount} sales · {summary.todayCollectionsCount} receipts
            </p>
          </div>
        </div>
      </div>

      {/* Trend + PO pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="mb-4">
            <h3 className="font-semibold text-slate-900">Sales vs Collections</h3>
            <p className="text-xs text-slate-500 mt-0.5">Last 6 months</p>
          </div>
          {trend.some((m) => m.sales > 0 || m.collections > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={trend} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={52} />
                <Tooltip
                  formatter={(value, name) => [formatCurrency(Number(value)), name === "sales" ? "Sales" : "Collections"]}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.06)", fontSize: 13 }}
                />
                <Legend
                  formatter={(value) => (value === "sales" ? "Sales" : "Collections")}
                  wrapperStyle={{ fontSize: 13 }}
                />
                <Bar dataKey="sales" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Line type="monotone" dataKey="collections" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: "#10b981" }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-slate-400 text-sm">No sales or collection activity yet</div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="mb-4">
            <h3 className="font-semibold text-slate-900">Purchase Pipeline</h3>
            <p className="text-xs text-slate-500 mt-0.5">All purchase orders by status</p>
          </div>
          {poBreakdown.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={poBreakdown}
                    dataKey="count"
                    nameKey="status"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {poBreakdown.map((g) => (
                      <Cell key={g.status} fill={PO_STATUS_COLORS[g.status] || "#94a3b8"} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, _name, item) => {
                      const payload = item?.payload as DashboardData["poStatusBreakdown"][number] | undefined
                      return [`${value} POs · ${(payload?.panels ?? 0).toLocaleString()} panels`, statusLabel(String(payload?.status ?? ""))]
                    }}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.06)", fontSize: 13 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1.5">
                {poBreakdown.map((g) => (
                  <div key={g.status} className="flex items-center justify-between text-[13px]">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PO_STATUS_COLORS[g.status] || "#94a3b8" }} />
                      {statusLabel(g.status)}
                    </span>
                    <span className="font-medium text-slate-900 tabular-nums">{g.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-slate-400 text-sm">No purchase orders yet</div>
          )}
        </div>
      </div>

      {/* Sales order pipeline — segmented bar */}
      {soTotal > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900">Sales Order Pipeline</h3>
            <span className="text-xs text-slate-500">{soTotal} active orders</span>
          </div>
          <div className="flex h-3 w-full rounded-full overflow-hidden bg-slate-100">
            {soBreakdown.map((g) => (
              <div
                key={g.status}
                title={`${statusLabel(g.status)}: ${g.count}`}
                style={{ width: `${(g.count / soTotal) * 100}%`, backgroundColor: SO_STATUS_COLORS[g.status] || "#94a3b8" }}
                className="transition-all duration-500"
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {soBreakdown.map((g) => (
              <span key={g.status} className="inline-flex items-center gap-1.5 text-[13px] text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SO_STATUS_COLORS[g.status] || "#94a3b8" }} />
                {statusLabel(g.status)} <span className="font-semibold text-slate-900 tabular-nums">{g.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Warehouse stock + top outstanding */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="mb-4">
            <h3 className="font-semibold text-slate-900">Stock by Warehouse</h3>
            <p className="text-xs text-slate-500 mt-0.5">Available vs reserved panels</p>
          </div>
          {data?.warehouseStock && data.warehouseStock.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.warehouseStock} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={44} />
                <Tooltip
                  formatter={(value, name) => [Number(value).toLocaleString() + " panels", name === "availablePanels" ? "Available" : "Reserved"]}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.06)", fontSize: 13 }}
                />
                <Legend formatter={(value) => (value === "availablePanels" ? "Available" : "Reserved")} wrapperStyle={{ fontSize: 13 }} />
                <Bar dataKey="availablePanels" stackId="stock" fill="#3b82f6" radius={[0, 0, 0, 0]} maxBarSize={48} />
                <Bar dataKey="reservedPanels" stackId="stock" fill="#fbbf24" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-slate-400 text-sm">No stock data available</div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="mb-4">
            <h3 className="font-semibold text-slate-900">Top Outstanding Customers</h3>
            <p className="text-xs text-slate-500 mt-0.5">Highest receivable balances</p>
          </div>
          {data?.topOutstanding && data.topOutstanding.length > 0 ? (
            <div className="space-y-3.5">
              {data.topOutstanding.map((c) => (
                <div key={c.customerId}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-[13px] font-medium text-slate-700 truncate" title={c.name}>{c.name}</p>
                    <p className="text-[13px] font-semibold text-slate-900 tabular-nums shrink-0">{formatCurrency(c.outstanding)}</p>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-500 transition-all duration-500"
                      style={{ width: `${Math.max((c.outstanding / maxOutstanding) * 100, 4)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-slate-400 text-sm text-center px-4">
              No outstanding balances — all caught up 🎉
            </div>
          )}
        </div>
      </div>

      {/* Recent activity + low stock */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Sales Orders */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">Recent Sales Orders</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {data?.recentOrders && data.recentOrders.length > 0 ? (
              data.recentOrders.slice(0, 6).map((order) => (
                <div key={order.id} className="px-6 py-3 flex items-center justify-between gap-2 hover:bg-slate-50/70 transition-colors">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-slate-900">{order.soNumber}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {order.customer.name} &middot; {formatDate(order.createdAt)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-slate-900 tabular-nums">{formatCurrency(order.grandTotal)}</p>
                    <Badge status={order.status} />
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-12 text-center text-slate-400 text-sm">No sales orders yet</div>
            )}
          </div>
        </div>

        {/* Recent Collections */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">Recent Collections</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {data?.recentReceipts && data.recentReceipts.length > 0 ? (
              data.recentReceipts.slice(0, 6).map((r) => (
                <div key={r.id} className="px-6 py-3 flex items-center justify-between gap-2 hover:bg-slate-50/70 transition-colors">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-slate-900">{r.customer.name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {r.receiptNo} &middot; {r.bank.name} &middot; {formatDate(r.valueDate)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-emerald-600 tabular-nums shrink-0">
                    +{formatCurrency(r.amount)}
                  </p>
                </div>
              ))
            ) : (
              <div className="px-6 py-12 text-center text-slate-400 text-sm">No collections recorded yet</div>
            )}
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            <h3 className="font-semibold text-slate-900">Low Stock Alerts</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {data?.lowStock && data.lowStock.length > 0 ? (
              data.lowStock.map((p) => (
                <div key={p.code} className="px-6 py-3 flex items-center justify-between gap-2 hover:bg-slate-50/70 transition-colors">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-slate-900 truncate" title={p.name}>{p.name}</p>
                    <p className="text-xs text-slate-500">{p.code} &middot; {p.wattage}W &middot; threshold {p.threshold}</p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-semibold rounded-full px-2.5 py-1 tabular-nums ${
                      p.available === 0 ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {p.available.toLocaleString()} left
                  </span>
                </div>
              ))
            ) : (
              <div className="px-6 py-12 text-center text-slate-400 text-sm">All products are above their stock thresholds</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
