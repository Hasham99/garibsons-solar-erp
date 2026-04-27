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
import { Plus, Package, DollarSign, AlertTriangle, SlidersHorizontal } from "lucide-react"
import toast, { Toaster } from "react-hot-toast"

interface StockEntry {
  id: string
  product: { id: string; name: string; code: string; lowStockThreshold: number }
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
  const [selectedEntry, setSelectedEntry] = useState<StockEntry | null>(null)
  const [saving, setSaving] = useState(false)

  const [receiveForm, setReceiveForm] = useState({
    poId: "", warehouseId: "", panelQuantity: "", costPerPanel: "",
    receivedAt: new Date().toISOString().split("T")[0],
  })

  const [adjustForm, setAdjustForm] = useState({
    adjustmentType: "DECREASE",
    quantity: "",
    reason: "",
  })

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
        setReceiveForm({ poId: "", warehouseId: "", panelQuantity: "", costPerPanel: "", receivedAt: new Date().toISOString().split("T")[0] })
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

  const clearablePOs = pos?.filter((p) => ["CLEARED", "CONFIRMED", "RECEIVED", "SHIPPED"].includes(p.status)) || []

  // POs with CLEARED status but no matching stock entry (awaiting goods receipt)
  const receivedPoIds = new Set((stock || []).map((s) => s.po?.poNumber))
  const unreceivedPOs = (pos || []).filter((p) =>
    ["CLEARED", "SHIPPED"].includes(p.status) && !receivedPoIds.has(p.poNumber)
  )

  // Low stock alerts
  const lowStockEntries = stock?.filter(
    (entry) => entry.availableQuantity > 0 && entry.availableQuantity <= entry.product.lowStockThreshold
  ) || []

  const canAdjust = ["ADMIN", "WAREHOUSE"].includes(user?.role || "")

  const columns = [
    {
      key: "product", header: "Product",
      render: (row: StockEntry) => (
        <div>
          <p className="font-medium text-sm">{row.product?.name}</p>
          <p className="text-xs text-gray-400">{row.product?.code}</p>
        </div>
      )
    },
    { key: "warehouse", header: "Warehouse", render: (row: StockEntry) => row.warehouse?.name },
    { key: "po", header: "PO / LC Ref", render: (row: StockEntry) => row.po?.poNumber || "-" },
    {
      key: "panelQuantity", header: "Received",
      render: (row: StockEntry) => `${row.panelQuantity.toLocaleString()} panels`
    },
    {
      key: "panelsSold", header: "Sold",
      render: (row: StockEntry) => (
        <span className="text-gray-600">{row.panelsSold.toLocaleString()}</span>
      )
    },
    {
      key: "currentQuantity", header: "Current",
      render: (row: StockEntry) => (
        <span className="font-semibold text-gray-900">{row.currentQuantity.toLocaleString()}</span>
      )
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
      key: "availableQuantity", header: "Available",
      render: (row: StockEntry) => {
        const isLow = row.availableQuantity > 0 && row.availableQuantity <= row.product.lowStockThreshold
        return (
          <span className={
            row.availableQuantity <= 0 ? "text-red-600 font-semibold" :
            isLow ? "text-orange-600 font-semibold" :
            "text-green-700 font-semibold"
          }>
            {row.availableQuantity.toLocaleString()}
            {isLow && " ⚠"}
          </span>
        )
      }
    },
    { key: "costPerWatt", header: "Cost/Watt", render: (row: StockEntry) => `Rs ${row.costPerWatt.toFixed(2)}` },
    {
      key: "gstPerPanel", header: "GST/Panel",
      render: (row: StockEntry) => row.gstPerPanel > 0
        ? <span className="text-orange-700">{formatCurrency(row.gstPerPanel)}</span>
        : <span className="text-gray-400">-</span>
    },
    {
      key: "availableValue", header: "Available Value",
      render: (row: StockEntry) => formatCurrency(row.availableValue)
    },
    {
      key: "agingDays", header: "Aging",
      render: (row: StockEntry) => agingBadge(row.agingDays)
    },
    { key: "receivedAt", header: "Received", render: (row: StockEntry) => formatDate(row.receivedAt) },
    ...(canAdjust ? [{
      key: "adjust", header: "",
      render: (row: StockEntry) => (
        <Button size="sm" variant="ghost" onClick={() => { setSelectedEntry(row); setShowAdjust(true) }}>
          <SlidersHorizontal size={14} />
        </Button>
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
            <h3 className="font-semibold text-gray-900">Awaiting Goods Receipt ({unreceivedPOs.length})</h3>
            <p className="text-xs text-gray-400 mt-0.5">CLEARED / SHIPPED POs not yet received into stock</p>
          </div>
          <div className="divide-y divide-gray-100">
            {unreceivedPOs.map((po) => (
              <div key={po.id} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{po.poNumber}</p>
                  <p className="text-xs text-gray-500">
                    {po.noOfPanels.toLocaleString()} × {po.panelWattage}W
                    {po.landedCostPerPanel ? ` · Expected cost: ${formatCurrency(po.landedCostPerPanel)}/panel` : " · No clearing yet"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge status={po.status} />
                  <Button size="sm" variant="primary" onClick={() => {
                    setReceiveForm({
                      poId: po.id,
                      warehouseId: po.warehouseId || "",
                      panelQuantity: String(po.noOfPanels),
                      costPerPanel: po.landedCostPerPanel ? String(po.landedCostPerPanel.toFixed(2)) : "",
                      receivedAt: new Date().toISOString().split("T")[0],
                    })
                    setShowReceive(true)
                  }}>
                    Receive
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stock Entries Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Stock Entries (Batch View)</h3>
          <p className="text-xs text-gray-400">Aging: green ≤30d, yellow ≤60d, orange ≤90d, red 90d+</p>
        </div>
        <Table columns={columns} data={(stock || [])} emptyMessage="No stock entries yet" />
      </div>

      {/* Receive Stock Modal */}
      <Modal isOpen={showReceive} onClose={() => setShowReceive(false)} title="Receive Stock from PO">
        <div className="space-y-4">
          <Select
            label="Purchase Order *"
            required
            value={receiveForm.poId}
            onChange={(e) => {
              const po = clearablePOs.find((p) => p.id === e.target.value)
              setReceiveForm({
                ...receiveForm,
                poId: e.target.value,
                warehouseId: po?.warehouseId || "",
                panelQuantity: po ? String(po.noOfPanels) : "",
                costPerPanel: po?.landedCostPerPanel ? String(po.landedCostPerPanel.toFixed(2)) : "",
              })
            }}
          >
            <option value="">Select PO...</option>
            {clearablePOs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.poNumber} — {p.noOfPanels.toLocaleString()} × {p.panelWattage}W [{p.status}]
              </option>
            ))}
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
              placeholder="Auto-filled from clearing"
            />
          </div>

          <Input
            label="Received Date"
            type="date"
            value={receiveForm.receivedAt}
            onChange={(e) => setReceiveForm({ ...receiveForm, receivedAt: e.target.value })}
          />

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowReceive(false)}>Cancel</Button>
            <Button onClick={handleReceive} loading={saving}>Receive Stock</Button>
          </div>
        </div>
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
