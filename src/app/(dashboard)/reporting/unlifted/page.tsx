"use client"

import { useMemo } from "react"
import { FileDown, AlertTriangle } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { Table, type Column } from "@/components/ui/Table"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { useFetch } from "@/hooks/useFetch"
import { downloadPdf } from "@/lib/pdf"
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils"

const AGING_FLAG_DAYS = 3

// ── Shape from /api/delivery-orders (existing read-only endpoint) ──
interface DoLine { soLineId: string | null; quantity: number; product: { name: string; panelsPerContainer: number | null } }
interface SoLine { id: string; quantity: number; totalAmount: number }
interface DeliveryOrder {
  id: string
  doNumber: string
  createdAt: string
  status: string
  agingDays: number
  balanceQuantity: number
  liftedQuantity: number
  lines: DoLine[]
  salesOrder: { status: string; customer: { name: string } | null; lines: SoLine[] }
}

interface UnliftedRow {
  id: string
  doNumber: string
  customer: string
  product: string
  containers: number
  panels: number
  value: number
  doDate: string
  agingDays: number
  payment: string
}

const toCtr = (panels: number, ppc?: number | null) => (ppc && ppc > 0 ? panels / ppc : 0)

/** Map the sales-order status to a coarse payment state for the DO. */
function paymentStatus(soStatus: string): string {
  if (soStatus === "PENDING_PAYMENT") return "PENDING"
  if (soStatus === "PARTIAL" || soStatus === "PARTIALLY_PAID") return "PARTIAL"
  return "PAID"
}

