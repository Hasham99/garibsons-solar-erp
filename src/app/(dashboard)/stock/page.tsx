"use client"

import { useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { useAuth, accessOf } from "@/hooks/useAuth"
import { can } from "@/lib/permissions/modules"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Modal } from "@/components/ui/Modal"
import { StatCard } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Table } from "@/components/ui/Table"
import { CsvImport } from "@/components/ui/CsvImport"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu"
import { DetailsModal } from "@/components/ui/DetailsModal"
import { formatCurrency, formatAmount, formatDate } from "@/lib/utils"
import { Plus, Package, DollarSign, AlertTriangle, SlidersHorizontal, Pencil } from "lucide-react"
import toast from "react-hot-toast"

interface StockEntry {
  id: string
  product: { id: string; name: string; code: string; lowStockThreshold: number; wattage?: number }
  warehouse: { name: string }
  po: { poNumber: string } | null
  panelQuantity: number
  wattQuantity: number
  costPerPanel: number
  costPerWatt: number
  totalValue: number
  currentQuantity: number
  currentWatts: number
  reservedQuantity: number
  reservedWatts: number
  availableQuantity: number
  availableWatts: number
  currentValue: number
  reservedValue: number
  availableValue: number
  panelsSold: number
  agingDays: number
  receivedAt: string
  gstPerPanel: number
  gstCurrentValue: number
}

interface DashboardData {
  totalPanels: number
  reservedPanels: number
  availablePanels: number
  totalValue: number
  reservedValue: number
  availableValue: number
  byWarehouse: { name: string; currentPanels: number; reservedPanels: number; availablePanels: number; value: number }[]
  bySKU: { name: string; code: string; currentPanels: number; reservedPanels: number; availablePanels: number; value: number }[]
}

interface POOption {
  id: string
  poNumber: string
  noOfPanels: number
  panelWattage: number
  warehouseId: string | null
  warehouse?: { id: string; name: string } | null
  landedCostPerPanel: number | null
  landedCostPerWatt: number | null
  poAmountPkr: number
  lcType: string
  lcNumber: string | null
  status: string
}

function agingBadge(days: number) {
  if (days <= 30) return <span className="text-green-700 dark:text-green-300 text-xs font-medium">{days}d</span>
  if (days <= 60) return <span className="text-yellow-700 dark:text-yellow-300 text-xs font-medium">{days}d</span>
  if (days <= 90) return <span className="text-orange-600 dark:text-orange-300 text-xs font-medium">{days}d</span>
  return <span className="text-red-600 dark:text-red-300 text-xs font-semibold">{days}d ⚠</span>
}

type UnitView = "panel" | "watt" | "container" | "pallet"

// Adjustment reason categories. DECREASE = write-off/loss; INCREASE = found stock/gain.
const ADJUST_CATEGORIES: Record<"DECREASE" | "INCREASE", { value: string; label: string }[]> = {
  DECREASE: [
    { value: "COUNT_SHORTAGE", label: "Count shortage" },
    { value: "DAMAGE", label: "Damaged" },
    { value: "THEFT_LOSS", label: "Theft / loss" },
    { value: "SAMPLE", label: "Sample / promo" },
    { value: "CORRECTION", label: "Correction" },
    { value: "OTHER", label: "Other" },
  ],
  INCREASE: [
    { value: "COUNT_SURPLUS", label: "Count surplus" },
    { value: "FOUND", label: "Found stock" },
    { value: "CORRECTION", label: "Correction" },
    { value: "OTHER", label: "Other" },
  ],
}

