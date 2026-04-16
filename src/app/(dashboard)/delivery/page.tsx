"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import toast, { Toaster } from "react-hot-toast"
import { CheckCircle, Eye, Plus, Printer, Truck, XCircle } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Badge } from "@/components/ui/Badge"
import { Modal } from "@/components/ui/Modal"
import { Table } from "@/components/ui/Table"
import { LoadingPage } from "@/components/ui/Spinner"
import { formatDate } from "@/lib/utils"
import { useFetch } from "@/hooks/useFetch"
import { useAuth } from "@/hooks/useAuth"

interface DeliveryOrder {
  id: string
  doNumber: string
  salesOrder: {
    soNumber: string
    customer: { name: string }
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
    product: { name: string; wattage: number }
    quantity: number
    watts: number
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
  const [form, setForm] = useState({ soId: presetSoId || "", warehouseId: "", quantity: "", notes: "" })
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryOrder | null>(null)

  useEffect(() => {
    if (presetSoId) {
      setForm((current) => ({ ...current, soId: presetSoId }))
      setShowCreate(true)
    }
  }, [presetSoId])

  const eligibleSOs = (orders || []).filter((o) => ["PAYMENT_CONFIRMED", "DO_ISSUED"].includes(o.status))
  const selectedOrder = orders?.find((o) => o.id === form.soId)

  const orderTotalPanels = selectedOrder?.lines.reduce((t, l) => t + l.quantity, 0) || 0
  const orderTotalWatts = selectedOrder?.lines.reduce((t, l) => t + l.watts, 0) || 0
  const alreadyDispatchedPanels = selectedOrder?.deliveryOrders
    ?.filter((d) => d.status !== "CANCELLED")
    .reduce((t, d) => t + d.quantity, 0) || 0
  const remainingPanels = orderTotalPanels - alreadyDispatchedPanels

  // Default quantity to remaining when SO is selected
  useEffect(() => {
    if (form.soId && remainingPanels > 0 && !form.quantity) {
      setForm((prev) => ({ ...prev, quantity: String(remainingPanels) }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.soId, remainingPanels])

  const requestedQty = parseInt(form.quantity) || 0

  const handleCreate = async () => {
    if (!form.soId || !form.warehouseId) {
      return toast.error("Select both a sales order and warehouse")
    }
    if (requestedQty <= 0) return toast.error("Enter a valid quantity")
    if (requestedQty > remainingPanels) return toast.error(`Only ${remainingPanels} panels remaining`)

    setSaving(true)
    try {
      const response = await fetch("/api/delivery-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soId: form.soId, warehouseId: form.warehouseId, quantity: requestedQty, notes: form.notes }),
      })

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || "Failed to create delivery order")
        return
      }

      toast.success("Delivery order created and stock reserved")
      setShowCreate(false)
      setForm({ soId: "", warehouseId: "", quantity: "", notes: "" })
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

  const handleCancel = async (id: string) => {
    const response = await fetch(`/api/delivery-orders/${id}/cancel`, { method: "POST" })
    if (response.ok) { toast.success("Delivery order cancelled and stock released"); refetch(); return }
    const data = await response.json().catch(() => ({ error: "Failed" }))
    toast.error(data.error || "Failed to cancel delivery order")
  }

  const columns = [
    { key: "doNumber", header: "DO Number", sortable: true },
    {
      key: "salesOrder", header: "Sales Order",
      render: (row: DeliveryOrder) => (
        <div>
          <p className="font-medium">{row.salesOrder.soNumber}</p>
          <p className="text-xs text-gray-500">{row.salesOrder.customer.name}</p>
        </div>
      ),
    },
    { key: "warehouse", header: "Warehouse", render: (row: DeliveryOrder) => row.warehouse.name },
    { key: "quantity", header: "Panels", render: (row: DeliveryOrder) => row.quantity.toLocaleString() },
    { key: "reservedQuantity", header: "Reserved", render: (row: DeliveryOrder) => row.reservedQuantity.toLocaleString() },
    { key: "agingDays", header: "Age", render: (row: DeliveryOrder) => `${row.agingDays}d` },
    { key: "status", header: "Status", render: (row: DeliveryOrder) => <Badge status={row.status} /> },
    { key: "authorizedBy", header: "Authorized By", render: (row: DeliveryOrder) => row.authorizedBy || "-" },
    { key: "createdAt", header: "Date", render: (row: DeliveryOrder) => formatDate(row.createdAt) },
    {
      key: "actions", header: "Actions",
      render: (row: DeliveryOrder) => (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => window.open(`/delivery/${row.id}/print`, "_blank")}>
            <Printer size={14} className="mr-1" />Print
          </Button>
          {row.status === "PENDING" && user?.role === "ADMIN" && (
            <Button size="sm" variant="secondary" onClick={() => handleAuthorize(row.id)}>
              <CheckCircle size={14} className="mr-1" />Authorize
            </Button>
          )}
          {row.status === "AUTHORIZED" && ["ADMIN", "WAREHOUSE"].includes(user?.role || "") && (
            <Button size="sm" variant="success" onClick={() => handleDispatch(row.id)}>
              <Truck size={14} className="mr-1" />Dispatch
            </Button>
          )}
          {["PENDING", "AUTHORIZED"].includes(row.status) && ["ADMIN", "WAREHOUSE", "SALES"].includes(user?.role || "") && (
            <Button size="sm" variant="danger" onClick={() => handleCancel(row.id)}>
              <XCircle size={14} className="mr-1" />Cancel
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelectedDelivery(row)}>
            <Eye size={14} className="mr-1" />Details
          </Button>
        </div>
      ),
    },
  ]

  if (loading) return <LoadingPage />

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />

      <Header
        title="Delivery Orders"
        actions={<Button onClick={() => setShowCreate(true)}><Plus size={16} className="mr-2" />New DO</Button>}
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <Table columns={columns} data={dos || []} emptyMessage="No delivery orders yet" />
      </div>

      {/* ── Create DO Modal ── */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Delivery Order" size="lg">
        <div className="space-y-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-900">Reserve stock from a payment-confirmed sales order</p>
            <p className="mt-1 text-xs text-blue-700">
              You can create multiple delivery orders for one sales order — useful for partial shipments.
              Stock is reserved immediately and held until dispatch or cancellation.
            </p>
          </div>

          <Select
            label="Sales Order"
            required
            value={form.soId}
            onChange={(e) => setForm((prev) => ({ ...prev, soId: e.target.value, quantity: "" }))}
          >
            <option value="">Select confirmed SO...</option>
            {eligibleSOs.map((o) => (
              <option key={o.id} value={o.id}>{o.soNumber} — {o.customer.name}</option>
            ))}
          </Select>

          {selectedOrder && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{selectedOrder.soNumber}</p>
                  <p className="text-sm text-gray-500">{selectedOrder.customer.name}</p>
                </div>
                <Badge status={selectedOrder.status} />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
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
              </div>

              <div className="space-y-1">
                {selectedOrder.lines.map((line, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-gray-900">{line.product.name}</p>
                      <p className="text-xs text-gray-500">{line.product.wattage}W</p>
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

          <Input
            label={`Panels to Deliver${remainingPanels > 0 ? ` (max ${remainingPanels})` : ""}`}
            type="number"
            value={form.quantity}
            onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))}
            placeholder={remainingPanels > 0 ? String(remainingPanels) : "0"}
          />

          {selectedOrder && requestedQty > 0 && requestedQty < remainingPanels && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
              Partial delivery: {requestedQty.toLocaleString()} of {remainingPanels.toLocaleString()} remaining panels.
              {" "}{(remainingPanels - requestedQty).toLocaleString()} panels will require a further delivery order.
            </div>
          )}

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
