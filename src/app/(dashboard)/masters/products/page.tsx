"use client"

import { useState, useEffect } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Modal } from "@/components/ui/Modal"
import { Table } from "@/components/ui/Table"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu"
import { DetailsModal } from "@/components/ui/DetailsModal"
import { Plus, Pencil, ChevronDown } from "lucide-react"
import toast from "react-hot-toast"

interface Product {
  id: string
  code: string
  name: string
  skuName: string | null
  category: string
  wattage: number
  brand: string
  panelsPerContainer: number | null
  palletsPerContainer: number | null
  active: boolean
  defaultSupplierId: string | null
  defaultSupplier: { id: string; name: string } | null
}

const emptyForm = {
  code: "",
  name: "",
  skuName: "",
  category: "Solar Panel",
  wattage: "",
  brand: "",
  panelsPerContainer: "",
  palletsPerContainer: "",
  defaultSupplierId: "",
  active: true,
}

export default function ProductsPage() {
  const { data: products, loading, refetch } = useFetch<Product[]>("/api/products")
  const { data: suppliers } = useFetch<{ id: string; name: string }[]>("/api/suppliers")
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [selectedBrand, setSelectedBrand] = useState<string>("")
  const [brandDropdownOpen, setBrandDropdownOpen] = useState(false)
  const [newBrandMode, setNewBrandMode] = useState(false)
  const [detailRow, setDetailRow] = useState<Product | null>(null)

  // Group products by brand
  const brandGroups = (products || []).reduce<Record<string, Product[]>>((acc, p) => {
    if (!acc[p.brand]) acc[p.brand] = []
    acc[p.brand].push(p)
    return acc
  }, {})
  const sortedBrands = Object.keys(brandGroups).sort()

  // Auto-select first brand once data loads
  useEffect(() => {
    if (sortedBrands.length > 0 && !selectedBrand) {
      setSelectedBrand(sortedBrands[0])
    }
  }, [sortedBrands.length])

  const visibleProducts = selectedBrand ? (brandGroups[selectedBrand] || []) : []

  const handleSave = async () => {
    setSaving(true)
    try {
      const url = editId ? `/api/products/${editId}` : "/api/products"
      const method = editId ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        toast.success(editId ? "Product updated" : "Product created")
        setShowModal(false)
        // After creating, switch to the new product's brand so it's immediately visible
        if (!editId && form.brand) setSelectedBrand(form.brand)
        refetch()
      } else {
        toast.error("Failed to save product")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (product: Product) => {
    setEditId(product.id)
    setNewBrandMode(false)
    setForm({
      code: product.code,
      name: product.name,
      skuName: product.skuName || "",
      category: product.category,
      wattage: String(product.wattage),
      brand: product.brand,
      panelsPerContainer: product.panelsPerContainer ? String(product.panelsPerContainer) : "",
      palletsPerContainer: product.palletsPerContainer ? String(product.palletsPerContainer) : "",
      defaultSupplierId: product.defaultSupplierId || "",
      active: product.active,
    })
    setShowModal(true)
  }

  const handleNew = () => {
    setEditId(null)
    setNewBrandMode(false)
    // Pre-fill brand with currently selected brand
    setForm({ ...emptyForm, brand: selectedBrand })
    setShowModal(true)
  }

  const handleDeactivate = async (id: string) => {
    const res = await fetch(`/api/products/${id}`, { method: "DELETE" })
    if (res.ok) { toast.success("Product deactivated"); refetch() }
    else toast.error("Failed")
  }

  const productRowActions = (row: Product): RowAction[] => [
    { label: "Edit", icon: <Pencil size={15} />, onClick: () => handleEdit(row) },
    ...(row.active ? [{ label: "Deactivate", danger: true, onClick: () => handleDeactivate(row.id) }] : []),
  ]

  const panelsPerContainer = parseFloat(form.panelsPerContainer) || 0
  const palletsPerContainer = parseFloat(form.palletsPerContainer) || 0
  const wattage = parseFloat(form.wattage) || 0
  const panelsPerPallet = panelsPerContainer > 0 && palletsPerContainer > 0 ? panelsPerContainer / palletsPerContainer : 0
  const wattsPerPallet = panelsPerPallet * wattage
  const totalWattsPerContainer = panelsPerContainer * wattage

  if (loading) return <TableSkeleton columns={5} rows={6} />

  return (
    <div className="space-y-6 animate-fade-in-up">

      {/* Row details */}
      <DetailsModal
        isOpen={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title={`Product — ${detailRow?.name || ""}`}
        fields={detailRow ? [
          { label: "Code", value: detailRow.code },
          { label: "Brand", value: detailRow.brand },
          { label: "SKU Name", value: detailRow.skuName || "—" },
          { label: "Category", value: detailRow.category },
          { label: "Wattage", value: `${detailRow.wattage} W` },
          { label: "Status", value: detailRow.active ? "Active" : "Inactive" },
          { label: "Panels / Container", value: detailRow.panelsPerContainer?.toLocaleString() || "—" },
          { label: "Pallets / Container", value: detailRow.palletsPerContainer?.toLocaleString() || "—" },
          { label: "Default Supplier", value: detailRow.defaultSupplier?.name || "—" },
        ] : []}
        actions={detailRow ? productRowActions(detailRow) : []}
      />
      <Header
        title="Products"
        breadcrumbs={[{ label: "Master Data" }, { label: "Products" }]}
        actions={<Button onClick={handleNew}><Plus size={16} className="mr-2" />Add Product</Button>}
      />

      {/* Brand selector */}
      <div className="bg-white rounded-xl shadow-card border border-slate-200/70">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600">Brand</span>
            {/* Custom styled dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setBrandDropdownOpen((v) => !v)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-900 hover:border-blue-400 hover:bg-blue-50 transition-colors min-w-[180px] justify-between"
              >
                <span>{selectedBrand || "Select brand..."}</span>
                <ChevronDown size={14} className={`text-gray-400 transition-transform ${brandDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {brandDropdownOpen && (
                <div className="absolute z-20 mt-1 w-full min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                  {sortedBrands.map((brand) => (
                    <button
                      key={brand}
                      type="button"
                      onClick={() => { setSelectedBrand(brand); setBrandDropdownOpen(false) }}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left hover:bg-blue-50 transition-colors ${
                        selectedBrand === brand ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-700"
                      }`}
                    >
                      <span>{brand}</span>
                      <span className="text-xs text-gray-400">{brandGroups[brand].length} SKU{brandGroups[brand].length !== 1 ? "s" : ""}</span>
                    </button>
                  ))}
                  {sortedBrands.length === 0 && (
                    <p className="px-4 py-3 text-sm text-gray-400">No brands yet</p>
                  )}
                </div>
              )}
            </div>

            {selectedBrand && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">
                  {visibleProducts.length} SKU{visibleProducts.length !== 1 ? "s" : ""}
                </span>
                <span className="text-gray-400">
                  {visibleProducts.filter((p) => p.active).length} active
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Products table */}
        {selectedBrand ? (
          <Table
            data={visibleProducts}
            emptyMessage={`No products under ${selectedBrand}`}
            onRowClick={(row: Product) => setDetailRow(row)}
            searchPlaceholder="Search code, name, SKU…"
            searchKeys={["skuName"]}
            filters={[
              { key: "category", label: "Category", value: (p: Product) => p.category },
              { key: "active", label: "Status", value: (p: Product) => (p.active ? "Active" : "Inactive") },
            ]}
            columns={[
              { key: "code", header: "Code", sortable: true, render: (p: Product) => <span className="font-mono text-gray-600">{p.code}</span> },
              {
                key: "name", header: "Name / SKU", sortable: true,
                render: (p: Product) => (
                  <div>
                    <p className="font-medium text-gray-900">{p.name}</p>
                    {p.skuName && <p className="text-xs text-gray-400">{p.skuName}</p>}
                  </div>
                ),
              },
              { key: "wattage", header: "Wattage", sortable: true, numeric: true, value: (p: Product) => p.wattage, render: (p: Product) => <span className="font-medium">{p.wattage}W</span> },
              {
                key: "packing", header: "Packing",
                render: (p: Product) => {
                  const ppp = p.panelsPerContainer && p.palletsPerContainer ? p.panelsPerContainer / p.palletsPerContainer : null
                  return <span className="text-gray-500">{p.panelsPerContainer ? `${p.panelsPerContainer}/ctr${ppp ? ` · ${ppp.toFixed(0)}/pallet` : ""}` : "—"}</span>
                },
              },
              { key: "category", header: "Category", render: (p: Product) => <span className="text-gray-500">{p.category}</span> },
              { key: "supplier", header: "Supplier", value: (p: Product) => p.defaultSupplier?.name || "—", render: (p: Product) => <span className="text-gray-500">{p.defaultSupplier?.name || "—"}</span> },
              {
                key: "active", header: "Status",
                render: (p: Product) => (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {p.active ? "Active" : "Inactive"}
                  </span>
                ),
              },
              {
                key: "actions", header: "Actions",
                render: (p: Product) => (
                  <RowActionsMenu actions={productRowActions(p)} />
                ),
              },
            ]}
          />
        ) : (
          <div className="p-12 text-center text-gray-400 text-sm">
            No products yet. Add a product to get started.
          </div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? "Edit Product" : "Add Product"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Product Code" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <div>
              <Select
                label="Brand *"
                value={newBrandMode ? "__new__" : form.brand}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setNewBrandMode(true)
                    setForm({ ...form, brand: "" })
                  } else {
                    setNewBrandMode(false)
                    setForm({ ...form, brand: e.target.value })
                  }
                }}
              >
                <option value="">Select brand...</option>
                {sortedBrands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
                <option value="__new__">+ Add new brand</option>
              </Select>
              {newBrandMode && (
                <Input
                  label=""
                  placeholder="Type new brand name..."
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  className="mt-2"
                />
              )}
            </div>
          </div>
          <Input label="Product Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="SKU / Model Name" value={form.skuName} onChange={(e) => setForm({ ...form, skuName: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Wattage (W)" type="number" required value={form.wattage} onChange={(e) => setForm({ ...form, wattage: e.target.value })} />
            <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option>Solar Panel</option>
              <option>Inverter</option>
              <option>Battery</option>
              <option>Accessories</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Panels per Container" type="number" value={form.panelsPerContainer} onChange={(e) => setForm({ ...form, panelsPerContainer: e.target.value })} />
            <Input label="Pallets per Container" type="number" value={form.palletsPerContainer} onChange={(e) => setForm({ ...form, palletsPerContainer: e.target.value })} />
          </div>
          <Select label="Default Supplier" value={form.defaultSupplierId} onChange={(e) => setForm({ ...form, defaultSupplierId: e.target.value })}>
            <option value="">None</option>
            {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>

          {(panelsPerPallet > 0 || totalWattsPerContainer > 0) && (
            <div className="grid grid-cols-3 gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm">
              <div>
                <p className="text-xs text-blue-700">Panels / Pallet</p>
                <p className="font-semibold text-blue-900">{panelsPerPallet > 0 ? panelsPerPallet.toFixed(0) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-blue-700">Watts / Pallet</p>
                <p className="font-semibold text-blue-900">{wattsPerPallet > 0 ? wattsPerPallet.toLocaleString() : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-blue-700">Watts / Container</p>
                <p className="font-semibold text-blue-900">{totalWattsPerContainer > 0 ? totalWattsPerContainer.toLocaleString() : "—"}</p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editId ? "Update" : "Create"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
