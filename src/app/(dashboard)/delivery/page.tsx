"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import toast, { Toaster } from "react-hot-toast"
import { CheckCircle, Eye, Plus, Printer, Truck, XCircle } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { SearchableSelect } from "@/components/ui/SearchableSelect"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu"
import { Badge } from "@/components/ui/Badge"
import { Modal } from "@/components/ui/Modal"
import { Table } from "@/components/ui/Table"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { formatDate, statusRowClass } from "@/lib/utils"
import { useFetch } from "@/hooks/useFetch"
import { useAuth } from "@/hooks/useAuth"

interface DeliveryOrder {
  id: string
  doNumber: string
  referenceNo: string | null
  salesOrder: {
    soNumber: string
    customer: { name: string }
    lines?: Array<{ ratePerWatt: number }>
  }
  warehouse: { name: string }
  quantity: number
  watts: number
  status: string
  authorizedBy: string | null
  dispatchedAt: string | null
  createdAt: string
  reservedQuantity: number
  reservedWatts: number
  reservedBatches: number
  agingDays: number
}

interface SalesOrderOption {
  id: string
  soNumber: string
  customer: { name: string }
  status: string
  paymentTerms: string
  lines: Array<{
    id?: string
    product: { id?: string; name: string; wattage: number }
    quantity: number
    watts: number
    ratePerWatt: number
  }>
  deliveryOrders: Array<{ status: string; quantity: number }>
}

