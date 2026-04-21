"use client"

import { type ChangeEvent, useDeferredValue, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { useSearchParams } from "next/navigation"
import toast, { Toaster } from "react-hot-toast"
import { CheckCircle, Eye, Plus, Truck, Upload, UserPlus } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Badge } from "@/components/ui/Badge"
import { Modal } from "@/components/ui/Modal"
import { Table } from "@/components/ui/Table"
import { LoadingPage } from "@/components/ui/Spinner"
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils"
import { useFetch } from "@/hooks/useFetch"
import { useAuth } from "@/hooks/useAuth"

interface SalesOrder {
  id: string
  soNumber: string
  customer: { name: string; creditLimit: number | null }
  grandTotal: number
  status: string
  paymentTerms: string
  createdAt: string
  gstRate: number
  subTotal: number
  gstAmount: number
  paymentProofUrl: string | null
}

interface CustomerOption {
  id: string
  name: string
  type: string
  creditLimit: number | null
  paymentTerms: string
  contactPhone: string | null
  address?: string | null
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
  brand: string
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
}

const emptyCustomerForm = {
  name: "",
  type: "DIRECT",
  contactPhone: "",
  address: "",
  creditLimit: "",
  paymentTerms: "FULL_PAYMENT",
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
  const {
    data: customers,
    refetch: refetchCustomers,
  } = useFetch<CustomerOption[]>("/api/customers")
  const { data: products } = useFetch<ProductOption[]>("/api/products")
  const { data: quotation } = useFetch<{
    id: string
    customerId: string
    lines: Array<{ productId: string; quantity: number; ratePerWatt: number }>
  }>(quotationId ? `/api/quotations/${quotationId}` : "")

  const [showCreate, setShowCreate] = useState(Boolean(quotationId))
  const [showCustomerCreate, setShowCustomerCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [uploadingProof, setUploadingProof] = useState<string | null>(null)
  const [viewProof, setViewProof] = useState<{ url: string; soNumber: string } | null>(null)
  const [customerQuery, setCustomerQuery] = useState("")
  const [form, setForm] = useState(emptyOrderForm)
  const [customerForm, setCustomerForm] = useState(emptyCustomerForm)
  const [lines, setLines] = useState<DraftLine[]>([
    { brand: "", productId: "", quantityMode: "PANELS", quantity: "", ratePerWatt: "" },
  ])
  const [pendingUploadId, setPendingUploadId] = useState<string | null>(null)
  const [lastUsedProductId, setLastUsedProductId] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const deferredCustomerQuery = useDeferredValue(customerQuery)
  const selectedCustomer = customers?.find((customer) => customer.id === form.customerId) || null
  const uniqueBrands = Array.from(new Set((products || []).map((product) => product.brand))).sort()

  useEffect(() => {
    const savedProductId = window.localStorage.getItem(LAST_PRODUCT_KEY)
    if (savedProductId) {
      setLastUsedProductId(savedProductId)
    }
  }, [])

  useEffect(() => {
    const firstProductId = lines[0]?.productId
    if (!firstProductId) return
    window.localStorage.setItem(LAST_PRODUCT_KEY, firstProductId)
    setLastUsedProductId(firstProductId)
  }, [lines])

  useEffect(() => {
    if (!quotation || !customers || !products) return

    const quotationCustomer = customers.find((customer) => customer.id === quotation.customerId)
    setForm((current) => ({
      ...current,
      customerId: quotation.customerId,
      customerType: quotationCustomer?.type || current.customerType,
      paymentTerms: quotationCustomer?.paymentTerms || current.paymentTerms,
    }))
    setCustomerQuery(quotationCustomer?.name || "")
    setLines(
      quotation.lines.map((line) => {
        const product = products.find((item) => item.id === line.productId)
        return {
          brand: product?.brand || "",
          productId: line.productId,
          quantityMode: "PANELS",
          quantity: String(line.quantity),
          ratePerWatt: String(line.ratePerWatt),
        }
      })
    )
    setShowCreate(true)
  }, [customers, products, quotation])

  const customerResults =
    deferredCustomerQuery.trim().length === 0
      ? []
      : (customers || []).filter((customer) =>
          `${customer.name} ${customer.contactPhone || ""}`
            .toLowerCase()
            .includes(deferredCustomerQuery.toLowerCase())
        )

  const computedLines = lines.map((line) => {
    const product = products?.find((item) => item.id === line.productId)
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

  const subTotal = computedLines.reduce((total, line) => total + line.totalAmount, 0)
  const totalPanels = computedLines.reduce((total, line) => total + line.quantity, 0)
  const totalWatts = computedLines.reduce((total, line) => total + line.watts, 0)
  const gstRate = form.gstInvoice ? (parseFloat(form.gstRate) || 0) : 0
  const gstAmount = subTotal * (gstRate / 100)
  const grandTotal = subTotal + gstAmount

  const creditWarning =
    selectedCustomer?.creditLimit && grandTotal > selectedCustomer.creditLimit
      ? `Order value ${formatCurrency(grandTotal)} exceeds the customer credit limit of ${formatCurrency(selectedCustomer.creditLimit)}`
      : null

  const buildBlankLine = (productId = ""): DraftLine => {
    const product = products?.find((item) => item.id === productId)
    return {
      brand: product?.brand || "",
      productId,
      quantityMode: "PANELS",
      quantity: "",
      ratePerWatt: "",
    }
  }

  const resetOrderForm = () => {
    setForm(emptyOrderForm)
    setCustomerQuery("")
    setLines([buildBlankLine(lastUsedProductId)])
  }

  const openCreateModal = () => {
    if (!quotationId) {
      resetOrderForm()
    }
    setShowCreate(true)
  }

  const addLine = () => setLines((current) => [...current, buildBlankLine(lastUsedProductId)])
  const removeLine = (index: number) => setLines((current) => current.filter((_, currentIndex) => currentIndex !== index))

  const updateLine = (index: number, next: Partial<DraftLine>) => {
    setLines((current) =>
      current.map((line, currentIndex) => {
        if (currentIndex !== index) return line
        return { ...line, ...next }
      })
    )
  }

  const selectCustomer = (customer: CustomerOption) => {
    setForm((current) => ({
      ...current,
      customerId: customer.id,
      customerType: customer.type,
      paymentTerms: customer.paymentTerms,
    }))
    setCustomerQuery(customer.name)
  }

  const handleCreate = async () => {
    if (!form.customerId) {
      return toast.error("Select a customer first")
    }

    if (computedLines.some((line) => !line.productId || line.quantity <= 0 || line.ratePerWatt <= 0)) {
      return toast.error("Complete each line with product, quantity, and rate")
    }

    if (computedLines.some((line) => line.invalidPallets)) {
      return toast.error("One or more SKUs do not have pallet configuration in product master")
    }

    setSaving(true)
    try {
      const response = await fetch("/api/sales-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          quotationId: quotationId || null,
          lines: computedLines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            watts: line.watts,
            ratePerWatt: line.ratePerWatt,
            ratePerPanel: line.ratePerPanel,
            totalAmount: line.totalAmount,
          })),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || "Failed to create sales order")
        return
      }

      toast.success("Sales order created")
      setShowCreate(false)
      resetOrderForm()
      refetch()
    } finally {
      setSaving(false)
    }
  }

  const handleCreateCustomer = async () => {
    if (!customerForm.name.trim()) {
      return toast.error("Customer name is required")
    }

    setSavingCustomer(true)
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customerForm),
      })

      if (!response.ok) {
        toast.error("Failed to create customer")
        return
      }

      const customer = await response.json()
      toast.success("Customer added")
      setShowCustomerCreate(false)
      setCustomerForm(emptyCustomerForm)
      setCustomerQuery(customer.name)
      setForm((current) => ({
        ...current,
        customerId: customer.id,
        customerType: customer.type,
        paymentTerms: customer.paymentTerms,
      }))
      refetchCustomers()
    } finally {
      setSavingCustomer(false)
    }
  }

  const handleVerifyPayment = async (id: string) => {
    const response = await fetch(`/api/sales-orders/${id}/verify-payment`, { method: "POST" })
    if (response.ok) {
      toast.success("Payment verified")
      refetch()
      return
    }
    toast.error("Failed to verify payment")
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
        toast.error("Failed to link payment proof to sales order")
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

  const columns = [
    { key: "soNumber", header: "SO Number", sortable: true },
    { key: "customer", header: "Customer", render: (row: SalesOrder) => row.customer?.name },
    { key: "subTotal", header: "Sub Total", render: (row: SalesOrder) => formatCurrency(row.subTotal) },
    { key: "gstAmount", header: "GST", render: (row: SalesOrder) => row.gstRate > 0 ? `${row.gstRate}% = ${formatCurrency(row.gstAmount)}` : <span className="text-gray-400">-</span> },
    { key: "grandTotal", header: "Grand Total", render: (row: SalesOrder) => <span className="font-bold">{formatCurrency(row.grandTotal)}</span> },
    { key: "paymentTerms", header: "Terms", render: (row: SalesOrder) => row.paymentTerms.replace(/_/g, " ") },
    { key: "status", header: "Status", render: (row: SalesOrder) => <Badge status={row.status} /> },
    { key: "createdAt", header: "Date", render: (row: SalesOrder) => formatDate(row.createdAt) },
    {
      key: "actions",
      header: "Actions",
      render: (row: SalesOrder) => (
        <div className="flex flex-wrap items-center gap-1">
          {row.status === "DRAFT" && (
            <Button size="sm" variant="ghost" onClick={() => triggerProofUpload(row.id)} loading={uploadingProof === row.id}>
              <Upload size={14} className="mr-1" />
              Upload Proof
            </Button>
          )}
          {row.paymentProofUrl && (
            <Button size="sm" variant="ghost" onClick={() => setViewProof({ url: row.paymentProofUrl!, soNumber: row.soNumber })}>
              <Eye size={14} className="mr-1" />
              View Proof
            </Button>
          )}
          {row.status === "PENDING_PAYMENT" && ["ADMIN", "ACCOUNTS"].includes(user?.role || "") && (
            <Button size="sm" variant="success" onClick={() => handleVerifyPayment(row.id)}>
              <CheckCircle size={14} className="mr-1" />
              Verify
            </Button>
          )}
          {row.status === "PAYMENT_CONFIRMED" && (
            <Button size="sm" variant="secondary" onClick={() => (window.location.href = `/delivery?soId=${row.id}`)}>
              <Truck size={14} className="mr-1" />
              Create DO
            </Button>
          )}
        </div>
      ),
    },
  ]

  if (loading) return <LoadingPage />

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />

      <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} />

      <Header
        title="Sales Orders"
        actions={
          <Button onClick={openCreateModal}>
            <Plus size={16} className="mr-2" />
            Quick Entry SO
          </Button>
        }
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <Table columns={columns} data={orders || []} emptyMessage="No sales orders yet" />
      </div>

      <Modal isOpen={Boolean(viewProof)} onClose={() => setViewProof(null)} title={`Payment Proof — ${viewProof?.soNumber}`} size="lg">
        {viewProof && (
          <div className="flex flex-col items-center gap-4">
            {viewProof.url.match(/\.(jpg|jpeg|png|webp)$/i) ? (
              <Image
                src={viewProof.url}
                alt="Payment proof"
                width={1200}
                height={900}
                className="max-w-full rounded-lg border"
              />
            ) : (
              <iframe src={viewProof.url} className="h-96 w-full rounded-lg border" title="Payment proof" />
            )}
            <a href={viewProof.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
              Open in new tab
            </a>
          </div>
        )}
      </Modal>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Quick Entry Sales Order" size="xl">
        <div className="space-y-5">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-blue-900">WhatsApp-to-ERP fast path</p>
                <p className="text-xs text-blue-700">Pick the customer, SKU, quantity, and rate. Panels, watts, and totals update live.</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setShowCustomerCreate(true)}>
                <UserPlus size={14} className="mr-1" />
                Add Customer
              </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr]">
              <div className="relative">
                <Input
                  label="Customer"
                  required
                  placeholder="Search by name or phone"
                  value={customerQuery}
                  onChange={(event) => {
                    setCustomerQuery(event.target.value)
                    setForm((current) => ({ ...current, customerId: "" }))
                  }}
                />
                {customerResults.length > 0 && form.customerId === "" && (
                  <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {customerResults.slice(0, 8).map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        className="flex w-full items-start justify-between gap-3 border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-gray-50"
                        onMouseDown={(event) => {
                          event.preventDefault()
                          selectCustomer(customer)
                        }}
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">{customer.name}</p>
                          <p className="text-xs text-gray-500">{customer.contactPhone || customer.type.replace(/_/g, " ")}</p>
                        </div>
                        <span className="text-xs text-gray-400">{customer.paymentTerms.replace(/_/g, " ")}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Select
                label="Customer Type"
                value={form.customerType}
                onChange={(event) => setForm((current) => ({ ...current, customerType: event.target.value }))}
              >
                <option value="DIRECT">Direct</option>
                <option value="DISTRIBUTOR">Distributor</option>
                <option value="INSTALLER">Installer</option>
              </Select>

              <Select
                label="Payment Terms"
                value={form.paymentTerms}
                onChange={(event) => setForm((current) => ({ ...current, paymentTerms: event.target.value }))}
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
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">Order Lines</p>
                <p className="text-xs text-gray-500">Use pallets when the SKU has container packing configured in master data.</p>
              </div>
              <Button size="sm" variant="ghost" onClick={addLine}>
                + Add Line
              </Button>
            </div>

            {lines.map((line, index) => {
              const filteredProducts = (products || []).filter((product) => !line.brand || product.brand === line.brand)
              const computedLine = computedLines[index]
              return (
                <div key={`${index}-${line.productId}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr_0.8fr_0.8fr_0.9fr_auto]">
                    <Select
                      label="Brand"
                      value={line.brand}
                      onChange={(event) => updateLine(index, { brand: event.target.value, productId: "" })}
                    >
                      <option value="">Select brand...</option>
                      {uniqueBrands.map((brand) => (
                        <option key={brand} value={brand}>
                          {brand}
                        </option>
                      ))}
                    </Select>

                    <Select
                      label="SKU"
                      value={line.productId}
                      onChange={(event) => {
                        const product = products?.find((item) => item.id === event.target.value)
                        updateLine(index, { productId: event.target.value, brand: product?.brand || line.brand })
                      }}
                    >
                      <option value="">Select SKU...</option>
                      {filteredProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} ({product.wattage}W)
                        </option>
                      ))}
                    </Select>

                    <Select
                      label="Qty In"
                      value={line.quantityMode}
                      onChange={(event) => updateLine(index, { quantityMode: event.target.value as DraftLine["quantityMode"] })}
                    >
                      <option value="PANELS">Panels</option>
                      <option value="PALLETS">Pallets</option>
                    </Select>

                    <Input
                      label={line.quantityMode === "PALLETS" ? "Pallets" : "Panels"}
                      type="number"
                      value={line.quantity}
                      onChange={(event) => updateLine(index, { quantity: event.target.value })}
                    />

                    <Input
                      label="Rate / Watt"
                      type="number"
                      step="0.01"
                      value={line.ratePerWatt}
                      onChange={(event) => updateLine(index, { ratePerWatt: event.target.value })}
                    />

                    <div className="flex items-end">
                      {lines.length > 1 && (
                        <Button size="sm" variant="danger" onClick={() => removeLine(index)}>
                          Remove
                        </Button>
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
                      Packing: {formatNumber(computedLine.panelsPerPallet, 0)} panels per pallet, {computedLine.product.panelsPerContainer?.toLocaleString() || "-"} panels per container
                    </p>
                  )}
                  {computedLine.invalidPallets && (
                    <p className="mt-2 text-xs font-medium text-red-600">This SKU needs container/pallet packing in product master before pallet entry can be used.</p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
            <div className="space-y-3">
              {/* GST Invoice toggle */}
              <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded accent-blue-600"
                  checked={form.gstInvoice}
                  onChange={(e) => setForm((current) => ({ ...current, gstInvoice: e.target.checked }))}
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">GST Invoice Required</p>
                  <p className="text-xs text-gray-500">Customer requests FBR GST invoice (exclusive GST)</p>
                </div>
              </label>
              {form.gstInvoice && (
                <Input
                  label="GST Rate (%) — exclusive, added on top"
                  type="number"
                  step="0.1"
                  value={form.gstRate}
                  onChange={(event) => setForm((current) => ({ ...current, gstRate: event.target.value }))}
                />
              )}
            </div>
            <Input label="Notes" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />

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
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} loading={saving}>
              Create Sales Order
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showCustomerCreate} onClose={() => setShowCustomerCreate(false)} title="Add Customer">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Customer Name" required value={customerForm.name} onChange={(event) => setCustomerForm((current) => ({ ...current, name: event.target.value }))} />
            <Select label="Type" value={customerForm.type} onChange={(event) => setCustomerForm((current) => ({ ...current, type: event.target.value }))}>
              <option value="DIRECT">Direct</option>
              <option value="DISTRIBUTOR">Distributor</option>
              <option value="INSTALLER">Installer</option>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Phone" value={customerForm.contactPhone} onChange={(event) => setCustomerForm((current) => ({ ...current, contactPhone: event.target.value }))} />
            <Input label="Credit Limit" type="number" value={customerForm.creditLimit} onChange={(event) => setCustomerForm((current) => ({ ...current, creditLimit: event.target.value }))} />
          </div>

          <Input label="Address" value={customerForm.address} onChange={(event) => setCustomerForm((current) => ({ ...current, address: event.target.value }))} />

          <Select label="Payment Terms" value={customerForm.paymentTerms} onChange={(event) => setCustomerForm((current) => ({ ...current, paymentTerms: event.target.value }))}>
            <option value="FULL_PAYMENT">Full Payment</option>
            <option value="DEPOSIT_BALANCE">Deposit + Balance</option>
            <option value="CREDIT">Credit</option>
          </Select>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowCustomerCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCustomer} loading={savingCustomer}>
              Save Customer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