export default function UnliftedDosPage() {
  const dos = useFetch<DeliveryOrder[]>("/api/delivery-orders")

  const rows = useMemo<UnliftedRow[]>(() => {
    const all = dos.data ?? []
    // Unlifted = panels still reserved (not physically dispatched) on a live DO.
    return all
      .filter((d) => d.status !== "CANCELLED" && d.balanceQuantity > 0)
      .map((d) => {
        // Per-DO sale value: Σ (DO line qty × matching SO-line unit price)
        const soLineById = new Map((d.salesOrder?.lines ?? []).map((l) => [l.id, l]))
        const value = d.lines.reduce((t, l) => {
          const so = l.soLineId ? soLineById.get(l.soLineId) : undefined
          const unit = so && so.quantity > 0 ? so.totalAmount / so.quantity : 0
          return t + l.quantity * unit
        }, 0)
        const panels = d.balanceQuantity
        const containers = d.lines.reduce((t, l) => t + toCtr(l.quantity, l.product.panelsPerContainer), 0)
        const names = [...new Set(d.lines.map((l) => l.product.name))]
        return {
          id: d.id,
          doNumber: d.doNumber,
          customer: d.salesOrder?.customer?.name ?? "—",
          product: names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0] ?? "—",
          containers,
          panels,
          value,
          doDate: d.createdAt,
          agingDays: d.agingDays,
          payment: paymentStatus(d.salesOrder?.status ?? ""),
        }
      })
  }, [dos.data])

  const totalValue = rows.reduce((t, r) => t + r.value, 0)
  const flagged = rows.filter((r) => r.agingDays > AGING_FLAG_DAYS).length

  const exportPdf = () => {
    if (rows.length === 0) return
    const sorted = [...rows].sort((a, b) => b.agingDays - a.agingDays)
    downloadPdf({
      title: "Unlifted Delivery Orders — Aging",
      metaLines: [`As of ${formatDate(new Date())}`, `Flagged (> ${AGING_FLAG_DAYS} days): ${flagged}`],
      kpis: [
        { label: "Unlifted DOs", value: String(rows.length) },
        { label: "Tied-up Value", value: formatCurrency(totalValue) },
        { label: `Aging > ${AGING_FLAG_DAYS}d`, value: String(flagged) },
      ],
      columns: [
        { header: "DO #", align: "left" }, { header: "Customer", align: "left" }, { header: "Product", align: "left" },
        { header: "Containers", align: "right" }, { header: "Panels", align: "right" }, { header: "Value", align: "right" },
        { header: "DO Date", align: "left" }, { header: "Days", align: "right" }, { header: "Payment", align: "left" },
      ],
      rows: sorted.map((r) => [
        r.doNumber, r.customer, r.product,
        formatNumber(r.containers, 1), formatNumber(r.panels, 0), formatCurrency(r.value),
        formatDate(r.doDate), r.agingDays, r.payment,
      ]),
      fileName: `unlifted-dos-${new Date().toISOString().slice(0, 10)}`,
      orientation: "landscape",
    })
  }

  const columns: Column<UnliftedRow>[] = [
    { key: "doNumber", header: "DO #", sortable: true, value: (r) => r.doNumber },
    { key: "customer", header: "Customer", sortable: true, value: (r) => r.customer },
    { key: "product", header: "Product", value: (r) => r.product },
    { key: "containers", header: "Containers", numeric: true, sortable: true, render: (r) => formatNumber(r.containers, 1) },
    { key: "panels", header: "Panels", numeric: true, sortable: true, render: (r) => formatNumber(r.panels, 0) },
    { key: "value", header: "Value", numeric: true, sortable: true, render: (r) => formatCurrency(r.value) },
    { key: "doDate", header: "DO Date", sortable: true, value: (r) => r.doDate, render: (r) => formatDate(r.doDate) },
    {
      key: "agingDays", header: "Days", numeric: true, sortable: true, value: (r) => r.agingDays,
      render: (r) => (
        <span className={r.agingDays > AGING_FLAG_DAYS ? "font-semibold text-rose-600 dark:text-rose-400" : ""}>
          {r.agingDays > AGING_FLAG_DAYS && <AlertTriangle size={12} className="inline mb-0.5 mr-1" />}{r.agingDays}d
        </span>
      ),
    },
    { key: "payment", header: "Payment", render: (r) => <Badge status={r.payment} /> },
  ]

  return (
    <div className="space-y-6 animate-fade-in-up">
      <Header
        title="Unlifted Delivery Orders"
        actions={
          <Button variant="secondary" size="sm" onClick={exportPdf} disabled={dos.loading || rows.length === 0}>
            <FileDown size={14} className="mr-1.5" />PDF
          </Button>
        }
      />

      {dos.loading ? (
        <TableSkeleton columns={9} rows={8} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-line bg-elevated p-4 shadow-card">
              <p className="text-[12px] font-medium text-secondary">Unlifted DOs</p>
              <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{rows.length}</p>
            </div>
            <div className="rounded-xl border border-line bg-elevated p-4 shadow-card">
              <p className="text-[12px] font-medium text-secondary">Tied-up Value</p>
              <p className="mt-1.5 text-lg sm:text-2xl font-bold tabular-nums text-foreground whitespace-nowrap">{formatCurrency(totalValue)}</p>
            </div>
            <div className="rounded-xl border border-line bg-elevated p-4 shadow-card">
              <p className="text-[12px] font-medium text-secondary">Aging &gt; {AGING_FLAG_DAYS}d</p>
              <p className={`mt-1.5 text-2xl font-bold tabular-nums ${flagged > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>{flagged}</p>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-elevated shadow-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Sitting in warehouse</h2>
                <p className="text-[11px] text-tertiary mt-0.5">DO issued but not yet collected · oldest first · ⚠ over {AGING_FLAG_DAYS} days</p>
              </div>
              <Button variant="secondary" size="sm" onClick={exportPdf}><FileDown size={14} className="mr-1.5" />PDF</Button>
            </div>
            <Table
              columns={columns}
              data={rows}
              keyField="id"
              searchable
              searchPlaceholder="Search DO or customer…"
              defaultSortKey="agingDays"
              defaultSortDir="desc"
              emptyMessage="No unlifted delivery orders — all stock collected"
            />
          </div>
        </>
      )}
    </div>
  )
}
