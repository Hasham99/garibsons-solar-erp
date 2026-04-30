"use client"

import { useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { useAuth } from "@/hooks/useAuth"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Modal } from "@/components/ui/Modal"
import { StatCard } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Table } from "@/components/ui/Table"
import { LoadingPage } from "@/components/ui/Spinner"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Plus, Package, DollarSign, AlertTriangle, SlidersHorizontal, Pencil } from "lucide-react"
import toast, { Toaster } from "react-hot-toast"

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
  landedCostPerPanel: number | null
  landedCostPerWatt: number | null
  poAmountPkr: number
  lcType: string
  status: string
}

function agingBadge(days: number) {
  if (days <= 30) return <span className="text-green-700 text-xs font-medium">{days}d</span>
  if (days <= 60) return <span className="text-yellow-700 text-xs font-medium">{days}d</span>
  if (days <= 90) return <span className="text-orange-600 text-xs font-medium">{days}d</span>
  return <span className="text-red-600 text-xs font-semibold">{days}d ⚠</span>
}

export default function StockPage() {
  const { user } = useAuth()
  const { data: stock, loading, refetch } = useFetch<StockEntry[]>("/api/stock")
  const { data: dashboard, refetch: refetchDash } = useFetch<DashboardData>("/api/stock/dashboard")
  const { data: pos } = useFetch<POOption[]>("/api/purchase-orders")
  const { data: warehouses } = useFetch<{ id: string; name: string }[]>("/api/warehouses")

  const [showReceive, setShowReceive] = useState(false)
  const [showAdjust, setShowAdjust] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<StockEntry | null>(null)
  const [editingEntry, setEditingEntry] = useState<StockEntry | null>(null)
  const [saving, setSaving] = useState(false)

  const [receiveForm, setReceiveForm] = useState({
    poId: "", warehouseId: "", panelQuantity: "", costPerPanel: "", costPerWatt: "",
    receivedAt: new Date().toISOString().split("T")[0],
  })

  const [adjustForm, setAdjustForm] = useState({
    adjustmentType: "DECREASE",
    quantity: "",
    reason: "",
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
        toast.success("Stock adjustment recorded")
        setShowAdjust(false)
        setAdjustForm({ adjustmentType: "DECREASE", quantity: "", reason: "" })
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

  const canAdjust = ["ADMIN", "WAREHOUSE"].includes(user?.role || "")

  const columns = [
    {
      key: "product", header: "Product",
      render: (row: StockEntry) => (
        <div className="min-w-0">
          <p className="font-medium leading-tight">{row.product?.name}</p>
          <p className="text-gray-400 leading-tight">{row.product?.code}</p>
        </div>
      )
    },
    {
      key: "warehouse", header: "Warehouse",
      render: (row: StockEntry) => <span className="whitespace-nowrap">{row.warehouse?.name}</span>
    },
    {
      key: "po", header: "PO Ref",
      render: (row: StockEntry) => <span className="whitespace-nowrap">{row.po?.poNumber || "—"}</span>
    },
    {
      key: "rcvdSold", header: "Rcvd / Sold",
      render: (row: StockEntry) => (
        <div className="whitespace-nowrap">
          <p>{row.panelQuantity.toLocaleString()}</p>
          <p className="text-gray-400">{row.panelsSold.toLocaleString()} sold</p>
        </div>
      )
    },
    {
      key: "availableQuantity", header: "Available",
      render: (row: StockEntry) => {
        const isLow = row.availableQuantity > 0 && row.availableQuantity <= row.product.lowStockThreshold
        return (
          <span className={
            row.availableQuantity <= 0 ? "text-red-600 font-semibold" :
            isLow ? "text-orange-600 font-semibold" :
            "text-green-700 font-semibold"
          }>
            {row.availableQuantity.toLocaleString()}{isLow && " ⚠"}
          </span>
        )
      }
    },
    {
      key: "reservedQuantity", header: "Reserved",
      render: (row: StockEntry) => (
        <span className={row.reservedQuantity > 0 ? "font-semibold text-amber-600" : "text-gray-400"}>
          {row.reservedQuantity.toLocaleString()}
        </span>
      )
    },
    {
      key: "costPerWatt", header: "Cost/W · GST",
      render: (row: StockEntry) => (
        <div className="whitespace-nowrap">
          <p>Rs {row.costPerWatt.toFixed(2)}</p>
          {row.gstPerPanel > 0 && <p className="text-orange-600">{formatCurrency(row.gstPerPanel)} gst</p>}
        </div>
      )
    },
    {
      key: "availableValue", header: "Avail. Value",
      render: (row: StockEntry) => <span className="whitespace-nowrap">{formatCurrency(row.availableValue)}</span>
    },
    {
      key: "agingDays", header: "Age",
      render: (row: StockEntry) => agingBadge(row.agingDays)
    },
    {
      key: "receivedAt", header: "Rcvd Date",
      render: (row: StockEntry) => <span className="whitespace-nowrap">{formatDate(row.receivedAt)}</span>
    },
    ...(canAdjust ? [{
      key: "actions", header: "",
      render: (row: StockEntry) => (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" title="Edit entry" onClick={() => {
            setEditingEntry(row)
            setEditForm({
              panelQuantity: String(row.panelQuantity),
              costPerPanel: String(row.costPerPanel.toFixed(2)),
              costPerWatt: String(row.costPerWatt.toFixed(4)),
              receivedAt: row.receivedAt.split("T")[0],
            })
            setShowEdit(true)
          }}>
            <Pencil size={12} />
          </Button>
          <Button size="sm" variant="ghost" title="Adjust stock" onClick={() => { setSelectedEntry(row); setShowAdjust(true) }}>
            <SlidersHorizontal size={12} />
          </Button>
        </div>
      )
    }] : []),
  ]

  if (loading) return <LoadingPage />

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <Header
        title="Stock Register"
        actions={
          <Button onClick={() => setShowReceive(true)}>
            <Plus size={16} className="mr-2" />
            Receive Stock
          </Button>
        }
      />

      {/* Low Stock Alerts */}
      {lowStockEntries.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={18} className="text-orange-600" />
            <h3 className="font-semibold text-orange-900">Low Stock Alerts ({lowStockEntries.length})</h3>
          </div>
          <div className="space-y-1">
            {lowStockEntries.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-sm text-orange-800">
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
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Stock by Warehouse</h3>
            <div className="space-y-3">
              {dashboard.byWarehouse.map((w) => (
                <div key={w.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{w.name}</p>
                    <p className="text-xs text-gray-500">
                      Available {w.availablePanels.toLocaleString()} · Reserved {w.reservedPanels.toLocaleString()} · {formatCurrency(w.value)}
                    </p>
                  </div>
                  <p className="font-bold text-blue-600">{w.currentPanels.toLocaleString()} panels</p>
                </div>
              ))}
              {dashboard.byWarehouse.length === 0 && <p className="text-gray-400 text-center py-4">No stock</p>}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Stock by SKU</h3>
            <div className="space-y-3">
              {dashboard.bySKU.map((s) => {
                const isLow = stock?.some((entry) => entry.product.code === s.code && entry.availableQuantity <= entry.product.lowStockThreshold && entry.availableQuantity > 0)
                return (
                  <div key={s.code} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="flex items-center gap-1">
                        <p className="font-medium text-gray-900">{s.name}</p>
                        {isLow && <AlertTriangle size={12} className="text-orange-500" />}
                      </div>
                      <p className="text-xs text-gray-500">
                        {s.code} · Available {s.availablePanels.toLocaleString()} · Reserved {s.reservedPanels.toLocaleString()} · {formatCurrency(s.value)}
                      </p>
                    </div>
                    <p className={`font-bold ${isLow ? "text-orange-600" : "text-blue-600"}`}>{s.currentPanels.toLocaleString()} panels</p>
                  </div>
                )
              })}
              {dashboard.bySKU.length === 0 && <p className="text-gray-400 text-center py-4">No stock</p>}
            </div>
          </div>
        </div>
      )}

      {/* Awaiting Receipt */}
      {unreceivedPOs.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Ready to Receive ({unreceivedPOs.length})</h3>
            <p className="text-xs text-gray-400 mt-0.5">POs with costing calculated — pending full goods receipt</p>
          </div>
          <div className="divide-y divide-gray-100">
            {unreceivedPOs.map((po) => {
              const received = receivedPanelsByPO[po.poNumber] || 0
              const remaining = po.noOfPanels - received
              const isPartial = received > 0
              return (
                <div key={po.id} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{po.poNumber}</p>
                      {isPartial && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Partial</span>}
                    </div>
                    <p className="text-xs text-gray-500">
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
                        warehouseId: po.warehouseId || "",
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Stock Entries (Batch View)</h3>
          <p className="text-xs text-gray-400">Aging: green ≤30d, yellow ≤60d, orange ≤90d, red 90d+</p>
        </div>
        <Table columns={columns} data={(stock || [])} emptyMessage="No stock entries yet" compact />
      </div>

      {/* Receive Stock Modal */}
      <Modal isOpen={showReceive} onClose={() => setShowReceive(false)} title="Receive Stock from PO">
        <div className="space-y-4">
          <Select
            label="Purchase Order *"
            required
            value={receiveForm.poId}
            onChange={(e) => {
              const po = readyPOs.find((p) => p.id === e.target.value)
              if (!po) {
                setReceiveForm({ ...receiveForm, poId: e.target.value })
                return
              }
              const received = receivedPanelsByPO[po.poNumber] || 0
              const remaining = Math.max(0, po.noOfPanels - received)
              const localCostPerPanel = po.lcType === "LOCAL" && po.noOfPanels > 0
                ? po.poAmountPkr / po.noOfPanels : null
              const localCostPerWatt = po.lcType === "LOCAL" && po.noOfPanels > 0 && po.panelWattage > 0
                ? po.poAmountPkr / (po.noOfPanels * po.panelWattage) : null
              setReceiveForm({
                ...receiveForm,
                poId: e.target.value,
                warehouseId: po.warehouseId || "",
                panelQuantity: String(remaining),
                costPerPanel: po.landedCostPerPanel
                  ? String(po.landedCostPerPanel.toFixed(2))
                  : localCostPerPanel ? String(localCostPerPanel.toFixed(2)) : "",
                costPerWatt: po.landedCostPerWatt
                  ? String(po.landedCostPerWatt.toFixed(4))
                  : localCostPerWatt ? String(localCostPerWatt.toFixed(4)) : "",
              })
            }}
          >
            <option value="">Select PO...</option>
            {readyPOs.map((p) => {
              const received = receivedPanelsByPO[p.poNumber] || 0
              const remaining = p.noOfPanels - received
              return (
                <option key={p.id} value={p.id}>
                  {p.poNumber} — {remaining.toLocaleString()} remaining of {p.noOfPanels.toLocaleString()} × {p.panelWattage}W
                </option>
              )
            })}
          </Select>

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
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
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
        {editingEntry && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <p className="font-medium text-gray-900">{editingEntry.product.name}</p>
              <p className="text-gray-500">{editingEntry.warehouse.name} · PO: {editingEntry.po?.poNumber || "—"}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Number of Panels"
                type="number"
                required
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

            <p className="text-xs text-gray-500">Changes will update the stock-in movement record accordingly.</p>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => { setShowEdit(false); setEditingEntry(null) }}>Cancel</Button>
              <Button onClick={handleEdit} loading={saving}>Save Changes</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Stock Adjustment Modal */}
      <Modal isOpen={showAdjust} onClose={() => { setShowAdjust(false); setSelectedEntry(null) }} title="Stock Adjustment">
        {selectedEntry && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <p className="font-medium">{selectedEntry.product.name}</p>
              <p className="text-gray-500">
                {selectedEntry.warehouse.name} · Available: <span className="font-semibold text-blue-700">{selectedEntry.availableQuantity} panels</span> · Reserved: <span className="font-semibold text-amber-600">{selectedEntry.reservedQuantity} panels</span>
              </p>
            </div>

            <Select
              label="Adjustment Type"
              value={adjustForm.adjustmentType}
              onChange={(e) => setAdjustForm({ ...adjustForm, adjustmentType: e.target.value })}
            >
              <option value="DECREASE">Decrease (write-off, damage, discrepancy)</option>
              <option value="INCREASE">Increase (found stock, correction)</option>
            </Select>

            <Input
              label={`Quantity to ${adjustForm.adjustmentType === "DECREASE" ? "Remove" : "Add"} (panels)`}
              type="number"
              required
              value={adjustForm.quantity}
              onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required) *</label>
              <textarea
                value={adjustForm.reason}
                onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                rows={3}
                placeholder="e.g. Physical count discrepancy, damaged panels, correction..."
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <p className="text-xs text-gray-500">
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
