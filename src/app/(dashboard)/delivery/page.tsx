"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import toast from "react-hot-toast"
import { ArrowLeftRight, CheckCircle, Eye, Pencil, Plus, Printer, RotateCcw, Truck, XCircle } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { SearchableSelect } from "@/components/ui/SearchableSelect"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu"
import { Badge } from "@/components/ui/Badge"
import { Modal } from "@/components/ui/Modal"
import { DetailsModal } from "@/components/ui/DetailsModal"
import { Table } from "@/components/ui/Table"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { formatAmount, formatDate, statusRowClass } from "@/lib/utils"
import { useFetch } from "@/hooks/useFetch"
import { useAuth, accessOf } from "@/hooks/useAuth"
import { can } from "@/lib/permissions/modules"
import { computePallets } from "@/lib/delivery"
import { useLookups } from "@/components/lookups/LookupsProvider"

interface DeliveryOrder {
  id: string
  doNumber: string
  soId: string
  warehouseId: string
  validityDays: number | null
  notes: string | null
  lines?: Array<{
    soLineId: string | null
    productId: string
    quantity: number
    watts: number
    product?: { name: string; code: string; wattage: number; panelsPerContainer: number | null; palletsPerContainer: number | null }
  }>
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
  liftedQuantity: number
  balanceQuantity: number
  totalPallets: number
  agingDays: number
}

interface LineProgress {
  productId: string
  productName: string
  wattage: number
  ordered: number
  lifted: number
  balance: number
}

interface ReturnableRow {
  productId: string
  productName: string
  returnable: number
  wattsPerPanel: number
  wattage: number
  ratePerWatt: number
}

interface DoReturn {
  id: string
  returnNumber: string
  type: "RETURN" | "EXCHANGE"
  status: "COMPLETED" | "VOID"
  returnDate: string
  creditAmount: number
  lines: Array<{ product: { name: string }; quantity: number }>
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
  remainingPanels: number
}

