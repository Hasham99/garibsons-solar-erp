"use client"

import { useMemo } from "react"
import Link from "next/link"
import { Boxes, FileDown, PackageCheck, Truck, Clock, Wallet, ArrowRight, AlertTriangle } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { Table, type Column } from "@/components/ui/Table"
import { Button } from "@/components/ui/Button"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { useFetch } from "@/hooks/useFetch"
import { downloadPdf } from "@/lib/pdf"
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils"

// ── Shapes from existing read-only endpoints (no new APIs) ──
interface StockRow {
  productId: string
  item: string
  panelsPerContainer: number | null
  receivedLocal: number
  receivedImport: number
  so: number
  doIssued: number
  lifted: number
  unlifted: number
  balanceSO: number
  availableForSale: number
}
interface StockResp { rows: StockRow[]; totals: Record<string, number>; asOf: string }

interface SoLine { quantity: number; product?: { panelsPerContainer?: number | null } }
interface SalesOrder { id: string; status: string; grandTotal: number; lines: SoLine[] }

const toCtr = (panels: number, ppc?: number | null) => (ppc && ppc > 0 ? panels / ppc : 0)
const ctr = (n: number) => `${formatNumber(n, 1)}`

/** A pipeline KPI tile — calm, theme-aware, mobile-first. */
function PipelineStat({
  label, containers, panels, tone = "default", icon, hint,
}: {
  label: string; containers: number; panels: number
  tone?: "default" | "good" | "warn" | "danger"; icon?: React.ReactNode; hint?: string
}) {
  const negative = containers < 0
  const toneText =
    negative || tone === "danger" ? "text-rose-600 dark:text-rose-400"
    : tone === "good" ? "text-emerald-600 dark:text-emerald-400"
    : tone === "warn" ? "text-amber-600 dark:text-amber-400"
    : "text-foreground"
  return (
    <div className="rounded-xl border border-line bg-elevated p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-secondary leading-tight">{label}</p>
        {icon && <span className="shrink-0 text-tertiary">{icon}</span>}
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums leading-none ${toneText}`}>
        {negative && <AlertTriangle size={16} className="inline mb-1 mr-1" />}{ctr(containers)}
        <span className="ml-1 text-[11px] font-medium text-tertiary">ctr</span>
      </p>
      <p className="mt-1 text-[11px] text-tertiary tabular-nums">{formatNumber(panels, 0)} panels</p>
      {hint && <p className="mt-0.5 text-[11px] text-tertiary">{hint}</p>}
    </div>
  )
}

export default function ContainerPipelinePage() {
  const stock = useFetch<StockResp>("/api/reports/stock-position")
  const sos = useFetch<SalesOrder[]>("/api/sales-orders")
  const loading = stock.loading || sos.loading

  // ── §2.1 pipeline summary (container-converted from per-product rows) ──
  const summary = useMemo(() => {
    const rows = stock.data?.rows ?? []
    const sum = (pick: (r: StockRow) => number) =>
      rows.reduce((t, r) => t + toCtr(pick(r), r.panelsPerContainer), 0)
    const sumP = (pick: (r: StockRow) => number) => rows.reduce((t, r) => t + pick(r), 0)
    // "Payment pending" = deals agreed but payment not confirmed → SO status PENDING_PAYMENT
    const pendingPay = (sos.data ?? []).filter((o) => o.status === "PENDING_PAYMENT")
    const payPendingCtr = pendingPay.reduce(
      (t, o) => t + o.lines.reduce((s, l) => s + toCtr(l.quantity, l.product?.panelsPerContainer), 0), 0)
    const payPendingPanels = pendingPay.reduce((t, o) => t + o.lines.reduce((s, l) => s + l.quantity, 0), 0)
    return {
      receivedImport: { c: sum((r) => r.receivedImport), p: sumP((r) => r.receivedImport) },
      receivedLocal: { c: sum((r) => r.receivedLocal), p: sumP((r) => r.receivedLocal) },
      soldDO: { c: sum((r) => r.doIssued), p: sumP((r) => r.doIssued) },
      pendingDeals: { c: sum((r) => r.balanceSO), p: sumP((r) => r.balanceSO) },
      available: { c: sum((r) => r.availableForSale), p: sumP((r) => r.availableForSale) },
      lifted: { c: sum((r) => r.lifted), p: sumP((r) => r.lifted) },
      pendingLifting: { c: sum((r) => r.unlifted), p: sumP((r) => r.unlifted) },
      paymentPending: { c: payPendingCtr, p: payPendingPanels },
    }
  }, [stock.data, sos.data])

  // ── §4 sales pipeline stages (count + Rs by SO status) ──
  const stages = useMemo(() => {
    const orders = sos.data ?? []
    const STAGES: { key: string; label: string }[] = [
      { key: "PENDING_PAYMENT", label: "Payment Pending" },
      { key: "PAYMENT_CONFIRMED", label: "Payment Received" },
      { key: "DO_ISSUED", label: "DO Issued" },
      { key: "DELIVERED", label: "Lifted / Delivered" },
      { key: "INVOICED", label: "Invoiced" },
    ]
    return STAGES.map((s) => {
      const matched = orders.filter((o) => o.status === s.key)
      return { ...s, count: matched.length, value: matched.reduce((t, o) => t + (o.grandTotal || 0), 0) }
    })
  }, [sos.data])

  const exportStock = () => {
    const rows = stock.data?.rows ?? []
    if (rows.length === 0) return
    downloadPdf({
      title: "Container Pipeline — Stock Position by Product",
      metaLines: [`As of ${formatDate(stock.data?.asOf ?? new Date())}`, "Units: containers (panels in brackets)"],
      kpis: [
        { label: "Available for Sale", value: `${ctr(summary.available.c)} ctr` },
        { label: "Pending Lifting", value: `${ctr(summary.pendingLifting.c)} ctr` },
        { label: "Pending Deals", value: `${ctr(summary.pendingDeals.c)} ctr` },
      ],
      columns: [
        { header: "Item", align: "left" },
        { header: "Recd Local", align: "right" }, { header: "Recd Import", align: "right" },
        { header: "DO Issued", align: "right" }, { header: "Deals", align: "right" },
        { header: "Available", align: "right" },
      ],
      rows: rows.map((r) => [
        r.item,
        `${ctr(toCtr(r.receivedLocal, r.panelsPerContainer))} (${formatNumber(r.receivedLocal, 0)})`,
        `${ctr(toCtr(r.receivedImport, r.panelsPerContainer))} (${formatNumber(r.receivedImport, 0)})`,
        `${ctr(toCtr(r.doIssued, r.panelsPerContainer))} (${formatNumber(r.doIssued, 0)})`,
        `${ctr(toCtr(r.balanceSO, r.panelsPerContainer))} (${formatNumber(r.balanceSO, 0)})`,
        `${ctr(toCtr(r.availableForSale, r.panelsPerContainer))} (${formatNumber(r.availableForSale, 0)})`,
      ]),
      fileName: `container-pipeline-${new Date().toISOString().slice(0, 10)}`,
      orientation: "landscape",
    })
  }

  const stockColumns: Column<StockRow>[] = [
    { key: "item", header: "Item", sortable: true, value: (r) => r.item },
    { key: "receivedLocal", header: "Recd Local", numeric: true, sortable: true, value: (r) => toCtr(r.receivedLocal, r.panelsPerContainer), render: (r) => ctr(toCtr(r.receivedLocal, r.panelsPerContainer)) },
    { key: "receivedImport", header: "Recd Import", numeric: true, sortable: true, value: (r) => toCtr(r.receivedImport, r.panelsPerContainer), render: (r) => ctr(toCtr(r.receivedImport, r.panelsPerContainer)) },
    { key: "doIssued", header: "Sales (DO)", numeric: true, sortable: true, value: (r) => toCtr(r.doIssued, r.panelsPerContainer), render: (r) => ctr(toCtr(r.doIssued, r.panelsPerContainer)) },
    { key: "balanceSO", header: "Deals", numeric: true, sortable: true, value: (r) => toCtr(r.balanceSO, r.panelsPerContainer), render: (r) => ctr(toCtr(r.balanceSO, r.panelsPerContainer)) },
    {
      key: "availableForSale", header: "Available", numeric: true, sortable: true,
      value: (r) => toCtr(r.availableForSale, r.panelsPerContainer),
      render: (r) => {
        const c = toCtr(r.availableForSale, r.panelsPerContainer)
        return <span className={c < 0 ? "font-semibold text-rose-600 dark:text-rose-400" : ""}>{c < 0 && "⚠ "}{ctr(c)}</span>
      },
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in-up">
      <Header
        title="Container Pipeline"
        actions={
          <Button variant="secondary" size="sm" onClick={exportStock} disabled={loading || !stock.data?.rows.length}>
            <FileDown size={14} className="mr-1.5" />PDF
          </Button>
        }
      />

      {loading ? (
        <TableSkeleton columns={6} rows={8} />
      ) : (
        <>
          {/* §2.1 — where every container is right now */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <PipelineStat label="Received — Import" containers={summary.receivedImport.c} panels={summary.receivedImport.p} icon={<Boxes size={16} />} />
            <PipelineStat label="Received — Local" containers={summary.receivedLocal.c} panels={summary.receivedLocal.p} icon={<Boxes size={16} />} />
            <PipelineStat label="Sold (DO issued)" containers={summary.soldDO.c} panels={summary.soldDO.p} icon={<PackageCheck size={16} />} />
            <PipelineStat label="Available for Sale" containers={summary.available.c} panels={summary.available.p} tone="good" icon={<Boxes size={16} />} hint="received − sold − deals" />
            <PipelineStat label="Pending Deals" containers={summary.pendingDeals.c} panels={summary.pendingDeals.p} tone="warn" icon={<Wallet size={16} />} hint="agreed, not yet on DO" />
            <PipelineStat label="Payment Pending" containers={summary.paymentPending.c} panels={summary.paymentPending.p} tone="warn" icon={<Wallet size={16} />} hint="deal made, payment incomplete" />
            <PipelineStat label="Pending Lifting" containers={summary.pendingLifting.c} panels={summary.pendingLifting.p} tone="warn" icon={<Clock size={16} />} hint="DO issued, not collected" />
            <PipelineStat label="Lifted / Dispatched" containers={summary.lifted.c} panels={summary.lifted.p} tone="good" icon={<Truck size={16} />} />
          </div>

          {/* §4 — sales pipeline stages */}
          <div className="rounded-xl border border-line bg-elevated shadow-card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Sales Pipeline</h2>
              <Link href="/sales" className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">View orders</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-line">
              {stages.map((s, i) => (
                <div key={s.key} className="p-4">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-tertiary">
                    <span>{i + 1}.</span>{s.label}
                    {i < stages.length - 1 && <ArrowRight size={11} className="ml-auto hidden lg:block text-tertiary/60" />}
                  </div>
                  <p className="mt-1.5 text-xl font-bold tabular-nums text-foreground">{s.count}<span className="ml-1 text-[11px] font-medium text-tertiary">orders</span></p>
                  <p className="mt-0.5 text-[12px] tabular-nums text-secondary">{formatCurrency(s.value)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* §2.2 — stock position by product (containers; negative available flagged) */}
          <div className="rounded-xl border border-line bg-elevated shadow-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Stock Position by Product</h2>
                <p className="text-[11px] text-tertiary mt-0.5">In containers · negative “Available” means oversold</p>
              </div>
              <Button variant="secondary" size="sm" onClick={exportStock}><FileDown size={14} className="mr-1.5" />PDF</Button>
            </div>
            <Table
              columns={stockColumns}
              data={stock.data?.rows ?? []}
              keyField="productId"
              searchable
              searchPlaceholder="Search product…"
              defaultSortKey="availableForSale"
              defaultSortDir="asc"
              emptyMessage="No stock movements yet"
            />
          </div>
        </>
      )}
    </div>
  )
}