export default function DeliveryPage() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const presetSoId = searchParams.get("soId")

  const { data: dos, loading, refetch } = useFetch<DeliveryOrder[]>("/api/delivery-orders")
  const { data: orders } = useFetch<SalesOrderOption[]>("/api/sales-orders")
  const { data: warehouses } = useFetch<{ id: string; name: string }[]>("/api/warehouses")

  const [showCreate, setShowCreate] = useState(Boolean(presetSoId))
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ soId: presetSoId || "", warehouseId: "", validityDays: "3", notes: "", referenceNo: "" })
  const [lineQtys, setLineQtys] = useState<Record<number, string>>({})
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryOrder | null>(null)
  const [cancelDO, setCancelDO] = useState<DeliveryOrder | null>(null)
  const [cancellingDO, setCancellingDO] = useState(false)

  useEffect(() => {
    if (presetSoId) {
      setForm((current) => ({ ...current, soId: presetSoId }))
      setShowCreate(true)
    }
  }, [presetSoId])

  const eligibleSOs = (orders || []).filter((o) => ["PAYMENT_CONFIRMED", "DO_ISSUED"].includes(o.status))
  const selectedOrder = orders?.find((o) => o.id === form.soId)

  const orderTotalPanels = selectedOrder?.lines.reduce((t, l) => t + l.quantity, 0) || 0
  const alreadyDispatchedPanels = selectedOrder?.deliveryOrders
    ?.filter((d) => d.status !== "CANCELLED")
    .reduce((t, d) => t + d.quantity, 0) || 0
  const remainingPanels = orderTotalPanels - alreadyDispatchedPanels

  // Default line quantities to remaining when SO is selected
  useEffect(() => {
    if (form.soId && selectedOrder && remainingPanels > 0 && Object.keys(lineQtys).length === 0) {
      const defaults: Record<number, string> = {}
      const ratio = remainingPanels / orderTotalPanels
      selectedOrder.lines.forEach((line, i) => {
        const isLast = i === selectedOrder.lines.length - 1
        const filled = selectedOrder.lines.slice(0, i).reduce((s, _, j) => s + (parseInt(defaults[j]) || 0), 0)
        defaults[i] = isLast ? String(remainingPanels - filled) : String(Math.round(line.quantity * ratio))
      })
      setLineQtys(defaults)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.soId, remainingPanels])

  // Reset line quantities when SO changes
  useEffect(() => {
    setLineQtys({})
  }, [form.soId])

  const requestedQty = Object.values(lineQtys).reduce((s, v) => s + (parseInt(v) || 0), 0)

  const handleCreate = async () => {
    if (!form.soId || !form.warehouseId) {
      return toast.error("Select both a sales order and warehouse")
    }
    if (requestedQty <= 0) return toast.error("Enter at least 1 panel across the lines")
    if (requestedQty > remainingPanels) return toast.error(`Only ${remainingPanels} panels remaining`)

    // Build per-line payload
    const lines = selectedOrder?.lines.map((line, i) => ({
      soLineId: (line as { id?: string }).id,
      productId: line.product?.id || "",
      quantity: parseInt(lineQtys[i] || "0") || 0,
      watts: (parseInt(lineQtys[i] || "0") || 0) * line.product.wattage,
    })).filter((l) => l.quantity > 0)

    setSaving(true)
    try {
      const response = await fetch("/api/delivery-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          soId: form.soId,
          warehouseId: form.warehouseId,
          quantity: requestedQty,
          lines,
          validityDays: form.validityDays,
          notes: form.notes,
          referenceNo: form.referenceNo,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || "Failed to create delivery order")
        return
      }

      toast.success("Delivery order created and stock reserved")
      setShowCreate(false)
      setForm({ soId: "", warehouseId: "", validityDays: "3", notes: "", referenceNo: "" })
      setLineQtys({})
      refetch()
    } finally {
      setSaving(false)
    }
  }

  const handleAuthorize = async (id: string) => {
    const response = await fetch(`/api/delivery-orders/${id}/authorize`, { method: "POST" })
    if (response.ok) { toast.success("Delivery order authorized"); refetch(); return }
    const data = await response.json().catch(() => ({ error: "Failed" }))
    toast.error(data.error || "Failed to authorize delivery order")
  }

  const handleDispatch = async (id: string) => {
    const response = await fetch(`/api/delivery-orders/${id}/dispatch`, { method: "POST" })
    if (response.ok) { toast.success("Delivery order dispatched"); refetch(); return }
    const data = await response.json().catch(() => ({ error: "Failed" }))
    toast.error(data.error || "Failed to dispatch delivery order")
  }

  const handleCancel = async () => {
    if (!cancelDO) return
    setCancellingDO(true)
    try {
      const response = await fetch(`/api/delivery-orders/${cancelDO.id}/cancel`, { method: "POST" })
      if (response.ok) { toast.success("Delivery order cancelled and stock released"); refetch(); return }
      const data = await response.json().catch(() => ({ error: "Failed" }))
      toast.error(data.error || "Failed to cancel delivery order")
    } finally {
      setCancellingDO(false)
      setCancelDO(null)
    }
  }

  const soRateDisplay = (order: SalesOrderOption) => {
    const rates = [...new Set(order.lines.map((l) => l.ratePerWatt).filter((r) => r > 0))].sort((a, b) => a - b)
    if (rates.length === 0) return null
    return rates.length === 1 ? `Rs ${rates[0].toFixed(2)}` : `Rs ${rates[0].toFixed(2)}–${rates[rates.length - 1].toFixed(2)}`
  }

  const rateDisplay = (row: DeliveryOrder) => {
    const rates = [...new Set((row.salesOrder.lines || []).map((l) => l.ratePerWatt))].sort((a, b) => a - b)
    if (rates.length === 0) return null
    return rates.length === 1 ? rates[0].toFixed(2) : `${rates[0].toFixed(2)}–${rates[rates.length - 1].toFixed(2)}`
  }

  const columns = [
    { key: "createdAt", header: "Date", sortable: true, value: (row: DeliveryOrder) => row.createdAt, render: (row: DeliveryOrder) => <span className="whitespace-nowrap">{formatDate(row.createdAt)}</span> },
    { key: "doNumber", header: "DO Number", sortable: true, render: (row: DeliveryOrder) => <span className="font-medium">{row.doNumber}</span> },
    { key: "referenceNo", header: "Ref. DO #", sortable: true, value: (row: DeliveryOrder) => row.referenceNo || "", render: (row: DeliveryOrder) => row.referenceNo ? <span className="text-gray-700">{row.referenceNo}</span> : <span className="text-gray-300">—</span> },
    { key: "soNumber", header: "SO Number", sortable: true, value: (row: DeliveryOrder) => row.salesOrder.soNumber, render: (row: DeliveryOrder) => row.salesOrder.soNumber },
    { key: "party", header: "Party", sortable: true, value: (row: DeliveryOrder) => row.salesOrder.customer.name, render: (row: DeliveryOrder) => <span className="font-medium">{row.salesOrder.customer.name}</span> },
    {
      key: "ratePerWatt", header: "Rate / Watt", sortable: true,
      value: (row: DeliveryOrder) => row.salesOrder.lines?.[0]?.ratePerWatt ?? 0,
      render: (row: DeliveryOrder) => {
        const r = rateDisplay(row)
        return r ? <span className="font-medium text-blue-700 whitespace-nowrap">{r}</span> : <span className="text-gray-400">—</span>
      },
    },
    { key: "quantity", header: "Panels", render: (row: DeliveryOrder) => row.quantity.toLocaleString() },
    { key: "reservedQuantity", header: "Reserved", render: (row: DeliveryOrder) => row.reservedQuantity.toLocaleString() },
    { key: "agingDays", header: "Age", render: (row: DeliveryOrder) => `${row.agingDays}d` },
    { key: "status", header: "Status", render: (row: DeliveryOrder) => <Badge status={row.status} /> },
    { key: "authorizedBy", header: "Authorized By", render: (row: DeliveryOrder) => row.authorizedBy || "-" },
    {
      key: "actions", header: "Actions",
      render: (row: DeliveryOrder) => {
        const actions: RowAction[] = [
          { label: "View Details", icon: <Eye size={15} />, onClick: () => setSelectedDelivery(row) },
          { label: "Print", icon: <Printer size={15} />, onClick: () => window.open(`/delivery/${row.id}/print`, "_blank") },
        ]
        if (row.status === "PENDING" && user?.role === "ADMIN") {
          actions.push({ label: "Authorize", icon: <CheckCircle size={15} />, onClick: () => handleAuthorize(row.id) })
        }
        if (row.status === "AUTHORIZED" && ["ADMIN", "WAREHOUSE"].includes(user?.role || "")) {
          actions.push({ label: "Dispatch", icon: <Truck size={15} />, onClick: () => handleDispatch(row.id) })
        }
        if (["PENDING", "AUTHORIZED"].includes(row.status) && ["ADMIN", "WAREHOUSE", "SALES"].includes(user?.role || "")) {
          actions.push({ label: "Cancel DO", icon: <XCircle size={15} />, danger: true, onClick: () => setCancelDO(row) })
        }
        return <RowActionsMenu actions={actions} />
      },
    },
  ]

  if (loading) return <TableSkeleton columns={7} rows={10} />

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />

      <Header
        title="Delivery Orders"
        actions={<Button onClick={() => setShowCreate(true)}><Plus size={16} className="mr-2" />New DO</Button>}
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <Table
          columns={columns}
          data={dos || []}
          emptyMessage="No delivery orders yet"
          rowClassName={(row: DeliveryOrder) => statusRowClass(row.status)}
          onRowClick={(row: DeliveryOrder) => setSelectedDelivery(row)}
          searchPlaceholder="Search DO #, Ref #, SO #, customer…"
          searchKeys={["salesOrder.soNumber", "salesOrder.customer.name", "warehouse.name", "referenceNo"]}
          filters={[
            { key: "status", label: "Status", value: (row: DeliveryOrder) => row.status },
            { key: "party", label: "Party", value: (row: DeliveryOrder) => row.salesOrder.customer.name },
            { key: "warehouse", label: "Warehouse", value: (row: DeliveryOrder) => row.warehouse.name },
            { key: "createdAt", label: "Date", type: "date", value: (row: DeliveryOrder) => row.createdAt },
          ]}
        />
      </div>

      {/* ── Cancel confirmation ── */}
      <ConfirmDialog
        isOpen={Boolean(cancelDO)}
        onClose={() => setCancelDO(null)}
        onConfirm={handleCancel}
        loading={cancellingDO}
        title={`Cancel Delivery Order — ${cancelDO?.doNumber || ""}`}
        confirmLabel="Cancel Delivery Order"
        cancelLabel="Keep DO"
        message={
          <span>
            Cancel <strong>{cancelDO?.doNumber}</strong> for <strong>{cancelDO?.salesOrder.customer.name}</strong> ({cancelDO?.quantity.toLocaleString()} panels)?
            <br />Reserved stock will be released back to the warehouse.
          </span>
        }
      />

      {/* ── Create DO Modal ── */}
      <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); setLineQtys({}) }} title="Create Delivery Order" size="lg">
        <div className="space-y-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-900">Reserve stock from a payment-confirmed sales order</p>
            <p className="mt-1 text-xs text-blue-700">
              You can create multiple delivery orders for one sales order — useful for partial shipments.
              Stock is reserved immediately and held until dispatch or cancellation.
            </p>
          </div>

          <SearchableSelect
            label="Sales Order"
            required
            placeholder="Type SO # or party name to search…"
            options={eligibleSOs.map((o) => ({ value: o.id, label: `${o.soNumber} — ${o.customer.name}`, sublabel: o.status.replace(/_/g, " ") }))}
            value={form.soId}
            onChange={(soId) => setForm((prev) => ({ ...prev, soId }))}
          />

          {selectedOrder && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{selectedOrder.soNumber}</p>
                  <p className="text-sm text-gray-500">{selectedOrder.customer.name}</p>
                </div>
                <Badge status={selectedOrder.status} />
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg bg-white p-3">
                  <p className="text-xs text-gray-500">Total Panels</p>
                  <p className="text-xl font-semibold text-gray-900">{orderTotalPanels.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-white p-3">
                  <p className="text-xs text-gray-500">Already in DOs</p>
                  <p className="text-xl font-semibold text-orange-600">{alreadyDispatchedPanels.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-white border-2 border-green-200 p-3">
                  <p className="text-xs text-gray-500">Remaining</p>
                  <p className="text-xl font-semibold text-green-700">{remainingPanels.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-white border-2 border-blue-200 p-3">
                  <p className="text-xs text-gray-500">Rate / Watt</p>
                  <p className="text-xl font-semibold text-blue-700">{soRateDisplay(selectedOrder) || "—"}</p>
                </div>
              </div>

              <div className="space-y-1">
                {selectedOrder.lines.map((line, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-gray-900">{line.product.name}</p>
                      <p className="text-xs text-gray-500">{line.product.wattage}W · Rs {line.ratePerWatt?.toFixed(2)}/W</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{line.quantity.toLocaleString()} panels</p>
                      <p className="text-xs text-gray-500">{line.watts.toLocaleString()} W</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Select
            label="Dispatch Warehouse"
            required
            value={form.warehouseId}
            onChange={(e) => setForm((prev) => ({ ...prev, warehouseId: e.target.value }))}
          >
            <option value="">Select warehouse...</option>
            {warehouses?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>

          {/* Per-line quantity inputs */}
          {selectedOrder && selectedOrder.lines.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">
                Panels to Deliver — per product
                {remainingPanels > 0 && <span className="text-gray-400 font-normal"> (max {remainingPanels} remaining)</span>}
              </p>
              {selectedOrder.lines.map((line, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{line.product.name}</p>
                    <p className="text-xs text-gray-500">{line.product.wattage}W · ordered {line.quantity.toLocaleString()} panels</p>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={line.quantity}
                    value={lineQtys[i] ?? ""}
                    onChange={(e) => setLineQtys((prev) => ({ ...prev, [i]: e.target.value }))}
                    placeholder="0"
                    className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
              {requestedQty > 0 && (
                <div className="flex items-center justify-between rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm">
                  <span className="text-blue-700 font-medium">Total panels this DO:</span>
                  <span className="font-bold text-blue-900">{requestedQty.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          {selectedOrder && requestedQty > 0 && requestedQty < remainingPanels && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
              Partial delivery: {requestedQty.toLocaleString()} of {remainingPanels.toLocaleString()} remaining panels.
              {" "}{(remainingPanels - requestedQty).toLocaleString()} panels will require a further delivery order.
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Reference DO No. (from your sheet)"
              value={form.referenceNo}
              onChange={(e) => setForm((prev) => ({ ...prev, referenceNo: e.target.value }))}
              placeholder="e.g. 543"
            />
            <Input
              label="Validity (working days)"
              type="number"
              value={form.validityDays}
              onChange={(e) => setForm((prev) => ({ ...prev, validityDays: e.target.value }))}
              placeholder="3"
            />
          </div>
          <Input label="Notes" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={saving}>Create DO and Reserve Stock</Button>
          </div>
        </div>
      </Modal>

      {/* ── Details Modal ── */}
      <Modal isOpen={Boolean(selectedDelivery)} onClose={() => setSelectedDelivery(null)} title={`Delivery Details — ${selectedDelivery?.doNumber}`}>
        {selectedDelivery && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <p className="text-xs text-gray-500">Customer</p>
                <p className="font-semibold text-gray-900">{selectedDelivery.salesOrder.customer.name}</p>
                <p className="mt-2 text-xs text-gray-500">Sales Order</p>
                <p className="font-semibold text-gray-900">{selectedDelivery.salesOrder.soNumber}</p>
                <p className="mt-2 text-xs text-gray-500">Reference DO No.</p>
                <p className="font-semibold text-gray-900">{selectedDelivery.referenceNo || "—"}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <p className="text-xs text-gray-500">Warehouse</p>
                <p className="font-semibold text-gray-900">{selectedDelivery.warehouse.name}</p>
                <p className="mt-2 text-xs text-gray-500">Reserved Batches</p>
                <p className="font-semibold text-gray-900">{selectedDelivery.reservedBatches}</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-gray-200 p-3 text-sm">
                <p className="text-xs text-gray-500">Panels (DO)</p>
                <p className="text-lg font-semibold text-gray-900">{selectedDelivery.quantity.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-3 text-sm">
                <p className="text-xs text-gray-500">Reserved</p>
                <p className="text-lg font-semibold text-gray-900">{selectedDelivery.reservedQuantity.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-3 text-sm">
                <p className="text-xs text-gray-500">Age</p>
                <p className="text-lg font-semibold text-gray-900">{selectedDelivery.agingDays} days</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