export default function DeliveryPage() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const presetSoId = searchParams.get("soId")

  const { data: dos, loading, refetch } = useFetch<DeliveryOrder[]>("/api/delivery-orders")
  const { data: orders } = useFetch<SalesOrderOption[]>("/api/sales-orders")
  const warehouses = useLookups().warehouses as { id: string; name: string }[]
  const customers = useLookups().customers as { id: string; name: string; type: string; contactPhone: string | null; active?: boolean }[]

  const [showCreate, setShowCreate] = useState(Boolean(presetSoId))
  const [editDO, setEditDO] = useState<DeliveryOrder | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ soId: presetSoId || "", warehouseId: "", validityDays: "3", notes: "", referenceNo: "" })
  const [lineQtys, setLineQtys] = useState<Record<number, string>>({})
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryOrder | null>(null)
  const [cancelDO, setCancelDO] = useState<DeliveryOrder | null>(null)
  const [cancellingDO, setCancellingDO] = useState(false)
  const [transferDO, setTransferDO] = useState<DeliveryOrder | null>(null)
  const [transferTargetId, setTransferTargetId] = useState("")
  const [transferring, setTransferring] = useState(false)

  // Partial-dispatch (lifting) modal
  const [dispatchDO, setDispatchDO] = useState<DeliveryOrder | null>(null)
  const [dispatchProgress, setDispatchProgress] = useState<LineProgress[] | null>(null)
  const [liftQtys, setLiftQtys] = useState<Record<string, string>>({})
  const [dispatching, setDispatching] = useState(false)

  const [returnDO, setReturnDO] = useState<DeliveryOrder | null>(null)
  const [returnRows, setReturnRows] = useState<ReturnableRow[] | null>(null)
  const [returnType, setReturnType] = useState<"RETURN" | "EXCHANGE">("RETURN")
  const [returnReason, setReturnReason] = useState("")
  const [returnQtys, setReturnQtys] = useState<Record<string, string>>({})
  const [returnRates, setReturnRates] = useState<Record<string, string>>({})
  const [submittingReturn, setSubmittingReturn] = useState(false)
  const [exchangeFollowUp, setExchangeFollowUp] = useState<{ soId: string; soNumber: string } | null>(null)
  const [doReturns, setDoReturns] = useState<DoReturn[] | null>(null)
  const [voidReturnRow, setVoidReturnRow] = useState<DoReturn | null>(null)
  const [voidingReturn, setVoidingReturn] = useState(false)

  useEffect(() => {
    if (presetSoId) {
      setForm((current) => ({ ...current, soId: presetSoId }))
      setShowCreate(true)
    }
  }, [presetSoId])

  const eligibleSOs = (orders || []).filter((o) => ["PAYMENT_CONFIRMED", "DO_ISSUED"].includes(o.status))
  const selectedOrder = orders?.find((o) => o.id === form.soId)

  const orderTotalPanels = selectedOrder?.lines.reduce((t, l) => t + l.quantity, 0) || 0
  // The API already nets out delivered + reserved + written-off panels. When
  // editing, this DO's own (un-lifted) panels are re-plannable, so add them back.
  const remainingPanels =
    (selectedOrder?.remainingPanels ?? 0) + (editDO && editDO.soId === form.soId ? editDO.quantity : 0)

  // Default line quantities to remaining when SO is selected
  useEffect(() => {
    if (editDO) return
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

  // Reset line quantities when SO changes (skip while prefilling an edit)
  useEffect(() => {
    if (editDO) return
    setLineQtys({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.soId])

  const requestedQty = Object.values(lineQtys).reduce((s, v) => s + (parseInt(v) || 0), 0)

  const closeModal = () => {
    setShowCreate(false)
    setEditDO(null)
    setForm({ soId: "", warehouseId: "", validityDays: "3", notes: "", referenceNo: "" })
    setLineQtys({})
  }

  // Opens instantly — the list payload already carries everything the form needs
  const openEditModal = (row: DeliveryOrder) => {
    const so = orders?.find((o) => o.id === row.soId)

    setEditDO(row)
    setForm({
      soId: row.soId,
      warehouseId: row.warehouseId,
      validityDays: String(row.validityDays ?? 3),
      notes: row.notes || "",
      referenceNo: row.referenceNo || "",
    })

    // Map this DO's line quantities onto the SO's line rows (by soLineId, falling back to productId)
    const doLines = [...(row.lines || [])]
    const qtys: Record<number, string> = {}
    ;(so?.lines || []).forEach((line, i) => {
      const idx = doLines.findIndex(
        (dl) => (line.id && dl.soLineId === line.id) || dl.productId === line.product?.id
      )
      if (idx >= 0) {
        qtys[i] = String(doLines[idx].quantity)
        doLines.splice(idx, 1)
      }
    })
    // DO without per-line records (legacy/imported): put the full quantity on the first line
    if (Object.keys(qtys).length === 0 && (so?.lines.length || 0) > 0) {
      qtys[0] = String(row.quantity)
    }
    setLineQtys(qtys)
    setShowCreate(true)
  }

  const handleSave = async () => {
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
      const response = await fetch(editDO ? `/api/delivery-orders/${editDO.id}` : "/api/delivery-orders", {
        method: editDO ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editDO ? { editLines: true } : { soId: form.soId }),
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
        toast.error(data.error || `Failed to ${editDO ? "update" : "create"} delivery order`)
        return
      }

      toast.success(editDO ? "Delivery order updated and stock re-reserved" : "Delivery order created and stock reserved")
      closeModal()
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

  // Opens the lift/dispatch modal and loads the DO's per-line progress.
  const openDispatchModal = async (row: DeliveryOrder) => {
    setDispatchDO(row)
    setDispatchProgress(null)
    setLiftQtys({})
    try {
      const res = await fetch(`/api/delivery-orders/${row.id}`)
      if (!res.ok) throw new Error()
      const detail = await res.json()
      const progress: LineProgress[] = detail.lineProgress || []
      setDispatchProgress(progress)
      // Default each line to lift its full remaining balance.
      const defaults: Record<string, string> = {}
      for (const p of progress) defaults[p.productId] = String(p.balance)
      setLiftQtys(defaults)
    } catch {
      toast.error("Failed to load delivery order")
      setDispatchDO(null)
    }
  }

  const liftTotal = (dispatchProgress || []).reduce((s, p) => s + (parseInt(liftQtys[p.productId] || "0") || 0), 0)
  const liftBalanceTotal = (dispatchProgress || []).reduce((s, p) => s + p.balance, 0)

  const submitDispatch = async () => {
    if (!dispatchDO || !dispatchProgress) return
    const over = dispatchProgress.find((p) => (parseInt(liftQtys[p.productId] || "0") || 0) > p.balance)
    if (over) return toast.error(`Cannot lift more than the ${over.balance} balance of ${over.productName}`)
    if (liftTotal <= 0) return toast.error("Enter at least 1 panel to lift")

    const lines = dispatchProgress
      .map((p) => ({ productId: p.productId, quantity: parseInt(liftQtys[p.productId] || "0") || 0 }))
      .filter((l) => l.quantity > 0)

    setDispatching(true)
    try {
      const res = await fetch(`/api/delivery-orders/${dispatchDO.id}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      })
      if (res.ok) {
        const fully = liftTotal >= liftBalanceTotal
        toast.success(fully ? "Delivery order fully dispatched" : `Lifted ${liftTotal.toLocaleString()} panels`)
        setDispatchDO(null)
        refetch()
      } else {
        const data = await res.json().catch(() => ({ error: "Failed" }))
        toast.error(data.error || "Failed to dispatch delivery order")
      }
    } finally {
      setDispatching(false)
    }
  }

  const handleCancel = async () => {
    if (!cancelDO) return
    const wasPartial = cancelDO.status === "PARTIALLY_DISPATCHED"
    setCancellingDO(true)
    try {
      const response = await fetch(`/api/delivery-orders/${cancelDO.id}/cancel`, { method: "POST" })
      if (response.ok) {
        toast.success(wasPartial ? "Balance cancelled and reserved stock released" : "Delivery order cancelled and stock released")
        refetch()
        return
      }
      const data = await response.json().catch(() => ({ error: "Failed" }))
      toast.error(data.error || "Failed to cancel delivery order")
    } finally {
      setCancellingDO(false)
      setCancelDO(null)
    }
  }

  // Load returns/exchanges booked against the DO currently open in the details panel.
  const loadDoReturns = (doId: string) => {
    fetch(`/api/sales-returns?doId=${doId}`)
      .then((r) => r.json())
      .then((d) => setDoReturns(Array.isArray(d) ? d : []))
      .catch(() => setDoReturns([]))
  }
  useEffect(() => {
    if (!selectedDelivery) { setDoReturns(null); return }
    setDoReturns(null)
    loadDoReturns(selectedDelivery.id)
  }, [selectedDelivery])

  const handleVoidReturn = async () => {
    if (!voidReturnRow) return
    setVoidingReturn(true)
    try {
      const res = await fetch(`/api/sales-returns/${voidReturnRow.id}/void`, { method: "POST" })
      if (res.ok) {
        toast.success(`${voidReturnRow.returnNumber} voided — stock & credit reversed`)
        refetch()
        if (selectedDelivery) loadDoReturns(selectedDelivery.id)
      } else {
        const data = await res.json().catch(() => ({ error: "Failed" }))
        toast.error(data.error || "Failed to void return")
      }
    } finally {
      setVoidingReturn(false)
      setVoidReturnRow(null)
    }
  }

  const openReturnModal = async (row: DeliveryOrder) => {
    setReturnDO(row)
    setReturnRows(null)
    setReturnType("RETURN")
    setReturnReason("")
    setReturnQtys({})
    setReturnRates({})
    try {
      const res = await fetch(`/api/delivery-orders/${row.id}`)
      if (!res.ok) throw new Error()
      const detail = await res.json()
      const rows: ReturnableRow[] = (detail.returnableByProduct || []).filter((r: ReturnableRow) => r.returnable > 0)
      if (!rows.length) {
        toast.error("Nothing is returnable on this delivery order")
        setReturnDO(null)
        return
      }
      setReturnRows(rows)
      const q: Record<string, string> = {}
      const rt: Record<string, string> = {}
      for (const r of rows) {
        q[r.productId] = "0"
        rt[r.productId] = String(r.ratePerWatt || 0)
      }
      setReturnQtys(q)
      setReturnRates(rt)
    } catch {
      toast.error("Failed to load delivery order")
      setReturnDO(null)
    }
  }

  const returnLineCredit = (r: ReturnableRow) => {
    const qty = parseInt(returnQtys[r.productId] || "0") || 0
    const rate = parseFloat(returnRates[r.productId] || "0") || 0
    return Math.round(qty * r.wattsPerPanel * rate)
  }
  const returnCreditTotal = (returnRows || []).reduce((s, r) => s + returnLineCredit(r), 0)

  const submitReturn = async () => {
    if (!returnDO || !returnRows) return
    const over = returnRows.find((r) => (parseInt(returnQtys[r.productId] || "0") || 0) > r.returnable)
    if (over) return toast.error(`Cannot return more than ${over.returnable} of ${over.productName}`)
    const lines = returnRows
      .map((r) => ({
        productId: r.productId,
        quantity: parseInt(returnQtys[r.productId] || "0") || 0,
        ratePerWatt: parseFloat(returnRates[r.productId] || "0") || 0,
      }))
      .filter((l) => l.quantity > 0)
    if (!lines.length) return toast.error("Enter at least 1 panel to return")

    const soId = returnDO.soId
    const soNumber = returnDO.salesOrder.soNumber
    setSubmittingReturn(true)
    try {
      const res = await fetch(`/api/sales-returns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doId: returnDO.id, type: returnType, reason: returnReason, lines }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || "Failed to record return")
        return
      }
      toast.success(`${returnType === "EXCHANGE" ? "Exchange" : "Return"} ${data.returnNumber} recorded — stock restored & customer credited`)
      setReturnDO(null)
      setReturnRows(null)
      refetch()
      if (selectedDelivery) loadDoReturns(selectedDelivery.id)
      if (returnType === "EXCHANGE") setExchangeFollowUp({ soId, soNumber })
    } finally {
      setSubmittingReturn(false)
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

  // Shared by the 3-dot menu and the details panel footer
  const handleTransfer = async () => {
    if (!transferDO || !transferTargetId) return
    setTransferring(true)
    try {
      // A DO has no party of its own — it inherits from its SO, so we move the SO.
      const response = await fetch(`/api/sales-orders/${transferDO.soId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: transferTargetId }),
      })
      if (response.ok) {
        const data = await response.json()
        toast.success(`${data.soNumber} (and its DOs) moved to ${data.customerName}`)
        setTransferDO(null)
        setTransferTargetId("")
        refetch()
      } else {
        const data = await response.json().catch(() => ({ error: "Failed" }))
        toast.error(data.error || "Failed to change party")
      }
    } finally {
      setTransferring(false)
    }
  }

  const doRowActions = (row: DeliveryOrder): RowAction[] => {
    const actions: RowAction[] = [
      { label: "Print", icon: <Printer size={15} />, onClick: () => window.open(`/delivery/${row.id}/print`, "_blank") },
    ]
    const canWriteDelivery = can(accessOf(user), "delivery", "write")
    if (["PENDING", "AUTHORIZED"].includes(row.status) && canWriteDelivery) {
      actions.push({ label: "Edit DO", icon: <Pencil size={15} />, onClick: () => openEditModal(row) })
    }
    if (row.status === "PENDING" && canWriteDelivery) {
      actions.push({ label: "Authorize", icon: <CheckCircle size={15} />, onClick: () => handleAuthorize(row.id) })
    }
    if (["AUTHORIZED", "PARTIALLY_DISPATCHED"].includes(row.status) && canWriteDelivery) {
      actions.push({
        label: row.status === "PARTIALLY_DISPATCHED" ? "Lift More" : "Dispatch / Lift",
        icon: <Truck size={15} />,
        onClick: () => openDispatchModal(row),
      })
    }
    if (["PENDING", "AUTHORIZED"].includes(row.status) && canWriteDelivery) {
      actions.push({ label: "Cancel DO", icon: <XCircle size={15} />, danger: true, onClick: () => setCancelDO(row) })
    }
    // Partially lifted: can't void the whole DO, but can write off the un-lifted balance.
    if (row.status === "PARTIALLY_DISPATCHED" && canWriteDelivery) {
      actions.push({ label: "Cancel Balance", icon: <XCircle size={15} />, danger: true, onClick: () => setCancelDO(row) })
    }
    // Return / Exchange — bring dispatched goods back into stock and credit the customer.
    if (["DISPATCHED", "PARTIALLY_DISPATCHED"].includes(row.status) && canWriteDelivery) {
      actions.push({ label: "Return / Exchange", icon: <RotateCcw size={15} />, onClick: () => openReturnModal(row) })
    }
    // Change party — fix a mis-attributed order (moves the underlying SO + sibling DOs).
    if (row.status !== "CANCELLED" && canWriteDelivery && can(accessOf(user), "sales", "write")) {
      actions.push({
        label: "Change Party",
        icon: <ArrowLeftRight size={15} />,
        onClick: () => { setTransferDO(row); setTransferTargetId("") },
      })
    }
    return actions
  }

  const columns = [
    { key: "doNumber", header: "DO Number", sortable: true, render: (row: DeliveryOrder) => <span className="font-medium">{row.doNumber}</span> },
    { key: "createdAt", header: "Date", sortable: true, numeric: true, value: (row: DeliveryOrder) => row.createdAt, render: (row: DeliveryOrder) => <span className="whitespace-nowrap">{formatDate(row.createdAt)}</span> },
    { key: "referenceNo", header: "Ref. DO #", sortable: true, value: (row: DeliveryOrder) => row.referenceNo || "", render: (row: DeliveryOrder) => row.referenceNo ? <span className="text-secondary">{row.referenceNo}</span> : <span className="text-tertiary">—</span> },
    { key: "soNumber", header: "SO Number", sortable: true, value: (row: DeliveryOrder) => row.salesOrder.soNumber, render: (row: DeliveryOrder) => row.salesOrder.soNumber },
    { key: "party", header: "Party", sortable: true, value: (row: DeliveryOrder) => row.salesOrder.customer.name, render: (row: DeliveryOrder) => <span className="font-medium">{row.salesOrder.customer.name}</span> },
    {
      key: "ratePerWatt", header: "Rate / Watt", sortable: true, numeric: true,
      value: (row: DeliveryOrder) => row.salesOrder.lines?.[0]?.ratePerWatt ?? 0,
      render: (row: DeliveryOrder) => {
        const r = rateDisplay(row)
        return r ? <span className="font-medium text-blue-700 dark:text-blue-300 whitespace-nowrap">{r}</span> : <span className="text-tertiary">—</span>
      },
    },
    { key: "quantity", header: "Ordered", numeric: true, render: (row: DeliveryOrder) => row.quantity.toLocaleString() },
    { key: "liftedQuantity", header: "Lifted", numeric: true, render: (row: DeliveryOrder) => <span className={row.liftedQuantity > 0 ? "text-emerald-700 dark:text-emerald-300 font-medium" : "text-tertiary"}>{row.liftedQuantity.toLocaleString()}</span> },
    { key: "balanceQuantity", header: "Balance", numeric: true, render: (row: DeliveryOrder) => <span className={row.balanceQuantity > 0 ? "text-amber-700 dark:text-amber-300 font-medium" : "text-tertiary"}>{row.balanceQuantity.toLocaleString()}</span> },
    { key: "agingDays", header: "Age", numeric: true, render: (row: DeliveryOrder) => `${row.agingDays}d` },
    { key: "status", header: "Status", render: (row: DeliveryOrder) => <Badge status={row.status} /> },
    { key: "authorizedBy", header: "Authorized By", render: (row: DeliveryOrder) => row.authorizedBy || "-" },
    {
      key: "actions", header: "Actions",
      render: (row: DeliveryOrder) => (
        <RowActionsMenu
          actions={[
            { label: "View Details", icon: <Eye size={15} />, onClick: () => setSelectedDelivery(row) },
            ...doRowActions(row),
          ]}
        />
      ),
    },
  ]

  if (loading) return <TableSkeleton columns={7} rows={10} />

  return (
    <div className="space-y-6">

      <Header
        title="Delivery Orders"
        actions={<Button onClick={() => setShowCreate(true)}><Plus size={16} className="mr-2" />New DO</Button>}
      />

      <div className="bg-surface rounded-xl shadow-card border border-line">
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

      {/* ── Cancel confirmation (handles both full cancel and balance write-off) ── */}
      <ConfirmDialog
        isOpen={Boolean(cancelDO)}
        onClose={() => setCancelDO(null)}
        onConfirm={handleCancel}
        loading={cancellingDO}
        title={
          cancelDO?.status === "PARTIALLY_DISPATCHED"
            ? `Cancel Balance — ${cancelDO?.doNumber || ""}`
            : `Cancel Delivery Order — ${cancelDO?.doNumber || ""}`
        }
        confirmLabel={cancelDO?.status === "PARTIALLY_DISPATCHED" ? "Cancel Balance" : "Cancel Delivery Order"}
        cancelLabel="Keep DO"
        message={
          cancelDO?.status === "PARTIALLY_DISPATCHED" ? (
            <span>
              Write off the un-lifted balance of <strong>{cancelDO?.balanceQuantity.toLocaleString()} panels</strong> on{" "}
              <strong>{cancelDO?.doNumber}</strong>? The {cancelDO?.liftedQuantity.toLocaleString()} already lifted stay
              delivered; the reserved balance is released and returns to the sales order&apos;s remaining quantity.
            </span>
          ) : (
            <span>
              Cancel <strong>{cancelDO?.doNumber}</strong> for <strong>{cancelDO?.salesOrder.customer.name}</strong> (
              {cancelDO?.quantity.toLocaleString()} panels)?
              <br />
              Reserved stock will be released back to the warehouse.
            </span>
          )
        }
      />

      {/* ── Change Party — reassigns the underlying SO (and its sibling DOs) ── */}
      <Modal
        isOpen={Boolean(transferDO)}
        onClose={() => { if (!transferring) { setTransferDO(null); setTransferTargetId("") } }}
        title={`Change Party — ${transferDO?.doNumber || ""}`}
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-line bg-muted/40 p-3 text-[13px] text-secondary">
            This DO belongs to <strong className="text-foreground">{transferDO?.salesOrder.soNumber}</strong>, currently on{" "}
            <strong className="text-foreground">{transferDO?.salesOrder.customer.name}</strong>. Since a delivery order takes
            its party from its sales order, moving it reassigns <strong className="text-foreground">{transferDO?.salesOrder.soNumber}</strong>{" "}
            and every delivery order under it. Stock is untouched and balances update automatically.
          </div>
          <SearchableSelect
            label="Move to customer"
            required
            placeholder="Search the correct party…"
            value={transferTargetId}
            onChange={setTransferTargetId}
            options={(customers || [])
              .filter((c) => c.name !== transferDO?.salesOrder.customer.name && c.active !== false)
              .map((c) => ({ value: c.id, label: c.name, sublabel: c.contactPhone || c.type }))}
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => { setTransferDO(null); setTransferTargetId("") }} disabled={transferring}>
              Cancel
            </Button>
            <Button onClick={handleTransfer} loading={transferring} disabled={!transferTargetId}>
              Move Sales Order
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Return / Exchange Modal ── */}
      <Modal
        isOpen={Boolean(returnDO)}
        onClose={() => { if (!submittingReturn) { setReturnDO(null); setReturnRows(null) } }}
        title={`Return / Exchange — ${returnDO?.doNumber || ""}`}
        size="lg"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-rose-100 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 p-4">
            <p className="text-sm font-semibold text-rose-900 dark:text-rose-300">Bring dispatched goods back &amp; credit the customer</p>
            <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
              Returned panels go back to their original warehouse and cost layer. A credit note reduces the
              customer&apos;s balance. For an <strong>exchange</strong>, edit the sales order afterwards to add the
              replacement item and issue a new delivery order.
            </p>
          </div>

          <div className="flex gap-2">
            {(["RETURN", "EXCHANGE"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setReturnType(t)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                  returnType === t ? "border-rose-400 bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200" : "border-line text-secondary hover:bg-muted"
                }`}
              >
                {t === "RETURN" ? "Return" : "Exchange"}
              </button>
            ))}
          </div>

          {!returnRows ? (
            <p className="py-6 text-center text-sm text-secondary">Loading returnable items…</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs text-secondary">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2 text-right">Returnable</th>
                    <th className="px-3 py-2 text-right">Return Qty</th>
                    <th className="px-3 py-2 text-right">Rate / Watt</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {returnRows.map((r) => (
                    <tr key={r.productId} className="border-t border-line">
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{r.productName}</div>
                        <div className="text-xs text-tertiary">{r.wattage}W</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.returnable.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          max={r.returnable}
                          value={returnQtys[r.productId] ?? "0"}
                          onChange={(e) => setReturnQtys((cur) => ({ ...cur, [r.productId]: e.target.value }))}
                          className="w-20 rounded-md border border-line bg-elevated px-2 py-1 text-right"
                          title="Return quantity"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={returnRates[r.productId] ?? "0"}
                          onChange={(e) => setReturnRates((cur) => ({ ...cur, [r.productId]: e.target.value }))}
                          className="w-24 rounded-md border border-line bg-elevated px-2 py-1 text-right"
                          title="Credit rate per watt"
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{formatAmount(returnLineCredit(r))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line bg-muted/50 font-semibold">
                    <td className="px-3 py-2" colSpan={4}>Total credit</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatAmount(returnCreditTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <Input
            label="Reason (optional)"
            placeholder="e.g. damaged in transit, wrong item"
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
          />

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => { setReturnDO(null); setReturnRows(null) }} disabled={submittingReturn}>
              Cancel
            </Button>
            <Button
              onClick={submitReturn}
              loading={submittingReturn}
              disabled={!returnRows || returnRows.every((r) => (parseInt(returnQtys[r.productId] || "0") || 0) === 0)}
            >
              {returnType === "EXCHANGE" ? "Record Exchange" : "Record Return"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Exchange follow-up — guide the admin to book the replacement value on the SO */}
      <ConfirmDialog
        isOpen={Boolean(exchangeFollowUp)}
        onClose={() => setExchangeFollowUp(null)}
        onConfirm={() => {
          const so = exchangeFollowUp
          setExchangeFollowUp(null)
          if (so) window.location.href = `/sales?editId=${so.soId}`
        }}
        title="Book the replacement item"
        variant="primary"
        confirmLabel="Edit Sales Order"
        message={
          <span>
            The returned goods are back in stock and the customer has been credited. To send the replacement,
            edit <strong>{exchangeFollowUp?.soNumber}</strong> to add/adjust the replacement line, then create a new
            delivery order for it.
          </span>
        }
      />

      {/* Void a return / exchange */}
      <ConfirmDialog
        isOpen={Boolean(voidReturnRow)}
        onClose={() => setVoidReturnRow(null)}
        onConfirm={handleVoidReturn}
        loading={voidingReturn}
        title={`Void ${voidReturnRow?.returnNumber || ""}`}
        confirmLabel="Void Return"
        cancelLabel="Keep"
        message={
          <span>
            Voiding removes the {voidReturnRow?.lines.reduce((s, l) => s + l.quantity, 0).toLocaleString()} returned
            panel(s) from stock again and reverses the {formatAmount(voidReturnRow?.creditAmount || 0)} credit. Only
            possible while the returned stock is still available.
          </span>
        }
      />

      {/* ── Create / Edit DO Modal ── */}
      <Modal
        isOpen={showCreate}
        onClose={closeModal}
        title={editDO ? `Edit Delivery Order — ${editDO.doNumber}` : "Create Delivery Order"}
        size="lg"
      >
        <div className="space-y-4">
          <div className={`rounded-xl border p-4 ${editDO ? "border-amber-100 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10" : "border-blue-100 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10"}`}>
            {editDO ? (
              <>
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">Editing re-plans the stock reservation</p>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  The current reservation is released and stock is re-reserved for the new quantities/warehouse.
                  An authorized DO goes back to PENDING and needs re-authorization.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-300">Reserve stock from a payment-confirmed sales order</p>
                <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                  You can create multiple delivery orders for one sales order — useful for partial shipments.
                  Stock is reserved immediately and held until dispatch or cancellation.
                </p>
              </>
            )}
          </div>

          {editDO ? (
            <div className="rounded-lg border border-line bg-muted px-3 py-2.5">
              <p className="text-xs text-secondary">Sales Order</p>
              <p className="text-sm font-semibold text-foreground">
                {selectedOrder ? `${selectedOrder.soNumber} — ${selectedOrder.customer.name}` : editDO.salesOrder.soNumber}
              </p>
            </div>
          ) : (
            <SearchableSelect
              label="Sales Order"
              required
              placeholder="Type SO # or party name to search…"
              options={eligibleSOs.map((o) => ({ value: o.id, label: `${o.soNumber} — ${o.customer.name}`, sublabel: o.status.replace(/_/g, " ") }))}
              value={form.soId}
              onChange={(soId) => setForm((prev) => ({ ...prev, soId }))}
            />
          )}

          {selectedOrder && (
            <div className="rounded-xl border border-line bg-muted p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">{selectedOrder.soNumber}</p>
                  <p className="text-sm text-secondary">{selectedOrder.customer.name}</p>
                </div>
                <Badge status={selectedOrder.status} />
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg bg-surface p-3">
                  <p className="text-xs text-secondary">Total Panels</p>
                  <p className="text-xl font-semibold text-foreground">{orderTotalPanels.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-surface p-3">
                  <p className="text-xs text-secondary">Committed / Closed</p>
                  <p className="text-xl font-semibold text-orange-600 dark:text-orange-300">{Math.max(0, orderTotalPanels - remainingPanels).toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-surface border-2 border-green-200 dark:border-green-500/30 p-3">
                  <p className="text-xs text-secondary">Remaining</p>
                  <p className="text-xl font-semibold text-green-700 dark:text-green-300">{remainingPanels.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-surface border-2 border-blue-200 dark:border-blue-500/30 p-3">
                  <p className="text-xs text-secondary">Rate / Watt</p>
                  <p className="text-xl font-semibold text-blue-700 dark:text-blue-300">{soRateDisplay(selectedOrder) || "—"}</p>
                </div>
              </div>

              <div className="space-y-1">
                {selectedOrder.lines.map((line, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-foreground">{line.product.name}</p>
                      <p className="text-xs text-secondary">{line.product.wattage}W · Rs {line.ratePerWatt?.toFixed(2)}/W</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-foreground">{line.quantity.toLocaleString()} panels</p>
                      <p className="text-xs text-secondary">{line.watts.toLocaleString()} W</p>
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
              <p className="text-sm font-medium text-secondary">
                Panels to Deliver — per product
                {remainingPanels > 0 && <span className="text-tertiary font-normal"> (max {remainingPanels} remaining)</span>}
              </p>
              {selectedOrder.lines.map((line, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-line bg-muted px-3 py-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{line.product.name}</p>
                    <p className="text-xs text-secondary">{line.product.wattage}W · ordered {line.quantity.toLocaleString()} panels</p>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={line.quantity}
                    value={lineQtys[i] ?? ""}
                    onChange={(e) => setLineQtys((prev) => ({ ...prev, [i]: e.target.value }))}
                    placeholder="0"
                    className="w-24 rounded-lg border border-line-strong px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
              {requestedQty > 0 && (
                <div className="flex items-center justify-between rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 px-3 py-2 text-sm">
                  <span className="text-blue-700 dark:text-blue-300 font-medium">Total panels this DO:</span>
                  <span className="font-bold text-blue-900 dark:text-blue-300">{requestedQty.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          {selectedOrder && requestedQty > 0 && requestedQty < remainingPanels && (
            <div className="rounded-lg border border-yellow-200 dark:border-yellow-500/30 bg-yellow-50 dark:bg-yellow-500/10 p-3 text-sm text-yellow-800 dark:text-yellow-300">
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
            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>
              {editDO ? "Save Changes and Re-reserve Stock" : "Create DO and Reserve Stock"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Details slide-over: every DO field + the row's actions ── */}
      <DetailsModal
        isOpen={Boolean(selectedDelivery)}
        onClose={() => setSelectedDelivery(null)}
        title={`Delivery Order — ${selectedDelivery?.doNumber || ""}`}
        fields={selectedDelivery ? [
          { label: "Status", value: <Badge status={selectedDelivery.status} /> },
          { label: "Created", value: formatDate(selectedDelivery.createdAt) },
          { label: "Customer", value: selectedDelivery.salesOrder.customer.name },
          { label: "Sales Order", value: selectedDelivery.salesOrder.soNumber },
          { label: "Reference DO #", value: selectedDelivery.referenceNo },
          { label: "Warehouse", value: selectedDelivery.warehouse.name },
          { label: "Rate / Watt", value: rateDisplay(selectedDelivery) },
          { label: "Validity", value: selectedDelivery.validityDays ? `${selectedDelivery.validityDays} days` : null },
          { label: "Authorized By", value: selectedDelivery.authorizedBy },
          { label: "Dispatched At", value: selectedDelivery.dispatchedAt ? formatDate(selectedDelivery.dispatchedAt) : null },
          ...(selectedDelivery.notes ? [{ label: "Notes", value: selectedDelivery.notes, wide: true }] : []),
        ] : []}
        actions={selectedDelivery ? doRowActions(selectedDelivery) : []}
      >
        {selectedDelivery ? (
          <div className="space-y-5">
            {/* Delivery progress */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-tertiary mb-2">Delivery Progress</p>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { label: "Ordered", value: selectedDelivery.quantity, tone: "text-foreground" },
                  { label: "Lifted", value: selectedDelivery.liftedQuantity, tone: "text-emerald-600 dark:text-emerald-300" },
                  { label: "Balance", value: selectedDelivery.balanceQuantity, tone: "text-amber-600 dark:text-amber-300" },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-line bg-muted px-3 py-2.5 text-center">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-tertiary">{s.label}</p>
                    <p className={`mt-0.5 text-xl font-bold tabular-nums ${s.tone}`}>{s.value.toLocaleString()}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-tertiary">
                {selectedDelivery.totalPallets.toLocaleString()} pallets · {selectedDelivery.watts.toLocaleString()} watts ·{" "}
                {selectedDelivery.reservedBatches} reserved batch{selectedDelivery.reservedBatches === 1 ? "" : "es"} ·{" "}
                {selectedDelivery.agingDays}d old
              </p>
            </div>

            {/* Line items */}
            {selectedDelivery.lines?.length ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-tertiary mb-1.5">Line Items</p>
                <div className="rounded-lg border border-line overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-xs text-secondary uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">Product</th>
                        <th className="px-3 py-2 text-right">Panels</th>
                        <th className="px-3 py-2 text-right">Watts</th>
                        <th className="px-3 py-2 text-right">Pallets</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {selectedDelivery.lines.map((l, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2">
                            {l.product?.name ?? "—"}
                            {l.product?.wattage ? <span className="text-tertiary"> ({l.product.wattage}W)</span> : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{l.quantity.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{l.watts.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {(l.product ? computePallets(l.quantity, l.product) : 0).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {/* Returns / Exchanges booked against this DO */}
            {doReturns && doReturns.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-tertiary mb-1.5">Returns / Exchanges</p>
                <div className="rounded-lg border border-line overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-xs text-secondary uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">Return #</th>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-right">Panels</th>
                        <th className="px-3 py-2 text-right">Credit</th>
                        <th className="px-3 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {doReturns.map((r) => (
                        <tr key={r.id} className={r.status === "VOID" ? "opacity-50" : ""}>
                          <td className="px-3 py-2">
                            <span className="font-medium">{r.returnNumber}</span>
                            <span className="block text-[11px] text-tertiary">{formatDate(r.returnDate)}</span>
                          </td>
                          <td className="px-3 py-2">
                            <Badge status={r.status === "VOID" ? "VOID" : r.type} />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.lines.reduce((s, l) => s + l.quantity, 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-300">{formatAmount(r.creditAmount)}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                title="Print credit note"
                                onClick={() => window.open(`/sales-returns/${r.id}/print`, "_blank")}
                                className="rounded-md p-1.5 text-secondary hover:bg-muted"
                              >
                                <Printer size={14} />
                              </button>
                              {r.status === "COMPLETED" && can(accessOf(user), "delivery", "write") ? (
                                <button
                                  type="button"
                                  title="Void return"
                                  onClick={() => setVoidReturnRow(r)}
                                  className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                                >
                                  <XCircle size={14} />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </DetailsModal>

      {/* ── Dispatch / Lift modal (full or partial) ── */}
      <Modal
        isOpen={Boolean(dispatchDO)}
        onClose={() => setDispatchDO(null)}
        title={`Dispatch / Lift — ${dispatchDO?.doNumber || ""}`}
        size="lg"
      >
        {!dispatchProgress ? (
          <div className="py-10 text-center text-sm text-tertiary">Loading delivery order…</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 p-3 text-sm text-blue-800 dark:text-blue-300">
              Enter how many panels are being lifted now. Leave the defaults to dispatch the full balance, or reduce them
              for a partial lift — the remaining balance stays reserved for a later lift.
            </div>

            <div className="rounded-lg border border-line overflow-hidden">
              <div className="grid grid-cols-[1fr_72px_72px_96px] items-center bg-muted px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-secondary">
                <span>Product</span>
                <span className="text-right">Ordered</span>
                <span className="text-right">Balance</span>
                <span className="text-right">Lift now</span>
              </div>
              {dispatchProgress.map((p) => (
                <div
                  key={p.productId}
                  className="grid grid-cols-[1fr_72px_72px_96px] items-center border-t border-line px-3 py-2 text-sm"
                >
                  <span className="text-secondary">
                    {p.productName} <span className="text-tertiary">({p.wattage}W)</span>
                    {p.lifted > 0 && <span className="ml-1 text-xs text-emerald-600 dark:text-emerald-300">· {p.lifted.toLocaleString()} lifted</span>}
                  </span>
                  <span className="text-right tabular-nums text-secondary">{p.ordered.toLocaleString()}</span>
                  <span className="text-right tabular-nums text-amber-700 dark:text-amber-300">{p.balance.toLocaleString()}</span>
                  <span className="flex justify-end">
                    <Input
                      type="number"
                      min={0}
                      max={p.balance}
                      value={liftQtys[p.productId] ?? ""}
                      onChange={(e) => setLiftQtys((q) => ({ ...q, [p.productId]: e.target.value }))}
                      className="w-20 text-right"
                      disabled={p.balance === 0}
                    />
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted border border-line px-3 py-2 text-sm">
              <span className="text-secondary">Total lifting now</span>
              <span className="font-semibold text-foreground tabular-nums">
                {liftTotal.toLocaleString()} / {liftBalanceTotal.toLocaleString()} balance
              </span>
            </div>

            {liftTotal > 0 && liftTotal < liftBalanceTotal && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                Partial lift: {(liftBalanceTotal - liftTotal).toLocaleString()} panels will remain as balance on this DO.
              </div>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <Button variant="secondary" onClick={() => setDispatchDO(null)}>
                Cancel
              </Button>
              <Button onClick={submitDispatch} loading={dispatching} disabled={liftTotal <= 0}>
                {liftTotal >= liftBalanceTotal ? "Dispatch Full Balance" : "Lift Selected"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
