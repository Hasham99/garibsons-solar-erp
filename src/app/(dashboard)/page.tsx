"use client"

import { useFetch } from "@/hooks/useFetch"
import { useAuth } from "@/hooks/useAuth"
import { useChartTheme } from "@/hooks/useChartTheme"
import { motion } from "motion/react"
import { Stagger, StaggerItem } from "@/components/motion/Motion"
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

/* Status-tinted rows for the recent orders list — left stripe + soft wash */
const SO_ROW_TINTS: Record<string, string> = {
  DRAFT: "border-line-strong bg-muted hover:bg-muted",
  PENDING_PAYMENT: "border-amber-400 bg-amber-50/60 dark:bg-amber-500/10 hover:bg-amber-50 dark:hover:bg-amber-500/10",
  PAYMENT_CONFIRMED: "border-teal-400 bg-teal-50/50 dark:bg-teal-500/10 hover:bg-teal-50/80 dark:hover:bg-teal-500/10",
  DO_ISSUED: "border-blue-400 bg-blue-50/50 dark:bg-blue-500/10 hover:bg-blue-50/80 dark:hover:bg-blue-500/10",
  DELIVERED: "border-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/10 hover:bg-indigo-50/80 dark:hover:bg-indigo-500/10",
  INVOICED: "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-500/10 hover:bg-emerald-50/80 dark:hover:bg-emerald-500/10",
  CANCELLED: "border-rose-400 bg-rose-50/50 dark:bg-rose-500/10 hover:bg-rose-50/80 dark:hover:bg-rose-500/10",
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
  const { user } = useAuth()
  const chart = useChartTheme()

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

  // Greeting and date anchored to Pakistan time (PKT, UTC+5) regardless of the viewer's device timezone
  const today = new Date().toLocaleDateString("en-PK", {
    timeZone: "Asia/Karachi",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  const pktHour =
    Number(
      new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", hour: "numeric", hour12: false }).format(new Date())
    ) % 24
  const greeting = pktHour < 12 ? "Good morning" : pktHour < 17 ? "Good afternoon" : "Good evening"
  const firstName = user?.name?.split(" ")[0]

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Hero header — deep navy gradient with soft solar glows.
          Inline style (not a Tailwind v4 gradient util) so it never falls back
          to white on browsers without CSS @property support. */}
      <div
        className="relative overflow-hidden rounded-2xl px-6 py-7 sm:px-8 text-white shadow-pop"
        style={{ backgroundColor: "#142447", backgroundImage: "linear-gradient(135deg, #0e1526 0%, #142447 50%, #1e3a8a 100%)" }}
      >
        <div className="pointer-events-none absolute -top-24 -right-12 h-64 w-64 rounded-full bg-blue-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/4 h-72 w-72 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="inline-flex items-center gap-2 text-[13px] font-medium text-blue-200/90">
              <CalendarClock size={14} />
              {today}
            </p>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight">
              {greeting}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-1.5 text-[15px] text-slate-300/90">Here&rsquo;s how Garibsons Solar is doing.</p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-[13px] font-medium ring-1 ring-inset ring-white/15 backdrop-blur-sm">
              <TrendingUp size={14} className="text-emerald-300" />
              {formatCurrency(summary.todaySales)} sales today
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-[13px] font-medium ring-1 ring-inset ring-white/15 backdrop-blur-sm">
              <Banknote size={14} className="text-amber-300" />
              {formatCurrency(summary.todayCollections)} collected
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-[13px] font-medium ring-1 ring-inset ring-white/15 backdrop-blur-sm">
              <Truck size={14} className="text-sky-300" />
              {summary.openDeliveryOrders} open DOs
            </span>
          </div>
        </div>
      </div>

      {/* KPI cards — cascade in one after another */}
      <Stagger className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StaggerItem className="h-full">
          <StatCard
            title="Sales This Month"
            value={formatCurrency(summary.monthSales)}
            subtitle={`${summary.monthSalesCount} orders · ${formatCurrency(summary.todaySales)} today`}
            trend={salesChange !== null ? { value: salesChange, label: "vs last month" } : undefined}
            spark={trend.map((m) => m.sales)}
            icon={<TrendingUp size={20} />}
            color="indigo"
          />
        </StaggerItem>
        <StaggerItem className="h-full">
          <StatCard
            title="Collections This Month"
            value={formatCurrency(summary.monthCollections)}
            subtitle={`${summary.monthCollectionsCount} receipts · ${formatCurrency(summary.todayCollections)} today`}
            trend={collectionsChange !== null ? { value: collectionsChange, label: "vs last month" } : undefined}
            spark={trend.map((m) => m.collections)}
            icon={<Banknote size={20} />}
            color="emerald"
          />
        </StaggerItem>
        <StaggerItem className="h-full">
          <StatCard
            title="Receivables Outstanding"
            value={formatCurrency(summary.totalReceivables)}
            subtitle="Total sales minus collections"
            icon={<Wallet size={20} />}
            color="rose"
          />
        </StaggerItem>
        <StaggerItem className="h-full">
          <StatCard
            title="Expenses This Month"
            value={formatCurrency(summary.monthExpenses)}
            subtitle={`${summary.monthExpensesCount} entries recorded`}
            icon={<ReceiptText size={20} />}
            color="pink"
          />
        </StaggerItem>
        <StaggerItem className="h-full">
          <StatCard
            title="Stock in Hand"
            value={`${summary.totalPanels.toLocaleString()} panels`}
            subtitle={formatCurrency(summary.totalStockValue)}
            icon={<Package size={20} />}
            color="blue"
          />
        </StaggerItem>
        <StaggerItem className="h-full">
          <StatCard
            title="Available to Sell"
            value={`${summary.availablePanels.toLocaleString()} panels`}
            subtitle={formatCurrency(summary.availableStockValue)}
            icon={<PackageCheck size={20} />}
            color="green"
          />
        </StaggerItem>
        <StaggerItem className="h-full">
          <StatCard
            title="POs in Pipeline"
            value={summary.activePOs}
            subtitle={`${summary.activePOPanels.toLocaleString()} panels · ${formatCurrency(summary.activePOValue)}`}
            icon={<ShoppingCart size={20} />}
            color="violet"
          />
        </StaggerItem>
        <StaggerItem className="h-full">
          <StatCard
            title="Open Delivery Orders"
            value={summary.openDeliveryOrders}
            subtitle={`${summary.agingDeliveryOrders} aging 2+ days`}
            icon={<Truck size={20} />}
            color="amber"
          />
        </StaggerItem>
      </Stagger>

      {/* Secondary stat strip */}
      <div className="bg-surface rounded-xl shadow-card border border-line px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-line">
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300"><Lock size={16} /></span>
          <div className="min-w-0">
            <p className="text-xs text-secondary">Reserved Stock</p>
            <p className="text-sm font-semibold text-foreground tabular-nums">
              {summary.reservedPanels.toLocaleString()} panels · {formatCurrency(summary.reservedStockValue)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-4 sm:pt-0 sm:pl-4">
          <span className="p-2 rounded-lg bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-300"><Landmark size={16} /></span>
          <div className="min-w-0">
            <p className="text-xs text-secondary">Import GST Locked in Stock</p>
            <p className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(summary.totalGstInStock)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-4 sm:pt-0 sm:pl-4">
          <span className="p-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300"><CalendarClock size={16} /></span>
          <div className="min-w-0">
            <p className="text-xs text-secondary">Today&rsquo;s Activity</p>
            <p className="text-sm font-semibold text-foreground tabular-nums">
              {summary.todaySalesCount} sales · {summary.todayCollectionsCount} receipts
            </p>
          </div>
        </div>
      </div>

      {/* Trend + PO pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-surface rounded-xl shadow-card border border-line p-6">
          <div className="mb-4">
            <h3 className="font-semibold text-foreground">Sales vs Collections</h3>
            <p className="text-xs text-secondary mt-0.5">Last 6 months</p>
          </div>
          {trend.some((m) => m.sales > 0 || m.collections > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={trend} margin={{ left: 8, right: 8 }}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity={0.65} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: chart.axis }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: chart.axis }} axisLine={false} tickLine={false} width={52} />
                <Tooltip
                  formatter={(value, name) => [formatCurrency(Number(value)), name === "sales" ? "Sales" : "Collections"]}
                  contentStyle={chart.tooltipStyle}
                  cursor={{ fill: "rgba(99,102,241,0.05)" }}
                />
                <Legend
                  formatter={(value) => (value === "sales" ? "Sales" : "Collections")}
                  wrapperStyle={{ fontSize: 13 }}
                />
                <Bar dataKey="sales" fill="url(#salesGradient)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Line type="monotone" dataKey="collections" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: "#10b981" }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-tertiary text-sm">No sales or collection activity yet</div>
          )}
        </div>

        <div className="bg-surface rounded-xl shadow-card border border-line p-6">
          <div className="mb-4">
            <h3 className="font-semibold text-foreground">Purchase Pipeline</h3>
            <p className="text-xs text-secondary mt-0.5">All purchase orders by status</p>
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
                    contentStyle={chart.tooltipStyle}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1.5">
                {poBreakdown.map((g) => (
                  <div key={g.status} className="flex items-center justify-between text-[13px]">
                    <span className="flex items-center gap-2 text-secondary">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PO_STATUS_COLORS[g.status] || "#94a3b8" }} />
                      {statusLabel(g.status)}
                    </span>
                    <span className="font-medium text-foreground tabular-nums">{g.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-tertiary text-sm">No purchase orders yet</div>
          )}
        </div>
      </div>

      {/* Sales order pipeline — segmented bar */}
      {soTotal > 0 && (
        <div className="bg-surface rounded-xl shadow-card border border-line p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground">Sales Order Pipeline</h3>
            <span className="text-xs text-secondary">{soTotal} active orders</span>
          </div>
          <div className="flex h-3 w-full rounded-full overflow-hidden bg-muted">
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
              <span key={g.status} className="inline-flex items-center gap-1.5 text-[13px] text-secondary">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SO_STATUS_COLORS[g.status] || "#94a3b8" }} />
                {statusLabel(g.status)} <span className="font-semibold text-foreground tabular-nums">{g.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Warehouse stock + top outstanding */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-surface rounded-xl shadow-card border border-line p-6">
          <div className="mb-4">
            <h3 className="font-semibold text-foreground">Stock by Warehouse</h3>
            <p className="text-xs text-secondary mt-0.5">Available vs reserved panels</p>
          </div>
          {data?.warehouseStock && data.warehouseStock.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.warehouseStock} margin={{ left: 8, right: 8 }}>
                <defs>
                  <linearGradient id="availableGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.7} />
                  </linearGradient>
                  <linearGradient id="reservedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: chart.axis }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: chart.axis }} axisLine={false} tickLine={false} width={44} />
                <Tooltip
                  formatter={(value, name) => [Number(value).toLocaleString() + " panels", name === "availablePanels" ? "Available" : "Reserved"]}
                  contentStyle={chart.tooltipStyle}
                  cursor={{ fill: "rgba(59,130,246,0.05)" }}
                />
                <Legend formatter={(value) => (value === "availablePanels" ? "Available" : "Reserved")} wrapperStyle={{ fontSize: 13 }} />
                <Bar dataKey="availablePanels" stackId="stock" fill="url(#availableGradient)" radius={[0, 0, 0, 0]} maxBarSize={48} />
                <Bar dataKey="reservedPanels" stackId="stock" fill="url(#reservedGradient)" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-tertiary text-sm">No stock data available</div>
          )}
        </div>

        <div className="bg-surface rounded-xl shadow-card border border-line p-6">
          <div className="mb-4">
            <h3 className="font-semibold text-foreground">Top Outstanding Customers</h3>
            <p className="text-xs text-secondary mt-0.5">Highest receivable balances</p>
          </div>
          {data?.topOutstanding && data.topOutstanding.length > 0 ? (
            <div className="space-y-3.5">
              {data.topOutstanding.map((c) => (
                <div key={c.customerId}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-[13px] font-medium text-secondary truncate" title={c.name}>{c.name}</p>
                    <p className="text-[13px] font-semibold text-foreground tabular-nums shrink-0">{formatCurrency(c.outstanding)}</p>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max((c.outstanding / maxOutstanding) * 100, 4)}%` }}
                      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-tertiary text-sm text-center px-4">
              No outstanding balances — all caught up 🎉
            </div>
          )}
        </div>
      </div>

      {/* Recent activity + low stock */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Sales Orders */}
        <div className="bg-surface rounded-xl shadow-card border border-line">
          <div className="px-6 py-4 border-b border-line">
            <h3 className="font-semibold text-foreground">Recent Sales Orders</h3>
          </div>
          <div className="divide-y divide-line">
            {data?.recentOrders && data.recentOrders.length > 0 ? (
              data.recentOrders.slice(0, 6).map((order) => (
                <div
                  key={order.id}
                  className={`px-5 py-3 border-l-4 transition-colors ${SO_ROW_TINTS[order.status] || "border-line hover:bg-muted"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* left column wraps freely; right column stays fixed and right-aligned */}
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground">{order.soNumber}</p>
                      <p className="mt-0.5 text-xs text-secondary">
                        {order.customer.name} &middot; {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <p className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(order.grandTotal)}</p>
                      <Badge status={order.status} />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-12 text-center text-tertiary text-sm">No sales orders yet</div>
            )}
          </div>
        </div>

        {/* Recent Collections */}
        <div className="bg-surface rounded-xl shadow-card border border-line">
          <div className="px-6 py-4 border-b border-line">
            <h3 className="font-semibold text-foreground">Recent Collections</h3>
          </div>
          <div className="divide-y divide-line">
            {data?.recentReceipts && data.recentReceipts.length > 0 ? (
              data.recentReceipts.slice(0, 6).map((r) => (
                <div key={r.id} className="px-6 py-3 hover:bg-muted transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-sm text-foreground">{r.customer.name}</p>
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-300 tabular-nums shrink-0">
                      +{formatCurrency(r.amount)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-secondary">
                    {r.receiptNo} &middot; {r.bank.name} &middot; {formatDate(r.valueDate)}
                  </p>
                </div>
              ))
            ) : (
              <div className="px-6 py-12 text-center text-tertiary text-sm">No collections recorded yet</div>
            )}
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-surface rounded-xl shadow-card border border-line">
          <div className="px-6 py-4 border-b border-line flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500 dark:text-amber-400" />
            <h3 className="font-semibold text-foreground">Low Stock Alerts</h3>
          </div>
          <div className="divide-y divide-line">
            {data?.lowStock && data.lowStock.length > 0 ? (
              data.lowStock.map((p) => (
                <div key={p.code} className="px-6 py-3 flex items-start justify-between gap-2 hover:bg-muted transition-colors">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground">{p.name}</p>
                    <p className="text-xs text-secondary">{p.code} &middot; {p.wattage}W &middot; threshold {p.threshold}</p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-semibold rounded-full px-2.5 py-1 tabular-nums ${
                      p.available === 0 ? "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300" : "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {p.available.toLocaleString()} left
                  </span>
                </div>
              ))
            ) : (
              <div className="px-6 py-12 text-center text-tertiary text-sm">All products are above their stock thresholds</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