export default function StockPage() {
  const { user } = useAuth()
  const { data: stock, loading, refetch } = useFetch<StockEntry[]>("/api/stock")
  const { data: dashboard, refetch: refetchDash } = useFetch<DashboardData>("/api/stock/dashboard")
  const { data: pos } = useFetch<POOption[]>("/api/purchase-orders")
  const { data: warehouses } = useFetch<{ id: string; name: string }[]>("/api/warehouses")

  const [unitView, setUnitView] = useState<UnitView>("panel")
  const [showReceive, setShowReceive] = useState(false)
  const [showAdjust, setShowAdjust] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<StockEntry | null>(null)
  const [editingEntry, setEditingEntry] = useState<StockEntry | null>(null)
  const [detailRow, setDetailRow] = useState<StockEntry | null>(null)
  const [saving, setSaving] = useState(false)

  const [receiveForm, setReceiveForm] = useState({
    poId: "", warehouseId: "", panelQuantity: "", costPerPanel: "", costPerWatt: "",
    receivedAt: new Date().toISOString().split("T")[0],
  })

  const [adjustForm, setAdjustForm] = useState({
    adjustmentType: "DECREASE",
    quantity: "",
    reason: "",
    category: "COUNT_SHORTAGE",
    unitCost: "",
  })

  const [editForm, setEditForm] = useState({
    panelQuantity: "",
    costPerPanel: "",
    costPerWatt: "",
    receivedAt: "",
  })

  // Build map of received panels per PO (by poNumber)
  const receivedPanelsByPO = (stock || []).reduce((acc, entry) => {
    if (entry.po?.poNumber) {
      acc[entry.po.poNumber] = (acc[entry.po.poNumber] || 0) + entry.panelQuantity
    }
    return acc
  }, {} as Record<string, number>)

  const handleReceive = async () => {
    if (!receiveForm.poId || !receiveForm.warehouseId || !receiveForm.panelQuantity) {
      return toast.error("Fill all required fields")
    }
    setSaving(true)
    try {
      const res = await fetch("/api/stock/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(receiveForm),
      })
      if (res.ok) {
        toast.success("Stock received successfully")
        setShowReceive(false)
        setReceiveForm({ poId: "", warehouseId: "", panelQuantity: "", costPerPanel: "", costPerWatt: "", receivedAt: new Date().toISOString().split("T")[0] })
        refetch()
        refetchDash()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to receive stock")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleAdjust = async () => {
    if (!selectedEntry || !adjustForm.quantity || !adjustForm.reason) {
      return toast.error("Fill all fields including reason")
    }
    setSaving(true)
    try {
      const res = await fetch("/api/stock/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockEntryId: selectedEntry.id, ...adjustForm }),
      })
      if (res.ok) {
        const saved = await res.json().catch(() => ({}))
        toast.success(
          saved?.value
            ? `Stock ${adjustForm.adjustmentType === "INCREASE" ? "added" : "written off"} — ${formatCurrency(saved.value)} ${adjustForm.adjustmentType === "INCREASE" ? "gain" : "loss"}`
            : "Stock adjustment recorded"
        )
        setShowAdjust(false)
        setAdjustForm({ adjustmentType: "DECREASE", quantity: "", reason: "", category: "COUNT_SHORTAGE", unitCost: "" })
        setSelectedEntry(null)
        refetch()
        refetchDash()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to adjust stock")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!editingEntry) return
    setSaving(true)
    try {
      const res = await fetch(`/api/stock/${editingEntry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      })
      if (res.ok) {
        toast.success("Stock entry updated")
        setShowEdit(false)
        setEditingEntry(null)
        refetch()
        refetchDash()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to update entry")
      }
    } finally {
      setSaving(false)
    }
  }

  const poWarehouseId = (po: POOption) =>
    po.warehouseId ||
    po.warehouse?.id ||
    (warehouses?.length === 1 ? warehouses[0].id : "") ||
    ""

  // LOCAL POs are ready to receive as soon as they are CONFIRMED (no costing step needed).
  // Non-local POs require costing first and show up as READY_TO_RECEIVE (or CLEARED for legacy data).
  const readyPOs = pos?.filter((p) =>
    ["READY_TO_RECEIVE", "CLEARED"].includes(p.status) ||
    (p.status === "CONFIRMED" && p.lcType === "LOCAL")
  ) || []

  // READY_TO_RECEIVE POs (fully or partially unreceived)
  const unreceivedPOs = readyPOs.filter((po) => {
    const received = receivedPanelsByPO[po.poNumber] || 0
    return received < po.noOfPanels
  })

  // Low stock alerts
  const lowStockEntries = stock?.filter(
    (entry) => entry.availableQuantity > 0 && entry.availableQuantity <= entry.product.lowStockThreshold
  ) || []

  const canAdjust = can(accessOf(user), "stock", "write")

  const formatQty = (panels: number, entry: StockEntry): string => {
    const panelsPerContainer = (entry.product as unknown as { panelsPerContainer?: number }).panelsPerContainer
    const palletsPerContainer = (entry.product as unknown as { palletsPerContainer?: number }).palletsPerContainer
    if (unitView === "watt") return `${(panels * (entry.product?.wattage || 1)).toLocaleString()} W`
    if (unitView === "container" && panelsPerContainer && panelsPerContainer > 0)
      return `${Math.ceil(panels / panelsPerContainer)} ctr`
    if (unitView === "pallet" && panelsPerContainer && palletsPerContainer && panelsPerContainer > 0) {
      const panelsPerPallet = panelsPerContainer / palletsPerContainer
      return `${Math.ceil(panels / panelsPerPallet)} plt`
    }
    return panels.toLocaleString()
  }

  const stockRowActions = (row: StockEntry): RowAction[] =>
    canAdjust ? [
      { label: "Edit Entry", icon: <Pencil size={15} />, onClick: () => {
        setEditingEntry(row)
        setEditForm({
          panelQuantity: String(row.panelQuantity),
          costPerPanel: String(row.costPerPanel.toFixed(2)),
          costPerWatt: String(row.costPerWatt.toFixed(4)),
          receivedAt: row.receivedAt.split("T")[0],
        })
        setShowEdit(true)
      } },
      { label: "Adjust Stock", icon: <SlidersHorizontal size={15} />, onClick: () => {
        setSelectedEntry(row)
        setAdjustForm({ adjustmentType: "DECREASE", quantity: "", reason: "", category: "COUNT_SHORTAGE", unitCost: String(row.costPerPanel.toFixed(2)) })
        setShowAdjust(true)
      } },
    ] : []

  const columns = [
    {
      key: "product", header: "Product", sortable: true,
      value: (row: StockEntry) => row.product?.name,
      render: (row: StockEntry) => (
        <div className="min-w-0">
          <p className="font-medium leading-tight">{row.product?.name}</p>
          <p className="text-tertiary leading-tight">{row.product?.code}</p>
        </div>
      )
    },
    {
      key: "receivedAt", header: "Rcvd Date", numeric: true,
      render: (row: StockEntry) => <span className="whitespace-nowrap">{formatDate(row.receivedAt)}</span>
    },
    {
      key: "warehouse", header: "Warehouse", sortable: true,
      value: (row: StockEntry) => row.warehouse?.name,
      render: (row: StockEntry) => <span className="whitespace-nowrap">{row.warehouse?.name}</span>
    },
    {
      key: "po", header: "PO Ref",
      value: (row: StockEntry) => row.po?.poNumber || "",
      render: (row: StockEntry) => <span className="whitespace-nowrap">{row.po?.poNumber || "—"}</span>
    },
    {
      key: "rcvdSold", header: "Rcvd / Sold", numeric: true,
      render: (row: StockEntry) => (
        <div className="whitespace-nowrap">
          <p>{formatQty(row.panelQuantity, row)}</p>
          <p className="text-tertiary">{formatQty(row.panelsSold, row)} sold</p>
        </div>
      )
    },
    {
      key: "availableQuantity", header: "Available", numeric: true,
      render: (row: StockEntry) => {
        const isLow = row.availableQuantity > 0 && row.availableQuantity <= row.product.lowStockThreshold
        return (
          <span className={
            row.availableQuantity <= 0 ? "text-red-600 dark:text-red-300 font-semibold" :
            isLow ? "text-orange-600 dark:text-orange-300 font-semibold" :
            "text-green-700 dark:text-green-300 font-semibold"
          }>
            {formatQty(row.availableQuantity, row)}{isLow && " ⚠"}
          </span>
        )
      }
    },
    {
      key: "reservedQuantity", header: "Reserved", numeric: true,
      render: (row: StockEntry) => (
        <span className={row.reservedQuantity > 0 ? "font-semibold text-amber-600 dark:text-amber-300" : "text-tertiary"}>
          {formatQty(row.reservedQuantity, row)}
        </span>
      )
    },
    {
      key: "costPerWatt", header: "Cost/W · GST (PKR)", numeric: true,
      render: (row: StockEntry) => (
        <div className="whitespace-nowrap">
          <p>{row.costPerWatt.toFixed(2)}</p>
          {row.gstPerPanel > 0 && <p className="text-orange-600 dark:text-orange-300">{formatAmount(row.gstPerPanel)} gst</p>}
        </div>
      )
    },
    {
      key: "availableValue", header: "Avail. Value (PKR)", numeric: true,
      render: (row: StockEntry) => <span className="whitespace-nowrap">{formatAmount(row.availableValue)}</span>
    },
    {
      key: "agingDays", header: "Age", numeric: true,
      render: (row: StockEntry) => agingBadge(row.agingDays)
    },
    ...(canAdjust ? [{
      key: "actions", header: "Actions",
      render: (row: StockEntry) => <RowActionsMenu actions={stockRowActions(row)} />
    }] : []),
  ]

  if (loading) return <TableSkeleton columns={7} rows={10} />

  return (
    <div className="space-y-6 animate-fade-in-up">

      {/* Row details */}
      <DetailsModal
        isOpen={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title={`Stock Batch — ${detailRow?.product?.name || ""}`}
        fields={detailRow ? [
          { label: "Product", value: `${detailRow.product?.name} (${detailRow.product?.code})` },
          { label: "Warehouse", value: detailRow.warehouse?.name },
          { label: "PO Reference", value: detailRow.po?.poNumber || "—" },
          { label: "Received", value: `${detailRow.panelQuantity.toLocaleString()} panels · ${formatDate(detailRow.receivedAt)}` },
          { label: "Current", value: `${detailRow.currentQuantity.toLocaleString()} panels (${detailRow.currentWatts.toLocaleString()} W)` },
          { label: "Reserved", value: `${detailRow.reservedQuantity.toLocaleString()} panels` },
          { label: "Available", value: <span className="font-bold text-green-700 dark:text-green-300">{detailRow.availableQuantity.toLocaleString()} panels</span> },
          { label: "Age", value: `${detailRow.agingDays} days` },
          { label: "Cost / Panel", value: formatCurrency(detailRow.costPerPanel) },
          { label: "Cost / Watt", value: `Rs ${detailRow.costPerWatt.toFixed(4)}` },
          { label: "Current Value", value: formatCurrency(detailRow.currentValue) },
          { label: "Available Value", value: formatCurrency(detailRow.availableValue) },
        ] : []}
        actions={detailRow ? stockRowActions(detailRow) : []}
      />
      <Header
        title="Stock Register"
        actions={
          <div className="flex gap-2">
            <CsvImport
              endpoint="/api/import/stock"
              title="Import Opening Stock"
              sampleName="stock"
              guide="Date format: DD-MM-YYYY (e.g. 30-04-2026 = 30 April). Creates stock-in entries (uses your exact Qty Watts & Total Value). Product must already exist; warehouse defaults to the only warehouse. The sheet's 'Total' row is skipped automatically."
              sampleColumns={["Item", "Panels", "Panel Wattage", "Qty Watts", "Rate per Watt (PKR)", "Total Value", "Warehouse", "Received Date"]}
              sampleRows={[
                ["FORMAT → exact product name as in system", "Number", "Number (e.g. 645)", "Number", "Number (e.g. 37)", "Number only — no commas", "Blank = main warehouse", "DD-MM-YYYY (30-04-2026 = 30 April)"],
                ["Longi Himo 10 - 645", "2232", "645", "1439640", "37", "53266680", "", "30-04-2026"],
                ["Aiko - 665 BF", "33732", "665", "22431780", "35.3", "791841834", "", "30-04-2026"],
              ]}
              onComplete={() => { refetch(); refetchDash() }}
            />
            <Button onClick={() => setShowReceive(true)}>
              <Plus size={16} className="mr-2" />
              Receive Stock
            </Button>
          </div>
        }
      />

      {/* Low Stock Alerts */}
      {lowStockEntries.length > 0 && (
        <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={18} className="text-orange-600 dark:text-orange-300" />
            <h3 className="font-semibold text-orange-900 dark:text-orange-300">Low Stock Alerts ({lowStockEntries.length})</h3>
          </div>
          <div className="space-y-1">
            {lowStockEntries.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-sm text-orange-800 dark:text-orange-300">
                <span>{e.product.name} @ {e.warehouse.name}</span>
                <span className="font-semibold">{e.availableQuantity} panels available (threshold: {e.product.lowStockThreshold})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Current Stock"
          value={`${(dashboard?.totalPanels || 0).toLocaleString()} panels`}
          icon={<Package size={20} />}
          color="blue"
        />
        <StatCard
          title="Available to Sell"
          value={`${(dashboard?.availablePanels || 0).toLocaleString()} panels`}
          subtitle={formatCurrency(dashboard?.availableValue || 0)}
          icon={<Package size={20} />}
          color="green"
        />
        <StatCard
          title="Reserved for DOs"
          value={`${(dashboard?.reservedPanels || 0).toLocaleString()} panels`}
          subtitle={formatCurrency(dashboard?.reservedValue || 0)}
          icon={<AlertTriangle size={20} />}
          color="yellow"
        />
        <StatCard
          title="Stock Value"
          value={formatCurrency(dashboard?.totalValue || 0)}
          icon={<DollarSign size={20} />}
          color="green"
        />
      </div>

      {/* By Warehouse & SKU */}
      {dashboard && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-surface rounded-xl shadow-card border border-line p-6">
            <h3 className="font-semibold text-foreground mb-4">Stock by Warehouse</h3>
            <div className="space-y-3">
              {dashboard.byWarehouse.map((w, i) => (
                <div key={`${w.name}-${i}`} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium text-foreground">{w.name}</p>
                    <p className="text-xs text-secondary">
                      Available {w.availablePanels.toLocaleString()} · Reserved {w.reservedPanels.toLocaleString()} · {formatCurrency(w.value)}
                    </p>
                  </div>
                  <p className="font-bold text-blue-600 dark:text-blue-300">{w.currentPanels.toLocaleString()} panels</p>
                </div>
              ))}
              {dashboard.byWarehouse.length === 0 && <p className="text-tertiary text-center py-4">No stock</p>}
            </div>
          </div>

          <div className="bg-surface rounded-xl shadow-card border border-line p-6">
            <h3 className="font-semibold text-foreground mb-4">Stock by SKU</h3>
            <div className="space-y-3">
              {dashboard.bySKU.map((s) => {
                const isLow = stock?.some((entry) => entry.product.code === s.code && entry.availableQuantity <= entry.product.lowStockThreshold && entry.availableQuantity > 0)
                return (
                  <div key={s.code} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <div className="flex items-center gap-1">
                        <p className="font-medium text-foreground">{s.name}</p>
                        {isLow && <AlertTriangle size={12} className="text-orange-500 dark:text-orange-400" />}
                      </div>
                      <p className="text-xs text-secondary">
                        {s.code} · Available {s.availablePanels.toLocaleString()} · Reserved {s.reservedPanels.toLocaleString()} · {formatCurrency(s.value)}
                      </p>
                    </div>
                    <p className={`font-bold ${isLow ? "text-orange-600 dark:text-orange-300" : "text-blue-600 dark:text-blue-300"}`}>{s.currentPanels.toLocaleString()} panels</p>
                  </div>
                )
              })}
              {dashboard.bySKU.length === 0 && <p className="text-tertiary text-center py-4">No stock</p>}
            </div>
          </div>
        </div>
      )}

      {/* Awaiting Receipt */}
      {unreceivedPOs.length > 0 && (
        <div className="bg-surface rounded-xl shadow-card border border-line">
          <div className="px-6 py-4 border-b border-line">
            <h3 className="font-semibold text-foreground">Ready to Receive ({unreceivedPOs.length})</h3>
            <p className="text-xs text-tertiary mt-0.5">POs with costing calculated — pending full goods receipt</p>
          </div>
          <div className="divide-y divide-line">
            {unreceivedPOs.map((po) => {
              const received = receivedPanelsByPO[po.poNumber] || 0
              const remaining = po.noOfPanels - received
              const isPartial = received > 0
              return (
                <div key={po.id} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{po.poNumber}</p>
                      {isPartial && <span className="text-xs bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">Partial</span>}
                    </div>
                    <p className="text-xs text-secondary">
                      {isPartial
                        ? `${received.toLocaleString()} received · ${remaining.toLocaleString()} remaining of ${po.noOfPanels.toLocaleString()} × ${po.panelWattage}W`
                        : `${po.noOfPanels.toLocaleString()} × ${po.panelWattage}W`}
                      {po.landedCostPerPanel ? ` · Rs ${po.landedCostPerPanel.toFixed(2)}/panel` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge status={po.status} />
                    <Button size="sm" variant="primary" onClick={() => {
                      const localCPP = po.lcType === "LOCAL" && po.noOfPanels > 0
                        ? po.poAmountPkr / po.noOfPanels : null
                      const localCPW = po.lcType === "LOCAL" && po.noOfPanels > 0 && po.panelWattage > 0
                        ? po.poAmountPkr / (po.noOfPanels * po.panelWattage) : null
                      setReceiveForm({
                        poId: po.id,
                        warehouseId: poWarehouseId(po),
                        panelQuantity: String(remaining),
                        costPerPanel: po.landedCostPerPanel
                          ? String(po.landedCostPerPanel.toFixed(2))
                          : localCPP ? String(localCPP.toFixed(2)) : "",
                        costPerWatt: po.landedCostPerWatt
                          ? String(po.landedCostPerWatt.toFixed(4))
                          : localCPW ? String(localCPW.toFixed(4)) : "",
                        receivedAt: new Date().toISOString().split("T")[0],
                      })
                      setShowReceive(true)
                    }}>
                      Receive
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Stock Entries Table */}
      <div className="bg-surface rounded-xl shadow-card border border-line">
        <div className="px-6 py-4 border-b border-line flex items-center justify-between flex-wrap gap-3">
          <h3 className="font-semibold text-foreground">Stock Entries (Batch View)</h3>
          <div className="flex items-center gap-3">
            {/* Unit view filter */}
            <div className="flex gap-1 bg-muted p-1 rounded-lg">
              {(["panel", "watt", "container", "pallet"] as UnitView[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnitView(u)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                    unitView === u ? "bg-surface text-foreground shadow-sm" : "text-secondary hover:text-secondary"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
            <p className="text-xs text-tertiary">Aging: green ≤30d, yellow ≤60d, orange ≤90d, red 90d+</p>
          </div>
        </div>
        <Table
          columns={columns}
          data={(stock || [])}
          emptyMessage="No stock entries yet"
          compact
          onRowClick={(row: StockEntry) => setDetailRow(row)}
          searchPlaceholder="Search product, code, PO #…"
          searchKeys={["product.code"]}
          filters={[
            { key: "warehouse", label: "Warehouse", value: (row: StockEntry) => row.warehouse?.name },
            {
              key: "availability",
              label: "Availability",
              value: (row: StockEntry) =>
                row.availableQuantity <= 0
                  ? "Out of stock"
                  : row.availableQuantity <= row.product.lowStockThreshold
                    ? "Low stock"
                    : "In stock",
              options: [
                { value: "In stock", label: "In stock" },
                { value: "Low stock", label: "Low stock" },
                { value: "Out of stock", label: "Out of stock" },
              ],
            },
          ]}
        />
      </div>

      {/* Receive Stock Modal */}
      <Modal isOpen={showReceive} onClose={() => setShowReceive(false)} title="Receive Stock from PO">
        <div className="space-y-4">
          <Select
            label="Purchase Order *"
            required
            value={receiveForm.poId}
            onChange={(e) => {
              const poId = e.target.value
              const po = unreceivedPOs.find((p) => p.id === poId)
              if (!po) {
                setReceiveForm((prev) => ({ ...prev, poId }))
                return
              }
              const received = receivedPanelsByPO[po.poNumber] || 0
              const remaining = Math.max(0, po.noOfPanels - received)
              const localCPP = po.lcType === "LOCAL" && po.noOfPanels > 0
                ? po.poAmountPkr / po.noOfPanels : null
              const localCPW = po.lcType === "LOCAL" && po.noOfPanels > 0 && po.panelWattage > 0
                ? po.poAmountPkr / (po.noOfPanels * po.panelWattage) : null
              setReceiveForm((prev) => ({
                ...prev,
                poId,
                warehouseId: poWarehouseId(po),
                panelQuantity: String(remaining),
                costPerPanel: po.landedCostPerPanel
                  ? String(po.landedCostPerPanel.toFixed(2))
                  : localCPP ? String(localCPP.toFixed(2)) : "",
                costPerWatt: po.landedCostPerWatt
                  ? String(po.landedCostPerWatt.toFixed(4))
                  : localCPW ? String(localCPW.toFixed(4)) : "",
              }))
            }}
          >
            <option value="">Select PO...</option>
            {unreceivedPOs.map((p) => {
              const received = receivedPanelsByPO[p.poNumber] || 0
              const remaining = p.noOfPanels - received
              return (
                <option key={p.id} value={p.id}>
                  {p.poNumber} — {remaining.toLocaleString()} remaining of {p.noOfPanels.toLocaleString()} × {p.panelWattage}W
                </option>
              )
            })}
          </Select>

          {receiveForm.poId && (() => {
            const po = readyPOs.find((p) => p.id === receiveForm.poId)
            if (!po?.lcNumber) return null
            return (
              <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/30 rounded-lg px-4 py-2 text-sm text-blue-800 dark:text-blue-300">
                <span className="font-medium">LC No.: </span>{po.lcNumber}
              </div>
            )
          })()}

          <Select
            label="Warehouse *"
            required
            value={receiveForm.warehouseId}
            onChange={(e) => setReceiveForm({ ...receiveForm, warehouseId: e.target.value })}
          >
            <option value="">Select warehouse...</option>
            {warehouses?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Number of Panels *"
              type="number"
              required
              value={receiveForm.panelQuantity}
              onChange={(e) => setReceiveForm({ ...receiveForm, panelQuantity: e.target.value })}
            />
            <Input
              label="Cost per Panel (PKR)"
              type="number"
              step="0.01"
              value={receiveForm.costPerPanel}
              onChange={(e) => setReceiveForm({ ...receiveForm, costPerPanel: e.target.value })}
              placeholder="Auto-filled from costing"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Cost per Watt (PKR)"
              type="number"
              step="0.0001"
              value={receiveForm.costPerWatt}
              onChange={(e) => setReceiveForm({ ...receiveForm, costPerWatt: e.target.value })}
              placeholder="Auto-filled from costing"
            />
            <Input
              label="Received Date"
              type="date"
              value={receiveForm.receivedAt}
              onChange={(e) => setReceiveForm({ ...receiveForm, receivedAt: e.target.value })}
            />
          </div>

          {receiveForm.poId && (() => {
            const po = readyPOs.find((p) => p.id === receiveForm.poId)
            if (!po) return null
            const received = receivedPanelsByPO[po.poNumber] || 0
            const remaining = po.noOfPanels - received
            const entering = parseInt(receiveForm.panelQuantity) || 0
            if (received === 0) return null
            return (
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300">
                <p className="font-medium">Partial Delivery</p>
                <p>Previously received: {received.toLocaleString()} panels · Remaining: {remaining.toLocaleString()} panels</p>
                {entering < remaining && <p className="text-xs mt-1">Receiving {entering.toLocaleString()} now — {(remaining - entering).toLocaleString()} will remain after this batch.</p>}
              </div>
            )
          })()}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowReceive(false)}>Cancel</Button>
            <Button onClick={handleReceive} loading={saving}>Receive Stock</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Stock Entry Modal */}
      <Modal isOpen={showEdit} onClose={() => { setShowEdit(false); setEditingEntry(null) }} title="Edit Stock Entry">
        {editingEntry && (() => {
          const entryHasActivity = (editingEntry.panelsSold || 0) > 0 || (editingEntry.reservedQuantity || 0) > 0
          return (
          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-3 text-sm">
              <p className="font-medium text-foreground">{editingEntry.product.name}</p>
              <p className="text-secondary">{editingEntry.warehouse.name} · PO: {editingEntry.po?.poNumber || "—"}</p>
            </div>

            <div className="rounded-lg border border-blue-100 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 p-3 text-xs text-blue-800 dark:text-blue-300">
              Use this only to <strong>correct a data-entry mistake</strong> on the original receipt (wrong cost or count typed in). For real stock changes (write-off, damage, found stock) use <strong>Adjust Stock</strong> — that records the cost &amp; P&amp;L impact.
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Number of Panels"
                type="number"
                required
                disabled={entryHasActivity}
                value={editForm.panelQuantity}
                onChange={(e) => setEditForm({ ...editForm, panelQuantity: e.target.value })}
              />
              <Input
                label="Cost per Panel (PKR)"
                type="number"
                step="0.01"
                value={editForm.costPerPanel}
                onChange={(e) => setEditForm({ ...editForm, costPerPanel: e.target.value })}
              />
            </div>

            {entryHasActivity ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Panels are locked — this batch has already been dispatched/reserved. Use Adjust Stock to change quantity.
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Cost per Watt (PKR)"
                type="number"
                step="0.0001"
                value={editForm.costPerWatt}
                onChange={(e) => setEditForm({ ...editForm, costPerWatt: e.target.value })}
              />
              <Input
                label="Received Date"
                type="date"
                value={editForm.receivedAt}
                onChange={(e) => setEditForm({ ...editForm, receivedAt: e.target.value })}
              />
            </div>

            <p className="text-xs text-secondary">Changes will update the stock-in movement record accordingly.</p>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => { setShowEdit(false); setEditingEntry(null) }}>Cancel</Button>
              <Button onClick={handleEdit} loading={saving}>Save Changes</Button>
            </div>
          </div>
          )
        })()}
      </Modal>

      {/* Stock Adjustment Modal */}
      <Modal isOpen={showAdjust} onClose={() => { setShowAdjust(false); setSelectedEntry(null) }} title="Stock Adjustment">
        {selectedEntry && (
          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-3 text-sm">
              <p className="font-medium">{selectedEntry.product.name}</p>
              <p className="text-secondary">
                {selectedEntry.warehouse.name} · Available: <span className="font-semibold text-blue-700 dark:text-blue-300">{selectedEntry.availableQuantity} panels</span> · Reserved: <span className="font-semibold text-amber-600 dark:text-amber-300">{selectedEntry.reservedQuantity} panels</span>
              </p>
            </div>

            <Select
              label="Adjustment Type"
              value={adjustForm.adjustmentType}
              onChange={(e) => {
                const t = e.target.value as "DECREASE" | "INCREASE"
                setAdjustForm({
                  ...adjustForm,
                  adjustmentType: t,
                  category: ADJUST_CATEGORIES[t][0].value,
                  unitCost: t === "INCREASE" ? String(selectedEntry.costPerPanel.toFixed(2)) : adjustForm.unitCost,
                })
              }}
            >
              <option value="DECREASE">Decrease (write-off, damage, discrepancy)</option>
              <option value="INCREASE">Increase (found stock, correction)</option>
            </Select>

            <Select
              label="Category"
              value={adjustForm.category}
              onChange={(e) => setAdjustForm({ ...adjustForm, category: e.target.value })}
            >
              {ADJUST_CATEGORIES[adjustForm.adjustmentType as "DECREASE" | "INCREASE"].map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>

            <Input
              label={`Quantity to ${adjustForm.adjustmentType === "DECREASE" ? "Remove" : "Add"} (panels)`}
              type="number"
              required
              value={adjustForm.quantity}
              onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
            />

            {adjustForm.adjustmentType === "INCREASE" ? (
              <Input
                label="Cost / Panel (PKR)"
                type="number"
                step="0.01"
                required
                value={adjustForm.unitCost}
                onChange={(e) => setAdjustForm({ ...adjustForm, unitCost: e.target.value })}
              />
            ) : null}

            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Reason (required) *</label>
              <textarea
                value={adjustForm.reason}
                onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                rows={3}
                placeholder="e.g. Physical count discrepancy, damaged panels, correction..."
                className="block w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {(() => {
              const qty = parseInt(adjustForm.quantity) || 0
              const cost = adjustForm.adjustmentType === "INCREASE"
                ? (parseFloat(adjustForm.unitCost) || 0)
                : selectedEntry.costPerPanel
              const value = qty * cost
              if (qty <= 0) return null
              const isInc = adjustForm.adjustmentType === "INCREASE"
              return (
                <div className={`rounded-lg border p-3 text-sm ${isInc ? "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-300"}`}>
                  {isInc
                    ? <>Adds <strong>{qty.toLocaleString()}</strong> panels as a new cost layer @ {formatCurrency(cost)}/panel · inventory value <strong>+{formatCurrency(value)}</strong> (found-stock gain)</>
                    : <>Writes off <strong>{qty.toLocaleString()}</strong> panels @ {formatCurrency(cost)}/panel · P&amp;L <strong>−{formatCurrency(value)}</strong> (write-off loss)</>}
                </div>
              )
            })()}

            <p className="text-xs text-secondary">
              This adjustment will be logged with your name and timestamp for audit purposes.
            </p>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => { setShowAdjust(false); setSelectedEntry(null) }}>Cancel</Button>
              <Button onClick={handleAdjust} loading={saving} variant={adjustForm.adjustmentType === "DECREASE" ? "danger" : "primary"}>
                Record Adjustment
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
