"use client"

import { useState, useRef, useEffect } from "react"
import { useFetch } from "@/hooks/useFetch"
import { useLookups } from "@/components/lookups/LookupsProvider"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Badge } from "@/components/ui/Badge"
import { Modal } from "@/components/ui/Modal"
import { Drawer } from "@/components/ui/Drawer"
import { Table } from "@/components/ui/Table"
import { CsvImport } from "@/components/ui/CsvImport"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu"
import { formatAmount, formatCurrency, formatDate, statusRowClass } from "@/lib/utils"
import { Plus, FileCheck, Upload, Paperclip, Trash2, ExternalLink, Pencil } from "lucide-react"
import toast from "react-hot-toast"

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
  // FK IDs for direct use in edit form
  productId: string
  supplierId: string
  bankId: string | null
  warehouseId: string | null
  exchangeRateId: string | null
  costingId: string | null
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
  clearingExchangeRate: number | null
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
  const { data: costings } = useFetch<{ id: string; reference: string; status: string; landedCostPerWatt: number }[]>("/api/costing")
  // Shared master-data lists come from the once-per-session lookups cache.
  const lookups = useLookups()
  const products = lookups.products as ProductOption[]
  const suppliers = lookups.suppliers as { id: string; name: string }[]
  const warehouses = lookups.warehouses as { id: string; name: string }[]
  const banks = lookups.banks as { id: string; name: string }[]
  const rates = lookups.exchangeRates as { id: string; source: string; rate: number; notes: string | null }[]

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

  const [editingPoId, setEditingPoId] = useState<string | null>(null)

  const emptyForm = {
    productId: "", supplierId: "", lcType: "TT", lcNumber: "", usanceDays: "",
    bankId: "", warehouseId: "", noOfPanels: "", panelWattage: "",
    usdPerWatt: "", rsPerWatt: "", exchangeRateId: "", customRate: "", costingId: "", notes: "",
  }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    if (warehouses && warehouses.length > 0 && !form.warehouseId) {
      setForm((prev) => ({ ...prev, warehouseId: warehouses[0].id }))
    }
  }, [warehouses])

  const [clearForm, setClearForm] = useState({
    lcValuePkr: "", importShippingFreight: "",
    bankCharges: "", marineInsurance: "", exciseCharges: "",
    shippingDO: "", terminalHandling: "", clearingCharges: "", miscClearing: "",
    containerTransport: "", gstInputAmount: "",
    clearingExchangeRate: "",
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

  const openEditPO = (po: PO) => {
    setEditingPoId(po.id)
    setForm({
      productId: po.productId,
      supplierId: po.supplierId,
      lcType: po.lcType,
      lcNumber: po.lcNumber ?? "",
      usanceDays: po.usanceDays ? String(po.usanceDays) : "",
      bankId: po.bankId ?? "",
      warehouseId: po.warehouseId ?? "",
      noOfPanels: String(po.noOfPanels),
      panelWattage: String(po.panelWattage),
      usdPerWatt: String(po.usdPerWatt ?? ""),
      rsPerWatt: "",
      exchangeRateId: po.exchangeRateId ?? "",
      customRate: po.exchangeRate ? String(po.exchangeRate.rate) : "",
      costingId: po.costingId ?? "",
      notes: po.notes ?? "",
    })
    setShowCreate(true)
    setShowDetail(false)
  }

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

      const url = editingPoId ? `/api/purchase-orders/${editingPoId}` : "/api/purchase-orders"
      const method = editingPoId ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, totalWatts, totalValueUsd, poAmountPkr, usdPerWatt }),
      })

      if (res.ok) {
        toast.success(editingPoId ? "Purchase order updated" : "Purchase order created")
        setShowCreate(false)
        setEditingPoId(null)
        setForm(emptyForm)
        refetch()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to save PO")
      }
    } finally {
      setSaving(false)
    }
  }

  const emptyClearForm = { lcValuePkr: "", importShippingFreight: "", bankCharges: "", marineInsurance: "", exciseCharges: "", shippingDO: "", terminalHandling: "", clearingCharges: "", miscClearing: "", containerTransport: "", gstInputAmount: "", clearingExchangeRate: "" }

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
        setClearForm(emptyClearForm)
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
    const alreadyCleared = po.totalLandedCost != null
    setClearForm({
      lcValuePkr: alreadyCleared ? String(po.lcValuePkr ?? "") : String(po.poAmountPkr || ""),
      importShippingFreight: String(po.importShippingFreight ?? ""),
      bankCharges:           String(po.bankCharges ?? ""),
      marineInsurance:       String(po.marineInsurance ?? ""),
      exciseCharges:         String(po.exciseCharges ?? ""),
      shippingDO:            String(po.shippingDO ?? ""),
      terminalHandling:      String(po.terminalHandling ?? ""),
      clearingCharges:       String(po.clearingCharges ?? ""),
      miscClearing:          String(po.miscClearing ?? ""),
      containerTransport:    String(po.containerTransport ?? ""),
      gstInputAmount:        String(po.gstInputAmount ?? ""),
      clearingExchangeRate:  String(po.clearingExchangeRate ?? (po.exchangeRate?.rate ?? "")),
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

  // Single source of truth for PO row actions — shown in the table's 3-dot
  // menu and at the bottom of the detail drawer.
  const poRowActions = (row: PO): RowAction[] => {
    const actions: RowAction[] = []
    if (row.status !== "RECEIVED") {
      actions.push({ label: "Edit", icon: <Pencil size={15} />, onClick: () => openEditPO(row) })
    }
    if (row.status === "DRAFT") {
      actions.push({ label: "Confirm", icon: <FileCheck size={15} />, onClick: () => handleStatusChange(row.id, "CONFIRMED") })
    }
    if (row.status === "CONFIRMED" && row.lcType !== "LOCAL") {
      actions.push({ label: "Mark Shipped", onClick: () => handleStatusChange(row.id, "SHIPPED") })
    }
    if (row.status === "SHIPPED" || row.status === "READY_TO_RECEIVE") {
      actions.push({ label: row.status === "READY_TO_RECEIVE" ? "Edit Clearing" : "Clearing", icon: <FileCheck size={15} />, onClick: () => openCosting(row) })
    }
    actions.push({ label: "Documents", icon: <Paperclip size={15} />, onClick: () => openDocs(row) })
    return actions
  }

  const columns = [
    { key: "poNumber", header: "PO Number", sortable: true },
    { key: "createdAt", header: "Date", numeric: true, render: (row: PO) => formatDate(row.createdAt) },
    { key: "product", header: "Product", sortable: true, value: (row: PO) => row.product?.name, render: (row: PO) => <div><p className="font-medium text-sm">{row.product?.name}</p><p className="text-xs text-tertiary">{row.product?.code}</p></div> },
    { key: "supplier", header: "Supplier", sortable: true, value: (row: PO) => row.supplier?.name || "—", render: (row: PO) => row.supplier?.name || "—" },
    { key: "lcNumber", header: "LC No.", render: (row: PO) => (
      row.lcNumber
        ? <span className="text-xs font-medium text-foreground">{row.lcNumber}</span>
        : <span className="text-tertiary text-xs">—</span>
    )},
    { key: "noOfPanels", header: "Quantity", numeric: true, render: (row: PO) => `${row.noOfPanels.toLocaleString()} × ${row.panelWattage}W` },
    {
      key: "totalValueUsd", header: "Value (USD)", numeric: true,
      render: (row: PO) => row.totalValueUsd > 0
        ? row.totalValueUsd.toLocaleString()
        : <span className="text-tertiary">—</span>
    },
    { key: "poAmountPkr", header: "PKR Amount (PKR)", numeric: true, render: (row: PO) => formatAmount(row.poAmountPkr) },
    { key: "landedCostPerPanel", header: "Landed/Panel (PKR)", numeric: true, render: (row: PO) => row.landedCostPerPanel ? formatAmount(row.landedCostPerPanel) : <span className="text-tertiary">—</span> },
    { key: "status", header: "Status", render: (row: PO) => <Badge status={row.status} /> },
    {
      key: "actions",
      header: "Actions",
      render: (row: PO) => (
        <RowActionsMenu
          actions={[
            { label: "View Details", icon: <ExternalLink size={15} />, onClick: () => openDetail(row) },
            ...poRowActions(row),
          ]}
        />
      ),
    },
  ]

  if (loading) return <TableSkeleton columns={7} rows={10} />

  return (
    <div className="space-y-6 animate-fade-in-up">
      <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" title="Upload document" onChange={handleDocUpload} />

      <Header
        title="Purchase Orders"
        actions={
          <div className="flex gap-2">
            <CsvImport
              endpoint="/api/import/purchase-orders"
              title="Import Purchase Orders"
              sampleName="purchase-orders"
              guide='Date format: DD-MM-YYYY (e.g. 08-05-2026 = 8 May). Creates purchase orders (status RECEIVED). Products must already exist; new suppliers are created automatically. "Local Purchase" in LC Ref marks a local PO. Stock is received separately.'
              sampleColumns={["Supplier", "Date", "LC Ref", "Product", "Qty Panels", "Qty Containers", "Rate per Watt (PKR)", "Panel Wattage", "Qty Watts", "PKR Value"]}
              sampleRows={[
                ["FORMAT → supplier name (new ones auto-created)", "DD-MM-YYYY (08-05-2026 = 8 May)", "LC-XXXX or \"Local Purchase\"", "Exact product name as in system", "Number", "Number", "Number (e.g. 35.62)", "Number (e.g. 665)", "Number", "Number only — no commas"],
                ["Import", "08-05-2026", "LC-84350", "Aiko - 665 BF", "3600", "5", "35.62", "665", "2394000", "85274280"],
                ["GO Power", "15-05-2026", "Local Purchase", "Longi Himo 10 - 645 Mono", "720", "1", "38.6", "645", "464400", "17925840"],
              ]}
              onComplete={refetch}
            />
            <Button onClick={() => setShowCreate(true)}><Plus size={16} className="mr-2" />New PO</Button>
          </div>
        }
      />

      <div className="bg-surface rounded-xl shadow-card border border-line">
        <Table
          columns={columns}
          data={pos || []}
          emptyMessage="No purchase orders yet"
          rowClassName={(row: PO) => statusRowClass(row.status)}
          onRowClick={openDetail}
          searchPlaceholder="Search PO #, product, supplier, LC #…"
          searchKeys={["product.code", "lcNumber"]}
          filters={[
            { key: "status", label: "Status", value: (row: PO) => row.status },
            { key: "supplier", label: "Supplier", value: (row: PO) => row.supplier?.name || "—" },
            { key: "lcType", label: "LC Type", value: (row: PO) => row.lcType },
            { key: "createdAt", label: "Date", type: "date", value: (row: PO) => row.createdAt },
          ]}
        />
      </div>

      {/* ── PO Detail slide-over ── */}
      <Drawer isOpen={showDetail} onClose={() => { setShowDetail(false); setSelectedPO(null) }} title={`PO Details — ${selectedPO?.poNumber}`} size="xl">
        {selectedPO && (
          <div className="space-y-5 text-sm">

            {/* ── Section: Basic Info ── */}
            <div>
              <p className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-2">Purchase Order Info</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div>
                  <p className="text-xs text-secondary">PO Number</p>
                  <p className="font-semibold text-foreground">{selectedPO.poNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-secondary">Status</p>
                  <Badge status={selectedPO.status} />
                </div>
                <div>
                  <p className="text-xs text-secondary">Product</p>
                  <p className="font-semibold text-foreground">{selectedPO.product?.name}</p>
                  <p className="text-xs text-tertiary">{selectedPO.product?.code} · {selectedPO.product?.wattage}W</p>
                </div>
                <div>
                  <p className="text-xs text-secondary">Supplier</p>
                  <p className="font-semibold text-foreground">{selectedPO.supplier?.name}</p>
                </div>
                <div>
                  <p className="text-xs text-secondary">LC Type</p>
                  <p className="font-semibold text-foreground">
                    {selectedPO.lcType}
                    {selectedPO.lcType === "USANCE" && selectedPO.usanceDays ? ` — ${selectedPO.usanceDays} days usance` : ""}
                  </p>
                  {selectedPO.lcNumber && <p className="text-xs text-tertiary">LC#: {selectedPO.lcNumber}</p>}
                </div>
                <div>
                  <p className="text-xs text-secondary">Bank</p>
                  <p className="font-semibold text-foreground">{selectedPO.bank?.name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-secondary">Destination Warehouse</p>
                  <p className="font-semibold text-foreground">{selectedPO.warehouse?.name || "—"}</p>
                  {selectedPO.warehouse?.location && <p className="text-xs text-tertiary">{selectedPO.warehouse.location}</p>}
                </div>
                {selectedPO.leadTimeDays && (
                  <div>
                    <p className="text-xs text-secondary">Lead Time</p>
                    <p className="font-semibold text-foreground tabular-nums">{selectedPO.leadTimeDays} days</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-secondary">Created</p>
                  <p className="font-semibold text-foreground tabular-nums">{formatDate(selectedPO.createdAt)}</p>
                </div>
              </div>
            </div>

            {/* ── Section: Quantity & Pricing ── */}
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-2">Quantity & Pricing</p>
              <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                <div>
                  <p className="text-xs text-secondary">No. of Panels</p>
                  <p className="font-semibold text-foreground tabular-nums">{selectedPO.noOfPanels.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-secondary">Panel Wattage</p>
                  <p className="font-semibold text-foreground tabular-nums">{selectedPO.panelWattage}W</p>
                </div>
                <div>
                  <p className="text-xs text-secondary">Total Watts</p>
                  <p className="font-semibold text-foreground tabular-nums">{(selectedPO.totalWatts || selectedPO.noOfPanels * selectedPO.panelWattage).toLocaleString()} W</p>
                  <p className="text-xs text-tertiary tabular-nums">{((selectedPO.totalWatts || selectedPO.noOfPanels * selectedPO.panelWattage) / 1000).toFixed(1)} kW</p>
                </div>
                {(() => {
                  const ppc = selectedPO.product?.panelsPerContainer
                  const computed = ppc && ppc > 0 ? Math.ceil(selectedPO.noOfPanels / ppc) : selectedPO.noOfContainers
                  return computed ? (
                    <>
                      <div>
                        <p className="text-xs text-secondary">No. of Containers</p>
                        <p className="font-semibold text-blue-700 dark:text-blue-300 tabular-nums">{computed}</p>
                      </div>
                      {selectedPO.noOfPallets && (
                        <div>
                          <p className="text-xs text-secondary">No. of Pallets</p>
                          <p className="font-semibold text-foreground tabular-nums">{selectedPO.noOfPallets}</p>
                        </div>
                      )}
                    </>
                  ) : null
                })()}
                {selectedPO.lcType !== "LOCAL" && (
                  <div>
                    <p className="text-xs text-secondary">USD per Watt</p>
                    <p className="font-semibold text-foreground tabular-nums">${selectedPO.usdPerWatt?.toFixed(4)}</p>
                  </div>
                )}
                {selectedPO.exchangeRate && (
                  <div>
                    <p className="text-xs text-secondary">Exchange Rate</p>
                    <p className="font-semibold text-foreground tabular-nums">Rs {selectedPO.exchangeRate.rate}</p>
                    <p className="text-xs text-tertiary">{selectedPO.exchangeRate.source}{selectedPO.exchangeRate.notes ? ` · ${selectedPO.exchangeRate.notes}` : ""}</p>
                  </div>
                )}
                {selectedPO.totalValueUsd > 0 && (
                  <div>
                    <p className="text-xs text-secondary">Total USD Value</p>
                    <p className="font-semibold text-foreground tabular-nums">${selectedPO.totalValueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-secondary">PKR Amount (at booking)</p>
                  <p className="font-semibold text-foreground tabular-nums">{formatCurrency(selectedPO.poAmountPkr)}</p>
                </div>
              </div>
            </div>

            {/* ── Section: Linked Costing ── */}
            {selectedPO.costing && (
              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-2">Linked Costing</p>
                <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                  <div>
                    <p className="text-xs text-secondary">Costing Reference</p>
                    <p className="font-semibold text-foreground">{selectedPO.costing.reference}</p>
                  </div>
                  <div>
                    <p className="text-xs text-secondary">Landed Cost/Watt</p>
                    <p className="font-semibold text-blue-700 dark:text-blue-300 tabular-nums">Rs {selectedPO.costing.landedCostPerWatt?.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-secondary">Landed Cost/Panel</p>
                    <p className="font-semibold text-blue-700 dark:text-blue-300 tabular-nums">{formatCurrency(selectedPO.costing.landedCostPerPanel)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Section: Clearing Charges ── */}
            {selectedPO.totalLandedCost != null && (
              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-2">Clearing Charges</p>

                {/* Exchange rate comparison */}
                {selectedPO.lcType !== "LOCAL" && (selectedPO.exchangeRate || selectedPO.clearingExchangeRate) && (
                  <div className="grid grid-cols-3 gap-3 mb-3 p-3 bg-amber-50 dark:bg-amber-500/10 rounded-lg border border-amber-100 dark:border-amber-500/30 text-sm">
                    {selectedPO.totalValueUsd > 0 && (
                      <div>
                        <p className="text-xs text-amber-700 dark:text-amber-300">PO USD Value</p>
                        <p className="font-semibold text-foreground tabular-nums">${selectedPO.totalValueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                      </div>
                    )}
                    {selectedPO.exchangeRate && (
                      <div>
                        <p className="text-xs text-amber-700 dark:text-amber-300">Rate at Booking</p>
                        <p className="font-semibold text-foreground tabular-nums">Rs {selectedPO.exchangeRate.rate}</p>
                      </div>
                    )}
                    {selectedPO.clearingExchangeRate && (
                      <div>
                        <p className="text-xs text-amber-700 dark:text-amber-300">Rate at Clearing</p>
                        <p className="font-semibold text-foreground tabular-nums">Rs {selectedPO.clearingExchangeRate}</p>
                      </div>
                    )}
                  </div>
                )}

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
                    { label: "Administrative Cost", value: selectedPO.miscClearing },
                    { label: "Transportation",         value: selectedPO.containerTransport },
                    { label: "GST Paid at Import",     value: selectedPO.gstInputAmount },
                  ].filter(({ value }) => value != null && value > 0).map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between py-1 border-b border-line">
                      <span className="text-secondary">{label}</span>
                      <span className="font-medium text-foreground tabular-nums">{formatCurrency(value!)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg p-3 grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-blue-600 dark:text-blue-300">Total Landed Cost</p>
                    <p className="font-bold text-blue-900 dark:text-blue-300 tabular-nums">{formatCurrency(selectedPO.totalLandedCost)}</p>
                  </div>
                  {selectedPO.landedCostPerPanel && (
                    <div>
                      <p className="text-xs text-blue-600 dark:text-blue-300">Per Panel</p>
                      <p className="font-bold text-blue-900 dark:text-blue-300 tabular-nums">{formatCurrency(selectedPO.landedCostPerPanel)}</p>
                    </div>
                  )}
                  {selectedPO.landedCostPerWatt && (
                    <div>
                      <p className="text-xs text-blue-600 dark:text-blue-300">Per Watt</p>
                      <p className="font-bold text-blue-900 dark:text-blue-300 tabular-nums">Rs {selectedPO.landedCostPerWatt.toFixed(2)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Notes ── */}
            {selectedPO.notes && (
              <div className="border-t pt-3">
                <p className="text-xs text-secondary mb-1">Notes</p>
                <p className="text-secondary whitespace-pre-line">{selectedPO.notes}</p>
              </div>
            )}

            {/* ── Actions ── */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
              {poRowActions(selectedPO).map((a) => (
                <Button
                  key={a.label}
                  size="sm"
                  variant={a.danger ? "danger" : "secondary"}
                  disabled={a.disabled}
                  onClick={() => { setShowDetail(false); setSelectedPO(null); a.onClick() }}
                >
                  {a.icon && <span className="mr-1.5">{a.icon}</span>}
                  {a.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Drawer>

      {/* ── Create / Edit PO Modal ── */}
      <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); setEditingPoId(null); setForm(emptyForm) }} title={editingPoId ? "Edit Purchase Order" : "Create Purchase Order"} size="lg">
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

          <div className={`grid gap-4 ${isLocal ? "grid-cols-1" : "grid-cols-3"}`}>
            <Select label="LC Type" value={form.lcType} onChange={(e) => setForm({ ...form, lcType: e.target.value, usanceDays: "", lcNumber: "", bankId: "" })}>
              <option value="TT">TT</option>
              <option value="SIGHT">Sight LC</option>
              <option value="USANCE">Usance LC</option>
              <option value="LOCAL">Local</option>
            </Select>
            {!isLocal && (
              <>
                {form.lcType === "USANCE" ? (
                  <Input label="Usance Days *" type="number" placeholder="e.g. 90" value={form.usanceDays} onChange={(e) => setForm({ ...form, usanceDays: e.target.value })} />
                ) : (
                  <Input label="LC Number" value={form.lcNumber} onChange={(e) => setForm({ ...form, lcNumber: e.target.value })} />
                )}
                <Select label="Bank" value={form.bankId} onChange={(e) => setForm({ ...form, bankId: e.target.value })}>
                  <option value="">Select bank...</option>
                  {banks?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </>
            )}
          </div>

          {!isLocal && form.lcType === "USANCE" && (
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

          {!isLocal && (
            <div className="grid grid-cols-2 gap-4">
              <Select label="Exchange Rate" value={form.exchangeRateId} onChange={(e) => handleRateChange(e.target.value)}>
                <option value="">Select rate...</option>
                {rates?.map((r) => <option key={r.id} value={r.id}>{r.source} — Rs {r.rate}{r.notes ? ` (${r.notes})` : ""}</option>)}
              </Select>
              <Input label="Rate to Use (PKR/USD)" type="number" step="0.01" value={form.customRate} onChange={(e) => setForm({ ...form, customRate: e.target.value })} placeholder="Auto-filled from selection above" />
            </div>
          )}

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
            <div className="bg-blue-50 dark:bg-blue-500/10 rounded-lg p-4 text-sm space-y-1">
              <p className="font-medium text-blue-900 dark:text-blue-300">Summary</p>
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
                    <div className="text-blue-700 dark:text-blue-300 space-y-0.5">
                      <p>{panels.toLocaleString()} panels × {wattage}W = {totalKW} kW</p>
                      {containers !== null && <p className="font-medium text-blue-800 dark:text-blue-300">Containers: {containers} · {panelsPerContainer} panels/container{pallets !== null ? ` · Pallets: ${pallets}` : ""}</p>}
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
                  <div className="text-blue-700 dark:text-blue-300 space-y-0.5">
                    <p>{panels.toLocaleString()} panels × {wattage}W = {totalKW} kW</p>
                    {containers !== null && <p className="font-medium text-blue-800 dark:text-blue-300">Containers: {containers} · {panelsPerContainer} panels/container{pallets !== null ? ` · Pallets: ${pallets}` : ""}</p>}
                    <p>Total USD: ${totalUSD}</p>
                    <p>Total PKR @ Rs{effectiveRate || "?"}: Rs {totalPKR}</p>
                  </div>
                )
              })()}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => { setShowCreate(false); setEditingPoId(null); setForm(emptyForm) }}>Cancel</Button>
            <Button onClick={handleCreate} loading={saving}>{editingPoId ? "Save Changes" : "Create PO"}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Costing / Clearing Charges Modal ── */}
      <Modal isOpen={showClear} onClose={() => setShowClear(false)} title={`${selectedPO?.lcType === "LOCAL" ? "Calculate Costing" : "Clearing Charges"} — ${selectedPO?.poNumber}`} size="lg">
        <div className="space-y-4">
          <p className="text-sm text-secondary">
            {selectedPO?.lcType === "LOCAL"
              ? "Enter the total cost breakdown for this local purchase. All amounts in PKR."
              : "Enter all charges as per vendor bills. All amounts in PKR unless noted."}
          </p>

          {/* PO reference values */}
          {selectedPO && selectedPO.lcType !== "LOCAL" && selectedPO.totalValueUsd > 0 && (
            <div className="bg-muted rounded-lg p-3 grid grid-cols-3 gap-3 text-sm border border-line">
              <div>
                <p className="text-xs text-secondary">PO USD Value</p>
                <p className="font-semibold text-foreground">${selectedPO.totalValueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-xs text-secondary">Rate at PO Booking</p>
                <p className="font-semibold text-foreground">
                  {selectedPO.exchangeRate ? `Rs ${selectedPO.exchangeRate.rate}` : "—"}
                </p>
                {selectedPO.exchangeRate?.source && <p className="text-xs text-tertiary">{selectedPO.exchangeRate.source}</p>}
              </div>
              <div>
                <p className="text-xs text-secondary">PKR at Booking</p>
                <p className="font-semibold text-foreground">{formatCurrency(selectedPO.poAmountPkr)}</p>
              </div>
            </div>
          )}

          {/* FOB / CNF toggle for non-local POs */}
          {selectedPO?.lcType !== "LOCAL" && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-secondary">Shipping Terms:</span>
              {(["FOB", "CNF"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setIncoterm(t)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    incoterm === t
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-surface text-secondary border-line-strong hover:border-line-strong"
                  }`}
                >
                  {t}
                </button>
              ))}
              <span className="text-xs text-tertiary">
                {incoterm === "FOB" ? "Freight charged separately" : "Freight included in price — skip freight"}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Clearing exchange rate + auto-compute LC value for non-local */}
            {selectedPO?.lcType !== "LOCAL" && (
              <Input
                label="Exchange Rate at Clearing (PKR/USD)"
                type="number" step="0.01"
                value={clearForm.clearingExchangeRate}
                onChange={(e) => {
                  const rate = e.target.value
                  setClearForm((prev) => {
                    const pkr = selectedPO && parseFloat(rate) > 0
                      ? (selectedPO.totalValueUsd * parseFloat(rate)).toFixed(2)
                      : prev.lcValuePkr
                    return { ...prev, clearingExchangeRate: rate, lcValuePkr: pkr }
                  })
                }}
                placeholder={selectedPO?.exchangeRate ? String(selectedPO.exchangeRate.rate) : "e.g. 282.50"}
              />
            )}
            <Input
              label={selectedPO?.lcType === "LOCAL" ? "Local Purchase Value PKR *" : "Document LC Value PKR *"}
              type="number" step="0.01"
              value={clearForm.lcValuePkr}
              onChange={(e) => setClearForm({ ...clearForm, lcValuePkr: e.target.value })}
            />

            {/* Import Shipping Freight — USD inputs for non-local FOB; hidden for CNF */}
            {selectedPO?.lcType !== "LOCAL" && incoterm === "FOB" ? (
              <div className="col-span-2 bg-muted rounded-lg p-3 space-y-3 border border-line">
                <p className="text-xs font-semibold text-secondary uppercase tracking-wide">Import Shipping Freight (USD → PKR)</p>
                <div className="grid grid-cols-2 gap-3">
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
                    label="Freight Exchange Rate (PKR/USD)"
                    type="number" step="0.01"
                    value={freightExRate}
                    onChange={(e) => {
                      setFreightExRate(e.target.value)
                      const pkr = (parseFloat(freightUsd) || 0) * (parseFloat(e.target.value) || 0)
                      if (pkr > 0) setClearForm((prev) => ({ ...prev, importShippingFreight: pkr.toFixed(2) }))
                    }}
                    placeholder="e.g. 278.50"
                  />
                  <div className="col-span-2">
                    <Input
                      label="Freight PKR (auto-computed — editable)"
                      type="number" step="0.01"
                      value={clearForm.importShippingFreight}
                      onChange={(e) => setClearForm({ ...clearForm, importShippingFreight: e.target.value })}
                      placeholder={computedFreightPkr > 0 ? computedFreightPkr.toFixed(2) : "0"}
                    />
                  </div>
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
              { key: "miscClearing",       label: "Administrative Cost" },
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

          <div className="bg-blue-50 dark:bg-blue-500/10 rounded-lg p-4 space-y-1 text-sm">
            <div className="flex justify-between font-semibold text-blue-900 dark:text-blue-300">
              <span>Total Landed Cost:</span>
              <span>{formatCurrency(clearTotal)}</span>
            </div>
            {selectedPO && clearTotal > 0 && (
              <>
                <div className="flex justify-between text-blue-700 dark:text-blue-300">
                  <span>Per Panel ({selectedPO.noOfPanels.toLocaleString()} panels):</span>
                  <span>{formatCurrency(clearTotal / selectedPO.noOfPanels)}</span>
                </div>
                <div className="flex justify-between text-blue-700 dark:text-blue-300">
                  <span>Avg/W ({selectedPO.panelWattage}W):</span>
                  <span>Rs {(clearTotal / (selectedPO.noOfPanels * selectedPO.panelWattage)).toFixed(2)}</span>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => { setShowClear(false); setClearForm(emptyClearForm); setFreightUsd(""); setFreightExRate("") }}>Cancel</Button>
            <Button onClick={handleClear} loading={saving}>
              {selectedPO?.lcType === "LOCAL" ? "Save Costing & Mark Ready" : (selectedPO?.totalLandedCost != null ? "Update Clearing" : "Save Clearing Charges")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Documents Modal ── */}
      <Modal isOpen={showDocs} onClose={() => { setShowDocs(false); setPoDocs([]) }} title={`Documents — ${selectedPO?.poNumber}`} size="lg">
        <div className="space-y-4">
          <div className="flex items-end gap-3 p-4 bg-muted rounded-lg">
            <div className="flex-1">
              <label className="block text-sm font-medium text-secondary mb-1">Document Type</label>
              <select
                aria-label="Document Type"
                title="Document Type"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="block w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <Button onClick={() => fileInputRef.current?.click()} loading={uploadingDoc} variant="secondary">
              <Upload size={14} className="mr-2" />Upload File
            </Button>
          </div>

          {poDocs.length === 0 ? (
            <div className="text-center py-8 text-tertiary text-sm">No documents uploaded yet.</div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs font-medium text-secondary uppercase tracking-wide mb-3">Uploaded Documents</div>
              {poDocs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 bg-surface border border-line rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 dark:bg-blue-500/10 rounded-lg flex items-center justify-center shrink-0">
                      <Paperclip size={14} className="text-blue-600 dark:text-blue-300" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{doc.docType}</p>
                      <p className="text-xs text-secondary">{doc.fileName} · {doc.uploadedBy} · {formatDate(doc.uploadedAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" title={`Open ${doc.fileName}`}>
                      <Button size="sm" variant="ghost"><ExternalLink size={14} /></Button>
                    </a>
                    <Button size="sm" variant="ghost" onClick={() => handleDeleteDoc(doc.id)}>
                      <Trash2 size={14} className="text-red-500 dark:text-red-400" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-4">
            <p className="text-xs font-medium text-secondary uppercase tracking-wide mb-2">Required Document Checklist</p>
            <div className="grid grid-cols-2 gap-1">
              {DOC_TYPES.slice(0, 6).map((type) => {
                const uploaded = poDocs.some((d) => d.docType === type)
                return (
                  <div key={type} className={`flex items-center gap-2 text-xs p-1.5 rounded ${uploaded ? "text-green-700 dark:text-green-300" : "text-tertiary"}`}>
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
