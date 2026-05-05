"use client"

import { useState, useRef } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Badge } from "@/components/ui/Badge"
import { Modal } from "@/components/ui/Modal"
import { Table } from "@/components/ui/Table"
import { LoadingPage } from "@/components/ui/Spinner"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Plus, FileCheck, Upload, Paperclip, Trash2, ExternalLink } from "lucide-react"
import toast, { Toaster } from "react-hot-toast"

const DOC_TYPES = [
  "Proforma Invoice",
  "Bank Request Letter",
  "Letter of Credit (LC)",
  "Goods Declaration (GD)",
  "Bill of Lading",
  "Insurance Certificate",
  "Clearing Document",
  "Other",
]

interface PODocument {
  id: string
  docType: string
  fileName: string
  fileUrl: string
  uploadedBy: string
  uploadedAt: string
}

interface PO {
  id: string
  poNumber: string
  product: { name: string; code: string; wattage: number; panelsPerContainer: number | null; palletsPerContainer: number | null }
  supplier: { name: string }
  bank: { name: string } | null
  warehouse: { name: string; location: string } | null
  exchangeRate: { source: string; rate: number; notes: string | null } | null
  costing: { reference: string; landedCostPerWatt: number; landedCostPerPanel: number } | null
  noOfPanels: number
  panelWattage: number
  totalWatts: number
  noOfContainers: number | null
  noOfPallets: number | null
  usdPerWatt: number
  totalValueUsd: number
  poAmountPkr: number
  leadTimeDays: number | null
  status: string
  lcType: string
  lcNumber: string | null
  usanceDays: number | null
  createdAt: string
  notes?: string | null
  // Clearing charges
  lcValuePkr: number | null
  importShippingFreight: number | null
  bankCharges: number | null
  marineInsurance: number | null
  exciseCharges: number | null
  shippingDO: number | null
  terminalHandling: number | null
  clearingCharges: number | null
  miscClearing: number | null
  containerTransport: number | null
  gstInputAmount: number | null
  totalLandedCost: number | null
  landedCostPerPanel: number | null
  landedCostPerWatt: number | null
  documents?: PODocument[]
}

interface ProductOption {
  id: string
  name: string
  code: string
  wattage: number
  defaultSupplierId: string | null
  panelsPerContainer: number | null
  palletsPerContainer: number | null
}

