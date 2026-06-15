"use client"

import { type ChangeEvent, useDeferredValue, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { useSearchParams } from "next/navigation"
import toast from "react-hot-toast"
import { CheckCircle, Eye, Pencil, Plus, Trash2, Truck, Upload } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { SearchableSelect } from "@/components/ui/SearchableSelect"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu"
import { DetailsModal } from "@/components/ui/DetailsModal"
import { Badge } from "@/components/ui/Badge"
import { Modal } from "@/components/ui/Modal"
import { Table } from "@/components/ui/Table"
import { CsvImport } from "@/components/ui/CsvImport"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { formatAmount, formatCurrency, formatDate, formatNumber, statusRowClass } from "@/lib/utils"
import { useFetch } from "@/hooks/useFetch"
import { useLookups } from "@/components/lookups/LookupsProvider"
import { useAuth, accessOf } from "@/hooks/useAuth"
import { can } from "@/lib/permissions/modules"

interface SalesOrder {
  id: string
  soNumber: string
  customer: { name: string; creditLimit: number | null }
  grandTotal: number
  status: string
  paymentTerms: string
  createdAt: string
  orderDate: string
  gstRate: number
  subTotal: number
  gstAmount: number
  paymentProofUrl: string | null
  lines?: Array<{
    productId: string
    quantity: number
    watts: number
    ratePerWatt: number
    ratePerPanel: number
    totalAmount: number
    product: { brand: string; wattage: number; panelsPerContainer: number | null; palletsPerContainer: number | null }
  }>
  deliveryOrders?: Array<{
    id: string
    doNumber: string
    status: string
    quantity: number
    liftedQuantity: number
    balanceQuantity: number
  }>
  remainingPanels?: number
  balanceCancelledQty?: number
  totalPanels?: number
  totalPallets?: number
  totalWatts?: number
  customerId?: string
  customerType?: string
  paymentTerms2?: string
  gstInvoice?: boolean
  notes?: string
}

interface CustomerOption {
  id: string
  name: string
  type: string
  creditLimit: number | null
  paymentTerms: string
  contactPhone: string | null
}

interface ProductOption {
  id: string
  code: string
  name: string
  skuName: string | null
  brand: string
  wattage: number
  panelsPerContainer: number | null
  palletsPerContainer: number | null
}

interface DraftLine {
  productId: string
  quantityMode: "PANELS" | "PALLETS"
  quantity: string
  ratePerWatt: string
}

const LAST_PRODUCT_KEY = "garibsons-solar:last-product-id"

const emptyOrderForm = {
  customerId: "",
  customerType: "DIRECT",
  paymentTerms: "FULL_PAYMENT",
  gstInvoice: false,
  gstRate: "18",
  notes: "",
  orderDate: new Date().toISOString().split("T")[0],
}

function getPanelsPerPallet(product?: ProductOption) {
  if (!product?.panelsPerContainer || !product?.palletsPerContainer) return 0
  if (product.palletsPerContainer <= 0) return 0
  return product.panelsPerContainer / product.palletsPerContainer
}

export default function SalesPage() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const quotationId = searchParams.get("quotationId")

  const { data: orders, loading, refetch } = useFetch<SalesOrder[]>("/api/sales-orders")
  const lookups = useLookups()
  const customers = lookups.customers as CustomerOption[]
  const products = lookups.products as ProductOption[]
  const { data: quotation } = useFetch<{
    id: string
    customerId: string
    lines: Array<{ productId: string; quantity: number; ratePerWatt: number }>
  }>(quotationId ? `/api/quotations/${quotationId}` : "")

  const [showCreate, setShowCreate] = useState(Boolean(quotationId))
  const [editOrderId, setEditOrderId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingProof, setUploadingProof] = useState<string | null>(null)
  const [viewProof, setViewProof] = useState<{ url: string; soNumber: string } | null>(null)
  const [customerQuery, setCustomerQuery] = useState("")
  const [customerBalance, setCustomerBalance] = useState<{ totalCollected: number; totalSOValue: number; balance: number } | null>(null)
  const [form, setForm] = useState(emptyOrderForm)
  const [lines, setLines] = useState<DraftLine[]>([
    { productId: "", quantityMode: "PANELS", quantity: "", ratePerWatt: "" },
  ])
  const [pendingUploadId, setPendingUploadId] = useState<string | null>(null)
  const [cancelOrder, setCancelOrder] = useState<SalesOrder | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [balanceOrder, setBalanceOrder] = useState<SalesOrder | null>(null)
  const [cancellingBalance, setCancellingBalance] = useState(false)
  const [detailRow, setDetailRow] = useState<SalesOrder | null>(null)
  const [lastUsedProductId, setLastUsedProductId] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const deferredCustomerQuery = useDeferredValue(customerQuery)
  const selectedCustomer = customers?.find((c) => c.id === form.customerId) || null

  useEffect(() => {
    const savedProductId = window.localStorage.getItem(LAST_PRODUCT_KEY)
    if (savedProductId) setLastUsedProductId(savedProductId)
  }, [])

  useEffect(() => {
    const firstProductId = lines[0]?.productId
    if (!firstProductId) return
    window.localStorage.setItem(LAST_PRODUCT_KEY, firstProductId)
    setLastUsedProductId(firstProductId)
  }, [lines])

  useEffect(() => {
    if (!quotation || !customers || !products) return
    const quotationCustomer = customers.find((c) => c.id === quotation.customerId)
    setForm((cur) => ({
      ...cur,
      customerId: quotation.customerId,
      customerType: quotationCustomer?.type || cur.customerType,
      paymentTerms: quotationCustomer?.paymentTerms || cur.paymentTerms,
    }))
    setCustomerQuery(quotationCustomer?.name || "")
    setLines(
      quotation.lines.map((line) => ({
        productId: line.productId,
        quantityMode: "PANELS" as const,
        quantity: String(line.quantity),
        ratePerWatt: String(line.ratePerWatt),
      }))
    )
    setShowCreate(true)
  }, [customers, products, quotation])

  const customerResults =
    deferredCustomerQuery.trim().length === 0
      ? []
      : (customers || []).filter((c) =>
          `${c.name} ${c.contactPhone || ""}`.toLowerCase().includes(deferredCustomerQuery.toLowerCase())
        )

  const computedLines = lines.map((line) => {
    const product = products?.find((p) => p.id === line.productId)
    const panelsPerPallet = getPanelsPerPallet(product)
    const quantityValue = parseFloat(line.quantity) || 0
    const quantity =
      line.quantityMode === "PALLETS" ? Math.round(quantityValue * panelsPerPallet) : Math.round(quantityValue)
    const pallets = line.quantityMode === "PALLETS" ? quantityValue : panelsPerPallet > 0 ? quantity / panelsPerPallet : 0
    const watts = quantity * (product?.wattage || 0)
    const ratePerWatt = parseFloat(line.ratePerWatt) || 0
    const ratePerPanel = ratePerWatt * (product?.wattage || 0)
    const totalAmount = ratePerPanel * quantity
    return {
      ...line,
      product,
      quantity,
      pallets,
      watts,
      ratePerWatt,
      ratePerPanel,
      totalAmount,
      panelsPerPallet,
      invalidPallets: line.quantityMode === "PALLETS" && panelsPerPallet <= 0,
    }
  })

  const subTotal = computedLines.reduce((t, l) => t + l.totalAmount, 0)
  const totalPanels = computedLines.reduce((t, l) => t + l.quantity, 0)
  const totalWatts = computedLines.reduce((t, l) => t + l.watts, 0)
  const gstRate = form.gstInvoice ? (parseFloat(form.gstRate) || 0) : 0
  const gstAmount = subTotal * (gstRate / 100)
  const grandTotal = subTotal + gstAmount

  const creditWarning =
    selectedCustomer?.creditLimit && grandTotal > selectedCustomer.creditLimit
      ? `Order value ${formatCurrency(grandTotal)} exceeds credit limit of ${formatCurrency(selectedCustomer.creditLimit)}`
      : null

  const buildBlankLine = (productId = ""): DraftLine => ({
    productId,
    quantityMode: "PANELS",
    quantity: "",
    ratePerWatt: "",
  })

  const resetOrderForm = () => {
    setForm(emptyOrderForm)
    setCustomerQuery("")
    setLines([buildBlankLine(lastUsedProductId)])
    setEditOrderId(null)
  }

  const openCreateModal = () => {
    if (!quotationId) resetOrderForm()
    setShowCreate(true)
  }

  const openEditModal = (order: SalesOrder) => {
    setEditOrderId(order.id)
    const customer = customers?.find((c) => c.id === order.customerId)
    setForm({
      customerId: order.customerId || "",
      customerType: order.customerType || "DIRECT",
      paymentTerms: order.paymentTerms || "FULL_PAYMENT",
      gstInvoice: (order.gstRate || 0) > 0,
      gstRate: order.gstRate > 0 ? String(order.gstRate) : "18",
      notes: order.notes || "",
      orderDate: (order.orderDate || order.createdAt || "").split("T")[0],
    })
    setCustomerQuery(customer?.name || order.customer?.name || "")
    setLines(
      (order.lines || []).map((l) => ({
        productId: l.productId,
        quantityMode: "PANELS" as const,
        quantity: String(l.quantity),
        ratePerWatt: String(l.ratePerWatt),
      }))
    )
    setShowCreate(true)
  }

  // Deep-link from Party Ledger: /sales?editId=<soId> opens the edit modal
  const editIdParam = searchParams.get("editId")
  const openedEditRef = useRef(false)
  useEffect(() => {
    if (!editIdParam || openedEditRef.current || !orders || !customers) return
    const order = orders.find((o) => o.id === editIdParam)
    if (!order) return
    openedEditRef.current = true
    if (!["DRAFT", "PENDING_PAYMENT", "PAYMENT_CONFIRMED"].includes(order.status)) {
      toast.error(`${order.soNumber} is ${order.status.replace(/_/g, " ")} — orders can be edited until a delivery order is issued`)
      return
    }
    openEditModal(order)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editIdParam, orders, customers])

  const addLine = () => setLines((cur) => [...cur, buildBlankLine(lastUsedProductId)])
  const removeLine = (i: number) => setLines((cur) => cur.filter((_, idx) => idx !== i))

  const updateLine = (i: number, next: Partial<DraftLine>) => {
    setLines((cur) => cur.map((line, idx) => (idx !== i ? line : { ...line, ...next })))
  }

  const selectCustomer = (customer: CustomerOption) => {
    setForm((cur) => ({
      ...cur,
      customerId: customer.id,
      customerType: customer.type,
      paymentTerms: customer.paymentTerms,
    }))
    setCustomerQuery(customer.name)
    setCustomerBalance(null)
    fetch(`/api/customers/${customer.id}/balance`)
      .then((r) => r.json())
      .then((data) => setCustomerBalance(data))
      .catch(() => {})
  }

  const handleSave = async () => {
    if (!form.customerId) return toast.error("Select a customer first")
    if (computedLines.some((l) => !l.productId || l.quantity <= 0 || l.ratePerWatt <= 0))
      return toast.error("Complete each line with product, quantity, and rate")
    if (computedLines.some((l) => l.invalidPallets))
      return toast.error("One or more SKUs do not have pallet configuration in product master")

    setSaving(true)
    try {
      const payload = {
        ...form,
        orderDate: form.orderDate || new Date().toISOString().split("T")[0],
        quotationId: quotationId || null,
        lines: computedLines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          watts: l.watts,
          ratePerWatt: l.ratePerWatt,
          ratePerPanel: l.ratePerPanel,
          totalAmount: l.totalAmount,
        })),
      }

      let response: Response
      if (editOrderId) {
        response = await fetch(`/api/sales-orders/${editOrderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, editLines: true }),
        })
      } else {
        response = await fetch("/api/sales-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      }

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || "Failed to save sales order")
        return
      }

      toast.success(editOrderId ? "Sales order updated" : "Sales order created")
      setShowCreate(false)
      resetOrderForm()
      refetch()
    } finally {
      setSaving(false)
    }
  }

  const handleConfirm = async (id: string) => {
    const response = await fetch(`/api/sales-orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAYMENT_CONFIRMED" }),
    })
    if (response.ok) { toast.success("Order confirmed"); refetch() }
    else toast.error("Failed to confirm order")
  }

  const handleCancel = async () => {
    if (!cancelOrder) return
    setCancelling(true)
    try {
      const response = await fetch(`/api/sales-orders/${cancelOrder.id}/cancel`, { method: "POST" })
      if (response.ok) {
        const data = await response.json()
        toast.success(
          data.cancelledDOs?.length
            ? `Order cancelled — DOs cancelled too: ${data.cancelledDOs.join(", ")}`
            : "Order cancelled"
        )
        refetch()
      } else {
        const data = await response.json().catch(() => ({ error: "Failed" }))
        toast.error(data.error || "Failed to cancel order")
      }
    } finally {
      setCancelling(false)
      setCancelOrder(null)
    }
  }

  const handleCancelBalance = async () => {
    if (!balanceOrder) return
    setCancellingBalance(true)
    try {
      const response = await fetch(`/api/sales-orders/${balanceOrder.id}/cancel-balance`, { method: "POST" })
      if (response.ok) {
        const data = await response.json()
        toast.success(`Closed ${Number(data.cancelledPanels || 0).toLocaleString()} undelivered panels`)
        refetch()
      } else {
        const data = await response.json().catch(() => ({ error: "Failed" }))
        toast.error(data.error || "Failed to cancel balance")
      }
    } finally {
      setCancellingBalance(false)
      setBalanceOrder(null)
    }
  }

  const handleVerifyPayment = async (id: string) => {
    const response = await fetch(`/api/sales-orders/${id}/verify-payment`, { method: "POST" })
    if (response.ok) { toast.success("Payment verified"); refetch() }
    else toast.error("Failed to verify payment")
  }

  const triggerProofUpload = (id: string) => {
    setPendingUploadId(id)
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !pendingUploadId) return

    setUploadingProof(pendingUploadId)
    try {
      const proofForm = new FormData()
      proofForm.append("file", file)
      const uploadResponse = await fetch("/api/upload", { method: "POST", body: proofForm })

      if (!uploadResponse.ok) {
        const error = await uploadResponse.json()
        toast.error(error.error || "Upload failed")
        return
      }

      const { url } = await uploadResponse.json()
      const linkResponse = await fetch(`/api/sales-orders/${pendingUploadId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PENDING_PAYMENT", paymentProofUrl: url }),
      })

      if (!linkResponse.ok) {
        toast.error("Failed to link payment proof")
        return
      }

      toast.success("Payment proof uploaded")
      refetch()
    } finally {
      setUploadingProof(null)
      setPendingUploadId(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  // Single source of truth for what you can do with an SO — drives both the
  // table's 3-dot menu and the details panel's footer buttons.
  const soRowActions = (row: SalesOrder): RowAction[] => {
    const actions: RowAction[] = []
    if (row.status === "DRAFT") {
      actions.push(
        { label: "Confirm Order", icon: <CheckCircle size={15} />, onClick: () => handleConfirm(row.id) },
        { label: "Upload Payment Proof", icon: <Upload size={15} />, onClick: () => triggerProofUpload(row.id), disabled: uploadingProof === row.id },
      )
    }
    // Editable until a DO is issued — no stock is reserved before that
    if (["DRAFT", "PENDING_PAYMENT", "PAYMENT_CONFIRMED"].includes(row.status)) {
      actions.push({ label: "Edit SO", icon: <Pencil size={15} />, onClick: () => openEditModal(row) })
    }
    if (row.paymentProofUrl) {
      actions.push({ label: "View Payment Proof", icon: <Eye size={15} />, onClick: () => setViewProof({ url: row.paymentProofUrl!, soNumber: row.soNumber }) })
    }
    if (row.status === "PENDING_PAYMENT" && can(accessOf(user), "sales", "write")) {
      actions.push({ label: "Verify Payment", icon: <CheckCircle size={15} />, onClick: () => handleVerifyPayment(row.id) })
    }
    const dos = row.deliveryOrders || []
    const activeDOs = dos.filter((d) => d.status !== "CANCELLED")
    const remaining = row.remainingPanels ?? 0
    const anyLifted = dos.some((d) => ["DISPATCHED", "PARTIALLY_DISPATCHED"].includes(d.status))

    // Create DO while there are panels left to deliver.
    if (["PAYMENT_CONFIRMED", "DO_ISSUED"].includes(row.status) && remaining > 0) {
      actions.push({ label: "Create DO", icon: <Truck size={15} />, onClick: () => (window.location.href = `/delivery?soId=${row.id}`) })
    }

    if (["DRAFT", "PENDING_PAYMENT", "PAYMENT_CONFIRMED", "DO_ISSUED"].includes(row.status)) {
      // Full void — only while nothing has been lifted.
      if (!anyLifted) {
        const label = activeDOs.length > 0 ? "Cancel SO (+ its DOs)" : "Cancel SO"
        actions.push({ label, icon: <Trash2 size={15} />, danger: true, onClick: () => setCancelOrder(row) })
      }
      // Close just the undelivered remainder whenever a DO already covers part of the SO.
      if (activeDOs.length > 0 && remaining > 0) {
        actions.push({ label: "Cancel SO Balance", icon: <Trash2 size={15} />, danger: true, onClick: () => setBalanceOrder(row) })
      }
    }
    return actions
  }

  const columns = [
    { key: "soNumber", header: "SO #", sortable: true },
    { key: "orderDate", header: "Date", numeric: true, render: (row: SalesOrder) => formatDate(row.orderDate || row.createdAt) },
    { key: "customer", header: "Customer", sortable: true, value: (row: SalesOrder) => row.customer?.name, render: (row: SalesOrder) => row.customer?.name },
    { key: "subTotal", header: "Sub Total (PKR)", numeric: true, render: (row: SalesOrder) => formatAmount(row.subTotal) },
    {
      key: "ratePerWatt",
      header: "Rate / Watt",
      sortable: true,
      numeric: true,
      value: (row: SalesOrder) => row.lines?.[0]?.ratePerWatt ?? 0,
      render: (row: SalesOrder) => {
        const rates = [...new Set((row.lines || []).map((l) => l.ratePerWatt))].sort((a, b) => a - b)
        if (rates.length === 0) return <span className="text-gray-400">—</span>
        return (
          <span className="font-medium text-blue-700 whitespace-nowrap">
            {rates.length === 1 ? rates[0].toFixed(2) : `${rates[0].toFixed(2)}–${rates[rates.length - 1].toFixed(2)}`}
          </span>
        )
      },
    },
    { key: "grandTotal", header: "Grand Total (PKR)", numeric: true, render: (row: SalesOrder) => <span className="font-bold">{formatAmount(row.grandTotal)}</span> },
    { key: "paymentTerms", header: "Terms", render: (row: SalesOrder) => row.paymentTerms.replace(/_/g, " ") },
    { key: "status", header: "Status", render: (row: SalesOrder) => <Badge status={row.status} /> },
    {
      key: "actions",
      header: "Actions",
      render: (row: SalesOrder) => <RowActionsMenu actions={soRowActions(row)} />,
    },
  ]

  if (loading) return <TableSkeleton columns={7} rows={10} />

  return (
    <div className="space-y-6">

      <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" title="Upload payment proof" onChange={handleFileChange} />

      <Header
        title="Sales Orders"
        actions={
          <div className="flex gap-2">
            <CsvImport
              endpoint="/api/import/sales-delivery"
              title="Import Sales & Delivery"
              sampleName="sales-delivery"
              guide='Date format: DD-MM-YYYY (e.g. 09-06-2026 = 9 June). Each row is one sales order. Remarks "DO issued" (or a DO #) marks it delivered → creates a delivery order and deducts stock; "SO" rows with blank DO # are pending orders. Load stock (incl. purchases) first.'
              sampleColumns={["Remarks", "DO #", "Date", "Party Name", "Qty Pallets", "Qty Panels", "Qty Watts", "Rate Watts", "Value Sale", "Item", "Watt/P"]}
              sampleRows={[
                ["FORMAT → \"DO issued\" or \"SO\"", "Number — blank if pending SO", "DD-MM-YYYY (01-05-2026 = 1 May)", "Exact party name as in system", "Number", "Number", "Number", "Number (e.g. 38.75)", "Number only — no commas", "Exact product name as in system", "Number (e.g. 665)"],
                ["DO issued", "543", "01-05-2026", "FD Solar", "1", "36", "23940", "38.75", "927675", "Aiko - 665 BF", "665"],
                ["DO issued", "544", "02-05-2026", "GS Islamabad", "8", "288", "191520", "38", "7277760", "Aiko - 665 BF", "665"],
                ["SO", "", "09-06-2026", "Onyx Solar", "20", "720", "468000", "37.5", "17550000", "Longi Himo 10 - 650 MF", "650"],
              ]}
              onComplete={refetch}
            />
            <Button onClick={openCreateModal}>
              <Plus size={16} className="mr-2" />
              Quick Entry SO
            </Button>
          </div>
        }
      />

      <div className="bg-white rounded-xl shadow-card border border-slate-200/70">
        <Table
          columns={columns}
          data={orders || []}
          emptyMessage="No sales orders yet"
          rowClassName={(row: SalesOrder) => statusRowClass(row.status)}
          onRowClick={(row: SalesOrder) => setDetailRow(row)}
          searchPlaceholder="Search SO #, customer…"
          filters={[
            { key: "status", label: "Status", value: (row: SalesOrder) => row.status.replace(/_/g, " ") },
            { key: "paymentTerms", label: "Payment Terms", value: (row: SalesOrder) => row.paymentTerms.replace(/_/g, " ") },
            { key: "orderDate", label: "Order Date", type: "date", value: (row: SalesOrder) => row.orderDate || row.createdAt },
          ]}
        />
      </div>

      {/* Row details */}
      <DetailsModal
        isOpen={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title={`Sales Order — ${detailRow?.soNumber || ""}`}
        fields={detailRow ? [
          { label: "Customer", value: detailRow.customer?.name },
          { label: "Status", value: <Badge status={detailRow.status} /> },
          { label: "Order Date", value: formatDate(detailRow.orderDate || detailRow.createdAt) },
          { label: "Payment Terms", value: detailRow.paymentTerms.replace(/_/g, " ") },
          { label: "Sub Total", value: formatCurrency(detailRow.subTotal) },
          { label: "GST", value: detailRow.gstRate > 0 ? `${detailRow.gstRate}% = ${formatCurrency(detailRow.gstAmount)}` : "—" },
          { label: "Grand Total", value: <span className="font-bold">{formatCurrency(detailRow.grandTotal)}</span> },
          { label: "Payment Proof", value: detailRow.paymentProofUrl ? "Uploaded" : "—" },
          { label: "Total Panels", value: `${(detailRow.totalPanels ?? 0).toLocaleString()}`, numeric: true },
          { label: "Total Pallets", value: `${(detailRow.totalPallets ?? 0).toLocaleString()}`, numeric: true },
          { label: "Total Watts", value: `${(detailRow.totalWatts ?? 0).toLocaleString()}`, numeric: true },
          { label: "Remaining to Deliver", value: `${(detailRow.remainingPanels ?? 0).toLocaleString()} panels`, numeric: true },
          ...((detailRow.balanceCancelledQty ?? 0) > 0
            ? [{ label: "Balance Closed", value: `${detailRow.balanceCancelledQty!.toLocaleString()} panels` }]
            : []),
          ...(detailRow.notes ? [{ label: "Notes", value: detailRow.notes, wide: true }] : []),
        ] : []}
        actions={detailRow ? soRowActions(detailRow) : []}
      >
        {detailRow?.lines?.length ? (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-right">Panels</th>
                  <th className="px-3 py-2 text-right">Watts</th>
                  <th className="px-3 py-2 text-right">Rate / Watt</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {detailRow.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{l.product?.brand} ({l.product?.wattage}W)</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.quantity.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.watts.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.ratePerWatt.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(l.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {detailRow?.deliveryOrders && detailRow.deliveryOrders.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Delivery Orders</p>
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">DO #</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Ordered</th>
                    <th className="px-3 py-2 text-right">Lifted</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detailRow.deliveryOrders.map((d) => (
                    <tr key={d.id}>
                      <td className="px-3 py-2 font-medium text-gray-800">{d.doNumber}</td>
                      <td className="px-3 py-2"><Badge status={d.status} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.quantity.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{d.liftedQuantity.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-700">{d.balanceQuantity.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              Remaining to deliver:{" "}
              <span className="font-semibold text-gray-800">{(detailRow.remainingPanels ?? 0).toLocaleString()} panels</span>
              {(detailRow.balanceCancelledQty ?? 0) > 0 && (
                <span className="text-gray-400"> · {detailRow.balanceCancelledQty!.toLocaleString()} closed</span>
              )}
            </p>
          </div>
        ) : null}
      </DetailsModal>

      {/* Cancel confirmation */}
      <ConfirmDialog
        isOpen={Boolean(cancelOrder)}
        onClose={() => setCancelOrder(null)}
        onConfirm={handleCancel}
        loading={cancelling}
        title={`Cancel Sales Order — ${cancelOrder?.soNumber || ""}`}
        confirmLabel="Cancel Sales Order"
        cancelLabel="Keep Order"
        message={
          <span>
            Cancel <strong>{cancelOrder?.soNumber}</strong> for <strong>{cancelOrder?.customer?.name}</strong> ({formatCurrency(cancelOrder?.grandTotal || 0)})?
            <br />Any delivery orders created for it will also be cancelled and their reserved stock released.
            Once any stock is lifted, the SO can no longer be cancelled.
          </span>
        }
      />

      {/* Cancel SO Balance confirmation (close undelivered remainder after partial delivery) */}
      <ConfirmDialog
        isOpen={Boolean(balanceOrder)}
        onClose={() => setBalanceOrder(null)}
        onConfirm={handleCancelBalance}
        loading={cancellingBalance}
        title={`Cancel SO Balance — ${balanceOrder?.soNumber || ""}`}
        confirmLabel="Cancel Balance"
        cancelLabel="Keep Open"
        message={
          <span>
            Close the undelivered balance of{" "}
            <strong>{(balanceOrder?.remainingPanels ?? 0).toLocaleString()} panels</strong> on{" "}
            <strong>{balanceOrder?.soNumber}</strong> for <strong>{balanceOrder?.customer?.name}</strong>?
            <br />
            The delivered panels stay on record; the remaining quantity is written off and no further delivery
            orders can be raised for it.
          </span>
        }
      />

      {/* Proof viewer */}
      <Modal isOpen={Boolean(viewProof)} onClose={() => setViewProof(null)} title={`Payment Proof — ${viewProof?.soNumber}`} size="lg">
        {viewProof && (
          <div className="flex flex-col items-center gap-4">
            {viewProof.url.match(/\.(jpg|jpeg|png|webp)$/i) ? (
              <Image src={viewProof.url} alt="Payment proof" width={1200} height={900} className="max-w-full rounded-lg border" />
            ) : (
              <iframe src={viewProof.url} className="h-96 w-full rounded-lg border" title="Payment proof" />
            )}
            <a href={viewProof.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
              Open in new tab
            </a>
          </div>
        )}
      </Modal>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); resetOrderForm() }}
        title={editOrderId ? "Edit Sales Order" : "Quick Entry Sales Order"}
        size="xl"
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-900 mb-3">Customer</p>
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr]">
              <div className="relative">
                <Input
                  label="Customer"
                  required
                  placeholder="Search by name or phone"
                  value={customerQuery}
                  onChange={(e) => {
                    setCustomerQuery(e.target.value)
                    setForm((cur) => ({ ...cur, customerId: "" }))
                  }}
                />
                {customerResults.length > 0 && form.customerId === "" && (
                  <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {customerResults.slice(0, 8).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="flex w-full items-start justify-between gap-3 border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-gray-50"
                        onMouseDown={(e) => { e.preventDefault(); selectCustomer(c) }}
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">{c.name}</p>
                          <p className="text-xs text-gray-500">{c.contactPhone || c.type.replace(/_/g, " ")}</p>
                        </div>
                        <span className="text-xs text-gray-400">{c.paymentTerms.replace(/_/g, " ")}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Select
                label="Customer Type"
                value={form.customerType}
                onChange={(e) => setForm((cur) => ({ ...cur, customerType: e.target.value }))}
              >
                <option value="DIRECT">Direct</option>
                <option value="DISTRIBUTOR">Distributor</option>
                <option value="INSTALLER">Installer</option>
              </Select>

              <Select
                label="Payment Terms"
                value={form.paymentTerms}
                onChange={(e) => setForm((cur) => ({ ...cur, paymentTerms: e.target.value }))}
              >
                <option value="FULL_PAYMENT">Full Payment</option>
                <option value="DEPOSIT_BALANCE">Deposit + Balance</option>
                <option value="CREDIT">Credit</option>
              </Select>
            </div>

            {selectedCustomer && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-blue-900">
                <span className="rounded-full bg-white px-2.5 py-1 font-medium">{selectedCustomer.name}</span>
                <span>Terms: {selectedCustomer.paymentTerms.replace(/_/g, " ")}</span>
                {selectedCustomer.creditLimit && <span>Credit limit: {formatCurrency(selectedCustomer.creditLimit)}</span>}
                {customerBalance !== null && (
                  <span className={`rounded-full px-2.5 py-1 font-semibold ${
                    customerBalance.balance >= 0
                      ? "bg-green-100 text-green-800"
                      : "bg-orange-100 text-orange-800"
                  }`}>
                    {customerBalance.balance >= 0
                      ? `Advance: ${formatCurrency(customerBalance.balance)}`
                      : `Pending: ${formatCurrency(Math.abs(customerBalance.balance))}`
                    }
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Order Lines */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">Order Lines</p>
                <p className="text-xs text-gray-500">Select SKU — wattage and panels auto-fill from master data.</p>
              </div>
              <Button size="sm" variant="ghost" onClick={addLine}>+ Add Line</Button>
            </div>

            {lines.map((line, index) => {
              const computedLine = computedLines[index]
              return (
                <div key={`${index}-${line.productId}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="grid gap-3 lg:grid-cols-[2fr_0.8fr_0.8fr_0.9fr_auto]">
                    <SearchableSelect
                      label="SKU / Product"
                      placeholder="Type brand or SKU to search…"
                      options={(products || []).map((p) => ({
                        value: p.id,
                        label: `${p.brand} — ${p.name}`,
                        sublabel: `${p.wattage}W`,
                      }))}
                      value={line.productId}
                      onChange={(productId) => updateLine(index, { productId })}
                    />

                    <Select
                      label="Qty In"
                      value={line.quantityMode}
                      onChange={(e) => updateLine(index, { quantityMode: e.target.value as DraftLine["quantityMode"] })}
                    >
                      <option value="PANELS">Panels</option>
                      <option value="PALLETS">Pallets</option>
                    </Select>

                    <Input
                      label={line.quantityMode === "PALLETS" ? "Pallets" : "Panels"}
                      type="number"
                      value={line.quantity}
                      onChange={(e) => updateLine(index, { quantity: e.target.value })}
                    />

                    <Input
                      label="Rate / Watt"
                      type="number"
                      step="0.01"
                      value={line.ratePerWatt}
                      onChange={(e) => updateLine(index, { ratePerWatt: e.target.value })}
                    />

                    <div className="flex items-end">
                      {lines.length > 1 && (
                        <Button size="sm" variant="danger" onClick={() => removeLine(index)}>Remove</Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 rounded-lg bg-white p-3 text-sm md:grid-cols-4">
                    <div>
                      <p className="text-xs text-gray-500">Panels</p>
                      <p className="font-semibold text-gray-900">{computedLine.quantity.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Watts</p>
                      <p className="font-semibold text-gray-900">{computedLine.watts.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Rate / Panel</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(computedLine.ratePerPanel)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Line Total</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(computedLine.totalAmount)}</p>
                    </div>
                  </div>

                  {computedLine.product && computedLine.panelsPerPallet > 0 && (
                    <p className="mt-2 text-xs text-gray-500">
                      Packing: {formatNumber(computedLine.panelsPerPallet, 0)} panels/pallet · {computedLine.product.panelsPerContainer?.toLocaleString() || "—"} panels/container
                    </p>
                  )}
                  {computedLine.invalidPallets && (
                    <p className="mt-2 text-xs font-medium text-red-600">This SKU needs container/pallet packing configured in product master.</p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded accent-blue-600"
                  checked={form.gstInvoice}
                  onChange={(e) => setForm((cur) => ({ ...cur, gstInvoice: e.target.checked }))}
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">GST Invoice Required</p>
                  <p className="text-xs text-gray-500">Customer requests FBR GST invoice (exclusive GST)</p>
                </div>
              </label>
              {form.gstInvoice && (
                <Input
                  label="GST Rate (%)"
                  type="number"
                  step="0.1"
                  value={form.gstRate}
                  onChange={(e) => setForm((cur) => ({ ...cur, gstRate: e.target.value }))}
                />
              )}
            </div>

            <div className="space-y-3">
              <Input
                label="Order Date"
                type="date"
                value={form.orderDate}
                onChange={(e) => setForm((cur) => ({ ...cur, orderDate: e.target.value }))}
              />
              <Input
                label="Notes"
                value={form.notes}
                onChange={(e) => setForm((cur) => ({ ...cur, notes: e.target.value }))}
              />
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm">
              <div className="mb-2 flex items-center justify-between text-xs text-blue-800">
                <span>Total Panels</span>
                <span className="font-semibold">{totalPanels.toLocaleString()}</span>
              </div>
              <div className="mb-2 flex items-center justify-between text-xs text-blue-800">
                <span>Total Watts</span>
                <span className="font-semibold">{totalWatts.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{form.gstInvoice ? "Sub Total (excl. GST)" : "Total"}</span>
                <span className="font-semibold">{formatCurrency(subTotal)}</span>
              </div>
              {form.gstInvoice && (
                <div className="mt-1 flex items-center justify-between text-orange-700">
                  <span>GST ({gstRate}%)</span>
                  <span className="font-semibold">+ {formatCurrency(gstAmount)}</span>
                </div>
              )}
              <div className="mt-2 flex items-center justify-between border-t border-blue-200 pt-2 text-base font-bold text-blue-900">
                <span>Grand Total</span>
                <span>{formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>

          {creditWarning && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {creditWarning}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => { setShowCreate(false); resetOrderForm() }}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {editOrderId ? "Update Sales Order" : "Create Sales Order"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