export default function ProcurementPage() {
  const { data: pos, loading, refetch } = useFetch<PO[]>("/api/purchase-orders")
  const { data: products } = useFetch<ProductOption[]>("/api/products")
  const { data: suppliers } = useFetch<{ id: string; name: string }[]>("/api/suppliers")
  const { data: warehouses } = useFetch<{ id: string; name: string }[]>("/api/warehouses")
  const { data: banks } = useFetch<{ id: string; name: string }[]>("/api/banks")
  const { data: rates } = useFetch<{ id: string; source: string; rate: number; notes: string | null }[]>("/api/exchange-rates")
  const { data: costings } = useFetch<{ id: string; reference: string; status: string; landedCostPerWatt: number }[]>("/api/costing")

  const [showCreate, setShowCreate] = useState(false)
  const [showClear, setShowClear] = useState(false)
  const [showDocs, setShowDocs] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [selectedPO, setSelectedPO] = useState<PO | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [docType, setDocType] = useState(DOC_TYPES[0])
  const [poDocs, setPoDocs] = useState<PODocument[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    productId: "", supplierId: "", lcType: "TT", lcNumber: "", usanceDays: "",
    bankId: "", warehouseId: "", noOfPanels: "", panelWattage: "",
    usdPerWatt: "", rsPerWatt: "", exchangeRateId: "", customRate: "", costingId: "", notes: "",
  })

  const [clearForm, setClearForm] = useState({
    lcValuePkr: "", importShippingFreight: "",
    bankCharges: "", marineInsurance: "", exciseCharges: "",
    shippingDO: "", terminalHandling: "", clearingCharges: "", miscClearing: "",
    containerTransport: "", gstInputAmount: "",
  })
  const [freightUsd, setFreightUsd] = useState("")
  const [freightExRate, setFreightExRate] = useState("")
  const [incoterm, setIncoterm] = useState<"FOB" | "CNF">("FOB")

  const handleProductChange = (productId: string) => {
    const p = products?.find((x) => x.id === productId)
    setForm((prev) => ({
      ...prev,
      productId,
      panelWattage: p ? String(p.wattage) : prev.panelWattage,
      supplierId: p?.defaultSupplierId ? p.defaultSupplierId : prev.supplierId,
    }))
  }

  const handleRateChange = (rateId: string) => {
    const r = rates?.find((x) => x.id === rateId)
    setForm((prev) => ({
      ...prev,
      exchangeRateId: rateId,
      customRate: r ? String(r.rate) : prev.customRate,
    }))
  }

  const effectiveRate = parseFloat(form.customRate) || rates?.find((r) => r.id === form.exchangeRateId)?.rate || 0

  // Auto-compute PKR freight from USD inputs
  const computedFreightPkr = (() => {
    const usd = parseFloat(freightUsd) || 0
    const rate = parseFloat(freightExRate) || 0
    return usd > 0 && rate > 0 ? usd * rate : 0
  })()

  const clearTotal = Object.values(clearForm).reduce((s, v) => s + (parseFloat(v) || 0), 0)

  const isLocal = form.lcType === "LOCAL"

  const handleCreate = async () => {
    const missingPrice = isLocal ? !form.rsPerWatt : !form.usdPerWatt
    if (!form.productId || !form.supplierId || !form.noOfPanels || missingPrice) {
      return toast.error("Fill all required fields")
    }
    setSaving(true)
    try {
      const panels = parseInt(form.noOfPanels)
      const wattage = parseInt(form.panelWattage)
      const totalWatts = panels * wattage
      let totalValueUsd = 0
      let poAmountPkr = 0
      let usdPerWatt = 0

      if (isLocal) {
        const rsPW = parseFloat(form.rsPerWatt)
        poAmountPkr = totalWatts * rsPW
        totalValueUsd = effectiveRate > 0 ? poAmountPkr / effectiveRate : 0
        usdPerWatt = effectiveRate > 0 ? rsPW / effectiveRate : 0
      } else {
        const usdPW = parseFloat(form.usdPerWatt)
        usdPerWatt = usdPW
        totalValueUsd = totalWatts * usdPW
        poAmountPkr = totalValueUsd * effectiveRate
      }

      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, totalWatts, totalValueUsd, poAmountPkr, usdPerWatt }),
      })

      if (res.ok) {
        toast.success("Purchase order created")
        setShowCreate(false)
        setForm({
          productId: "", supplierId: "", lcType: "TT", lcNumber: "", usanceDays: "",
          bankId: "", warehouseId: "", noOfPanels: "", panelWattage: "",
          usdPerWatt: "", rsPerWatt: "", exchangeRateId: "", customRate: "", costingId: "", notes: "",
        })
        refetch()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to create PO")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    if (!selectedPO) return
    setSaving(true)
    try {
      const payload = { ...clearForm, importFreightCost: "0" }
      const res = await fetch(`/api/purchase-orders/${selectedPO.id}/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast.success("Costing saved — PO marked Ready to Receive")
        setShowClear(false)
        setSelectedPO(null)
        setFreightUsd("")
        setFreightExRate("")
        setClearForm({ lcValuePkr: "", importShippingFreight: "", bankCharges: "", marineInsurance: "", exciseCharges: "", shippingDO: "", terminalHandling: "", clearingCharges: "", miscClearing: "", containerTransport: "", gstInputAmount: "" })
        refetch()
      } else {
        toast.error("Failed to save costing")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (id: string, status: string) => {
    const res = await fetch(`/api/purchase-orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (res.ok) { toast.success("Status updated"); refetch() }
    else toast.error("Failed to update status")
  }

  const openDocs = async (po: PO) => {
    setSelectedPO(po)
    const res = await fetch(`/api/purchase-orders/${po.id}/documents`)
    if (res.ok) setPoDocs(await res.json())
    setShowDocs(true)
  }

  const openDetail = (po: PO) => {
    setSelectedPO(po)
    setShowDetail(true)
  }

  const openCosting = (po: PO) => {
    setSelectedPO(po)
    setClearForm({
      lcValuePkr: String(po.poAmountPkr || ""),
      importShippingFreight: "", bankCharges: "", marineInsurance: "",
      exciseCharges: "", shippingDO: "", terminalHandling: "", clearingCharges: "", miscClearing: "",
      containerTransport: "", gstInputAmount: "",
    })
    setFreightUsd("")
    setFreightExRate("")
    setIncoterm("FOB")
    setShowClear(true)
  }

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedPO) return
    setUploadingDoc(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData })
      if (!uploadRes.ok) { toast.error((await uploadRes.json()).error || "Upload failed"); return }
      const { url } = await uploadRes.json()
      const saveRes = await fetch(`/api/purchase-orders/${selectedPO.id}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType, fileName: file.name, fileUrl: url }),
      })
      if (saveRes.ok) { const newDoc = await saveRes.json(); setPoDocs((prev) => [newDoc, ...prev]); toast.success(`${docType} uploaded`) }
      else toast.error("Failed to save document record")
    } finally {
      setUploadingDoc(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleDeleteDoc = async (docId: string) => {
    if (!selectedPO) return
    const res = await fetch(`/api/purchase-orders/${selectedPO.id}/documents?docId=${docId}`, { method: "DELETE" })
    if (res.ok) { setPoDocs((prev) => prev.filter((d) => d.id !== docId)); toast.success("Document removed") }
    else toast.error("Failed to remove document")
  }

  const columns = [
    { key: "poNumber", header: "PO Number", sortable: true },
    { key: "product", header: "Product", render: (row: PO) => <div><p className="font-medium text-sm">{row.product?.name}</p><p className="text-xs text-gray-400">{row.product?.code}</p></div> },
    { key: "supplier", header: "Supplier", render: (row: PO) => row.supplier?.name || "—" },
    { key: "lcType", header: "LC Type", render: (row: PO) => (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 whitespace-nowrap">
        {row.lcType}{row.lcType === "USANCE" && row.usanceDays ? ` ${row.usanceDays}d` : ""}
      </span>
    )},
    { key: "noOfPanels", header: "Quantity", render: (row: PO) => `${row.noOfPanels.toLocaleString()} × ${row.panelWattage}W` },
    {
      key: "totalValueUsd", header: "USD Value",
      render: (row: PO) => row.totalValueUsd > 0
        ? `$${row.totalValueUsd.toLocaleString()}`
        : <span className="text-gray-400">—</span>
    },
    { key: "poAmountPkr", header: "PKR Amount", render: (row: PO) => formatCurrency(row.poAmountPkr) },
    { key: "landedCostPerPanel", header: "Landed/Panel", render: (row: PO) => row.landedCostPerPanel ? formatCurrency(row.landedCostPerPanel) : <span className="text-gray-400">—</span> },
    { key: "status", header: "Status", render: (row: PO) => <Badge status={row.status} /> },
    { key: "createdAt", header: "Date", render: (row: PO) => formatDate(row.createdAt) },
    {
      key: "actions",
      header: "Actions",
      render: (row: PO) => (
        <div className="flex items-center gap-1 flex-wrap">
          {row.status === "DRAFT" && (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleStatusChange(row.id, "CONFIRMED") }}>Confirm</Button>
          )}
          {row.status === "CONFIRMED" && row.lcType !== "LOCAL" && (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleStatusChange(row.id, "SHIPPED") }}>Mark Shipped</Button>
          )}
          {row.status === "SHIPPED" && (
            <Button size="sm" variant="ghost" onClick={(e) => {
              e.stopPropagation()
              setSelectedPO(row)
              setClearForm({ lcValuePkr: String(row.poAmountPkr || ""), importShippingFreight: "", bankCharges: "", marineInsurance: "", exciseCharges: "", shippingDO: "", terminalHandling: "", clearingCharges: "", miscClearing: "", containerTransport: "", gstInputAmount: "" })
              setFreightUsd("")
              setFreightExRate("")
              setIncoterm("FOB")
              setShowClear(true)
            }}>
              <FileCheck size={14} className="mr-1" />Clearing
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openDocs(row) }}>
            <Paperclip size={14} />
          </Button>
        </div>
      ),
    },
  ]

  if (loading) return <LoadingPage />

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" title="Upload document" onChange={handleDocUpload} />

      <Header
        title="Purchase Orders"
        actions={<Button onClick={() => setShowCreate(true)}><Plus size={16} className="mr-2" />New PO</Button>}
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <Table
          columns={columns}
          data={pos || []}
          emptyMessage="No purchase orders yet"
          onRowClick={openDetail}
        />
      </div>

      {/* ── PO Detail / Preview Popup ── */}
      <Modal isOpen={showDetail} onClose={() => { setShowDetail(false); setSelectedPO(null) }} title={`PO Details — ${selectedPO?.poNumber}`} size="lg">
        {selectedPO && (
          <div className="space-y-5 text-sm">

            {/* ── Section: Basic Info ── */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Purchase Order Info</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div>
                  <p className="text-xs text-gray-500">PO Number</p>
                  <p className="font-semibold text-gray-900">{selectedPO.poNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <Badge status={selectedPO.status} />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Product</p>
                  <p className="font-semibold text-gray-900">{selectedPO.product?.name}</p>
                  <p className="text-xs text-gray-400">{selectedPO.product?.code} · {selectedPO.product?.wattage}W</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Supplier</p>
                  <p className="font-semibold text-gray-900">{selectedPO.supplier?.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">LC Type</p>
                  <p className="font-semibold text-gray-900">
                    {selectedPO.lcType}
                    {selectedPO.lcType === "USANCE" && selectedPO.usanceDays ? ` — ${selectedPO.usanceDays} days usance` : ""}
                  </p>
                  {selectedPO.lcNumber && <p className="text-xs text-gray-400">LC#: {selectedPO.lcNumber}</p>}
                </div>
                <div>
                  <p className="text-xs text-gray-500">Bank</p>
                  <p className="font-semibold text-gray-900">{selectedPO.bank?.name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Destination Warehouse</p>
                  <p className="font-semibold text-gray-900">{selectedPO.warehouse?.name || "—"}</p>
                  {selectedPO.warehouse?.location && <p className="text-xs text-gray-400">{selectedPO.warehouse.location}</p>}
                </div>
                {selectedPO.leadTimeDays && (
                  <div>
                    <p className="text-xs text-gray-500">Lead Time</p>
                    <p className="font-semibold text-gray-900">{selectedPO.leadTimeDays} days</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500">Created</p>
                  <p className="font-semibold text-gray-900">{formatDate(selectedPO.createdAt)}</p>
                </div>
              </div>
            </div>

            {/* ── Section: Quantity & Pricing ── */}
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Quantity & Pricing</p>
              <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                <div>
                  <p className="text-xs text-gray-500">No. of Panels</p>
                  <p className="font-semibold text-gray-900">{selectedPO.noOfPanels.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Panel Wattage</p>
                  <p className="font-semibold text-gray-900">{selectedPO.panelWattage}W</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Watts</p>
                  <p className="font-semibold text-gray-900">{(selectedPO.totalWatts || selectedPO.noOfPanels * selectedPO.panelWattage).toLocaleString()} W</p>
                  <p className="text-xs text-gray-400">{((selectedPO.totalWatts || selectedPO.noOfPanels * selectedPO.panelWattage) / 1000).toFixed(1)} kW</p>
                </div>
                {(() => {
                  const ppc = selectedPO.product?.panelsPerContainer
                  const computed = ppc && ppc > 0 ? Math.ceil(selectedPO.noOfPanels / ppc) : selectedPO.noOfContainers
                  return computed ? (
                    <>
                      <div>
                        <p className="text-xs text-gray-500">No. of Containers</p>
                        <p className="font-semibold text-blue-700">{computed}</p>
                      </div>
                      {selectedPO.noOfPallets && (
                        <div>
                          <p className="text-xs text-gray-500">No. of Pallets</p>
                          <p className="font-semibold text-gray-900">{selectedPO.noOfPallets}</p>
                        </div>
                      )}
                    </>
                  ) : null
                })()}
                {selectedPO.lcType !== "LOCAL" && (
                  <div>
                    <p className="text-xs text-gray-500">USD per Watt</p>
                    <p className="font-semibold text-gray-900">${selectedPO.usdPerWatt?.toFixed(4)}</p>
                  </div>
                )}
                {selectedPO.exchangeRate && (
                  <div>
                    <p className="text-xs text-gray-500">Exchange Rate</p>
                    <p className="font-semibold text-gray-900">Rs {selectedPO.exchangeRate.rate}</p>
                    <p className="text-xs text-gray-400">{selectedPO.exchangeRate.source}{selectedPO.exchangeRate.notes ? ` · ${selectedPO.exchangeRate.notes}` : ""}</p>
                  </div>
                )}
                {selectedPO.totalValueUsd > 0 && (
                  <div>
                    <p className="text-xs text-gray-500">Total USD Value</p>
                    <p className="font-semibold text-gray-900">${selectedPO.totalValueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500">PKR Amount (at booking)</p>
                  <p className="font-semibold text-gray-900">{formatCurrency(selectedPO.poAmountPkr)}</p>
                </div>
              </div>
            </div>

            {/* ── Section: Linked Costing ── */}
            {selectedPO.costing && (
              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Linked Costing</p>
                <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                  <div>
                    <p className="text-xs text-gray-500">Costing Reference</p>
                    <p className="font-semibold text-gray-900">{selectedPO.costing.reference}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Landed Cost/Watt</p>
                    <p className="font-semibold text-blue-700">Rs {selectedPO.costing.landedCostPerWatt?.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Landed Cost/Panel</p>
                    <p className="font-semibold text-blue-700">{formatCurrency(selectedPO.costing.landedCostPerPanel)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Section: Clearing Charges ── */}
            {selectedPO.totalLandedCost != null && (
              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Clearing Charges</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {[
                    { label: "LC / Purchase Value",   value: selectedPO.lcValuePkr },
                    { label: "Import Shipping Freight", value: selectedPO.importShippingFreight },
                    { label: "Bank Charges",           value: selectedPO.bankCharges },
                    { label: "Marine / Transit Insurance", value: selectedPO.marineInsurance },
                    { label: "Excise",                 value: selectedPO.exciseCharges },
                    { label: "Shipping DO",            value: selectedPO.shippingDO },
                    { label: "Terminal (THC)",          value: selectedPO.terminalHandling },
                    { label: "Customs & Clearing",     value: selectedPO.clearingCharges },
                    { label: "Miscellaneous Clearing", value: selectedPO.miscClearing },
                    { label: "Transportation",         value: selectedPO.containerTransport },
                    { label: "GST Paid at Import",     value: selectedPO.gstInputAmount },
                  ].filter(({ value }) => value != null && value > 0).map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between py-1 border-b border-gray-100">
                      <span className="text-gray-500">{label}</span>
                      <span className="font-medium text-gray-900">{formatCurrency(value!)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 bg-blue-50 rounded-lg p-3 grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-blue-600">Total Landed Cost</p>
                    <p className="font-bold text-blue-900">{formatCurrency(selectedPO.totalLandedCost)}</p>
                  </div>
                  {selectedPO.landedCostPerPanel && (
                    <div>
                      <p className="text-xs text-blue-600">Per Panel</p>
                      <p className="font-bold text-blue-900">{formatCurrency(selectedPO.landedCostPerPanel)}</p>
                    </div>
                  )}
                  {selectedPO.landedCostPerWatt && (
                    <div>
                      <p className="text-xs text-blue-600">Per Watt</p>
                      <p className="font-bold text-blue-900">Rs {selectedPO.landedCostPerWatt.toFixed(2)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Notes ── */}
            {selectedPO.notes && (
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 mb-1">Notes</p>
                <p className="text-gray-700 whitespace-pre-line">{selectedPO.notes}</p>
              </div>
            )}

            {/* ── Actions ── */}
            <div className="flex flex-wrap justify-between gap-3 border-t pt-4">
              <div className="flex gap-2">
                {selectedPO.status === "DRAFT" && (
                  <Button variant="secondary" size="sm" onClick={() => { handleStatusChange(selectedPO.id, "CONFIRMED"); setShowDetail(false) }}>Confirm PO</Button>
                )}
                {selectedPO.status === "CONFIRMED" && selectedPO.lcType !== "LOCAL" && (
                  <Button variant="secondary" size="sm" onClick={() => { handleStatusChange(selectedPO.id, "SHIPPED"); setShowDetail(false) }}>Mark Shipped</Button>
                )}
                {selectedPO.status === "SHIPPED" && (
                  <Button variant="primary" size="sm" onClick={() => {
                    setClearForm({ lcValuePkr: String(selectedPO.poAmountPkr || ""), importShippingFreight: "", bankCharges: "", marineInsurance: "", exciseCharges: "", shippingDO: "", terminalHandling: "", clearingCharges: "", miscClearing: "", containerTransport: "", gstInputAmount: "" })
                    setFreightUsd("")
                    setFreightExRate("")
                    setIncoterm("FOB")
                    setShowDetail(false)
                    setShowClear(true)
                  }}>
                    <FileCheck size={14} className="mr-1" />Enter Clearing
                  </Button>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => { openDocs(selectedPO); setShowDetail(false) }}>
                <Paperclip size={14} className="mr-1" />Documents
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Create PO Modal ── */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Purchase Order" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Product *" required value={form.productId} onChange={(e) => handleProductChange(e.target.value)}>
              <option value="">Select product...</option>
              {products?.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.wattage}W)</option>)}
            </Select>
            <Select label="Supplier *" required value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
              <option value="">Select supplier...</option>
              {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Select label="LC Type" value={form.lcType} onChange={(e) => setForm({ ...form, lcType: e.target.value, usanceDays: "" })}>
              <option value="TT">TT</option>
              <option value="SIGHT">Sight LC</option>
              <option value="USANCE">Usance LC</option>
              <option value="LOCAL">Local</option>
            </Select>
            {form.lcType === "USANCE" ? (
              <Input label="Usance Days *" type="number" placeholder="e.g. 90" value={form.usanceDays} onChange={(e) => setForm({ ...form, usanceDays: e.target.value })} />
            ) : (
              <Input label="LC Number" value={form.lcNumber} onChange={(e) => setForm({ ...form, lcNumber: e.target.value })} />
            )}
            <Select label="Bank" value={form.bankId} onChange={(e) => setForm({ ...form, bankId: e.target.value })}>
              <option value="">Select bank...</option>
              {banks?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>

          {form.lcType === "USANCE" && (
            <Input label="LC Number" value={form.lcNumber} onChange={(e) => setForm({ ...form, lcNumber: e.target.value })} />
          )}

          <div className="grid grid-cols-3 gap-4">
            <Input label="No. of Panels *" type="number" required value={form.noOfPanels} onChange={(e) => setForm({ ...form, noOfPanels: e.target.value })} />
            <Input label="Panel Wattage (W) *" type="number" required value={form.panelWattage} onChange={(e) => setForm({ ...form, panelWattage: e.target.value })} />
            {isLocal ? (
              <Input label="Rs per Watt *" type="number" step="0.01" required value={form.rsPerWatt} onChange={(e) => setForm({ ...form, rsPerWatt: e.target.value })} placeholder="e.g. 62.50" />
            ) : (
              <Input label="USD per Watt *" type="number" step="0.001" required value={form.usdPerWatt} onChange={(e) => setForm({ ...form, usdPerWatt: e.target.value })} />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select label={isLocal ? "Exchange Rate (for USD equivalent)" : "Exchange Rate"} value={form.exchangeRateId} onChange={(e) => handleRateChange(e.target.value)}>
              <option value="">Select rate...</option>
              {rates?.map((r) => <option key={r.id} value={r.id}>{r.source} — Rs {r.rate}{r.notes ? ` (${r.notes})` : ""}</option>)}
            </Select>
            <Input label="Rate to Use (PKR/USD)" type="number" step="0.01" value={form.customRate} onChange={(e) => setForm({ ...form, customRate: e.target.value })} placeholder="Auto-filled from selection above" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select label="Destination Warehouse" value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
              <option value="">Select warehouse...</option>
              {warehouses?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
            <Select label="Linked Costing" value={form.costingId} onChange={(e) => setForm({ ...form, costingId: e.target.value })}>
              <option value="">No costing linked</option>
              {costings?.filter((c) => c.status === "FINALIZED").map((c) => (
                <option key={c.id} value={c.id}>{c.reference} — Rs {c.landedCostPerWatt?.toFixed(2)}/W</option>
              ))}
            </Select>
          </div>

          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

          {form.noOfPanels && form.panelWattage && (isLocal ? form.rsPerWatt : form.usdPerWatt) && (
            <div className="bg-blue-50 rounded-lg p-4 text-sm space-y-1">
              <p className="font-medium text-blue-900">Summary</p>
              {(() => {
                const panels = parseInt(form.noOfPanels) || 0
                const wattage = parseInt(form.panelWattage) || 0
                const totalKW = (panels * wattage / 1000).toFixed(1)
                const selectedProduct = products?.find((p) => p.id === form.productId)
                const panelsPerContainer = selectedProduct?.panelsPerContainer
                const palletsPerContainer = selectedProduct?.palletsPerContainer
                const containers = panelsPerContainer && panelsPerContainer > 0 ? Math.ceil(panels / panelsPerContainer) : null
                const pallets = panelsPerContainer && palletsPerContainer && panelsPerContainer > 0
                  ? Math.ceil(panels / (panelsPerContainer / palletsPerContainer))
                  : null

                if (isLocal) {
                  const rsPW = parseFloat(form.rsPerWatt) || 0
                  const totalPKR = panels * wattage * rsPW
                  const totalUSD = effectiveRate > 0 ? totalPKR / effectiveRate : null
                  return (
                    <div className="text-blue-700 space-y-0.5">
                      <p>{panels.toLocaleString()} panels × {wattage}W = {totalKW} kW</p>
                      {containers !== null && <p className="font-medium text-blue-800">Containers: {containers} · {panelsPerContainer} panels/container{pallets !== null ? ` · Pallets: ${pallets}` : ""}</p>}
                      <p>Rs/Watt: Rs {rsPW}</p>
                      <p className="font-semibold">Total PKR: Rs {totalPKR.toLocaleString()}</p>
                      {totalUSD !== null && (
                        <p>≈ USD ${totalUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })} @ Rs {effectiveRate}</p>
                      )}
                    </div>
                  )
                }
                const usdPW = parseFloat(form.usdPerWatt) || 0
                const totalUSD = (panels * wattage * usdPW).toLocaleString()
                const totalPKR = effectiveRate > 0 ? (panels * wattage * usdPW * effectiveRate).toLocaleString() : "—"
                return (
                  <div className="text-blue-700 space-y-0.5">
                    <p>{panels.toLocaleString()} panels × {wattage}W = {totalKW} kW</p>
                    {containers !== null && <p className="font-medium text-blue-800">Containers: {containers} · {panelsPerContainer} panels/container{pallets !== null ? ` · Pallets: ${pallets}` : ""}</p>}
                    <p>Total USD: ${totalUSD}</p>
                    <p>Total PKR @ Rs{effectiveRate || "?"}: Rs {totalPKR}</p>
                  </div>
                )
              })()}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={saving}>Create PO</Button>
          </div>
        </div>
      </Modal>

      {/* ── Costing / Clearing Charges Modal ── */}
      <Modal isOpen={showClear} onClose={() => setShowClear(false)} title={`${selectedPO?.lcType === "LOCAL" ? "Calculate Costing" : "Clearing Charges"} — ${selectedPO?.poNumber}`} size="lg">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            {selectedPO?.lcType === "LOCAL"
              ? "Enter the total cost breakdown for this local purchase. All amounts in PKR."
              : "Enter all charges as per vendor bills. All amounts in PKR unless noted."}
          </p>

          {/* FOB / CNF toggle for non-local POs */}
          {selectedPO?.lcType !== "LOCAL" && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">Shipping Terms:</span>
              {(["FOB", "CNF"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setIncoterm(t)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    incoterm === t
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {t}
                </button>
              ))}
              <span className="text-xs text-gray-400">
                {incoterm === "FOB" ? "Freight charged separately" : "Freight included in price — skip freight"}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              label={selectedPO?.lcType === "LOCAL" ? "Local Purchase Value PKR *" : "Document LC Value PKR *"}
              type="number" step="0.01"
              value={clearForm.lcValuePkr}
              onChange={(e) => setClearForm({ ...clearForm, lcValuePkr: e.target.value })}
            />

            {/* Import Shipping Freight — USD inputs for non-local FOB; hidden for CNF */}
            {selectedPO?.lcType !== "LOCAL" && incoterm === "FOB" ? (
              <div className="col-span-2 bg-gray-50 rounded-lg p-3 space-y-3 border border-gray-200">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Import Shipping Freight (USD → PKR)</p>
                <div className="grid grid-cols-3 gap-3">
                  <Input
                    label="Freight (USD $)"
                    type="number" step="0.01"
                    value={freightUsd}
                    onChange={(e) => {
                      setFreightUsd(e.target.value)
                      const pkr = (parseFloat(e.target.value) || 0) * (parseFloat(freightExRate) || 0)
                      if (pkr > 0) setClearForm((prev) => ({ ...prev, importShippingFreight: pkr.toFixed(2) }))
                    }}
                    placeholder="e.g. 15000"
                  />
                  <Input
                    label="Exchange Rate (PKR/USD)"
                    type="number" step="0.01"
                    value={freightExRate}
                    onChange={(e) => {
                      setFreightExRate(e.target.value)
                      const pkr = (parseFloat(freightUsd) || 0) * (parseFloat(e.target.value) || 0)
                      if (pkr > 0) setClearForm((prev) => ({ ...prev, importShippingFreight: pkr.toFixed(2) }))
                    }}
                    placeholder="e.g. 278.50"
                  />
                  <Input
                    label="Freight PKR (auto-computed)"
                    type="number" step="0.01"
                    value={clearForm.importShippingFreight}
                    onChange={(e) => setClearForm({ ...clearForm, importShippingFreight: e.target.value })}
                    placeholder={computedFreightPkr > 0 ? computedFreightPkr.toFixed(2) : "0"}
                  />
                </div>
              </div>
            ) : selectedPO?.lcType === "LOCAL" ? (
              <Input
                label="Import Shipping Freight"
                type="number" step="0.01"
                value={clearForm.importShippingFreight}
                onChange={(e) => setClearForm({ ...clearForm, importShippingFreight: e.target.value })}
              />
            ) : null}

            {[
              { key: "bankCharges",        label: "Bank Charges" },
              { key: "marineInsurance",    label: "Insurance Marine/Transit 0.15%" },
              { key: "exciseCharges",      label: "Excise 0.80%" },
              { key: "shippingDO",         label: "Shipping DO" },
              { key: "terminalHandling",   label: "Terminal (THC)" },
              { key: "clearingCharges",    label: "Misc Customs & Clearing" },
              { key: "miscClearing",       label: "Miscellaneous Clearing" },
              { key: "containerTransport", label: "Transportation" },
              { key: "gstInputAmount",     label: "GST Paid at Import (part of cost)" },
            ].map(({ key, label }) => (
              <Input
                key={key}
                label={label}
                type="number"
                step="0.01"
                value={clearForm[key as keyof typeof clearForm]}
                onChange={(e) => setClearForm({ ...clearForm, [key]: e.target.value })}
              />
            ))}
          </div>

          <div className="bg-blue-50 rounded-lg p-4 space-y-1 text-sm">
            <div className="flex justify-between font-semibold text-blue-900">
              <span>Total Landed Cost:</span>
              <span>{formatCurrency(clearTotal)}</span>
            </div>
            {selectedPO && clearTotal > 0 && (
              <>
                <div className="flex justify-between text-blue-700">
                  <span>Per Panel ({selectedPO.noOfPanels.toLocaleString()} panels):</span>
                  <span>{formatCurrency(clearTotal / selectedPO.noOfPanels)}</span>
                </div>
                <div className="flex justify-between text-blue-700">
                  <span>Avg/W ({selectedPO.panelWattage}W):</span>
                  <span>Rs {(clearTotal / (selectedPO.noOfPanels * selectedPO.panelWattage)).toFixed(2)}</span>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowClear(false)}>Cancel</Button>
            <Button onClick={handleClear} loading={saving}>
              {selectedPO?.lcType === "LOCAL" ? "Save Costing & Mark Ready" : "Save Clearing Charges"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Documents Modal ── */}
      <Modal isOpen={showDocs} onClose={() => { setShowDocs(false); setPoDocs([]) }} title={`Documents — ${selectedPO?.poNumber}`} size="lg">
        <div className="space-y-4">
          <div className="flex items-end gap-3 p-4 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
              <select
                aria-label="Document Type"
                title="Document Type"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <Button onClick={() => fileInputRef.current?.click()} loading={uploadingDoc} variant="secondary">
              <Upload size={14} className="mr-2" />Upload File
            </Button>
          </div>

          {poDocs.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">No documents uploaded yet.</div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Uploaded Documents</div>
              {poDocs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                      <Paperclip size={14} className="text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{doc.docType}</p>
                      <p className="text-xs text-gray-500">{doc.fileName} · {doc.uploadedBy} · {formatDate(doc.uploadedAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" title={`Open ${doc.fileName}`}>
                      <Button size="sm" variant="ghost"><ExternalLink size={14} /></Button>
                    </a>
                    <Button size="sm" variant="ghost" onClick={() => handleDeleteDoc(doc.id)}>
                      <Trash2 size={14} className="text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Required Document Checklist</p>
            <div className="grid grid-cols-2 gap-1">
              {DOC_TYPES.slice(0, 6).map((type) => {
                const uploaded = poDocs.some((d) => d.docType === type)
                return (
                  <div key={type} className={`flex items-center gap-2 text-xs p-1.5 rounded ${uploaded ? "text-green-700" : "text-gray-400"}`}>
                    <span>{uploaded ? "✓" : "○"}</span>
                    <span>{type}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
