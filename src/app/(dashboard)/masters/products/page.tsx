"use client"

import { useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Modal } from "@/components/ui/Modal"
import { LoadingPage } from "@/components/ui/Spinner"
import { Plus, Pencil, ChevronDown, ChevronRight } from "lucide-react"
import toast, { Toaster } from "react-hot-toast"

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
  const [collapsedBrands, setCollapsedBrands] = useState<Set<string>>(new Set())

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
    setForm({ ...emptyForm })
    setShowModal(true)
  }

  const handleDeactivate = async (id: string) => {
    const res = await fetch(`/api/products/${id}`, { method: "DELETE" })
    if (res.ok) { toast.success("Product deactivated"); refetch() }
    else toast.error("Failed")
  }

  const toggleBrand = (brand: string) => {
    setCollapsedBrands((prev) => {
      const next = new Set(prev)
      if (next.has(brand)) next.delete(brand)
      else next.add(brand)
      return next
    })
  }

  const panelsPerContainer = parseFloat(form.panelsPerContainer) || 0
  const palletsPerContainer = parseFloat(form.palletsPerContainer) || 0
  const wattage = parseFloat(form.wattage) || 0
  const panelsPerPallet = panelsPerContainer > 0 && palletsPerContainer > 0 ? panelsPerContainer / palletsPerContainer : 0
  const wattsPerPallet = panelsPerPallet * wattage
  const totalWattsPerContainer = panelsPerContainer * wattage

  // Group products by brand
  const brandGroups = (products || []).reduce<Record<string, Product[]>>((acc, p) => {
    if (!acc[p.brand]) acc[p.brand] = []
    acc[p.brand].push(p)
    return acc
  }, {})
  const sortedBrands = Object.keys(brandGroups).sort()

  if (loading) return <LoadingPage />

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <Header
        title="Products"
        breadcrumbs={[{ label: "Master Data" }, { label: "Products" }]}
        actions={<Button onClick={handleNew}><Plus size={16} className="mr-2" />Add Product</Button>}
      />

      {sortedBrands.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-400">
          No products yet
        </div>
      ) : (
        <div className="space-y-4">
          {sortedBrands.map((brand) => {
            const brandProducts = brandGroups[brand]
            const isCollapsed = collapsedBrands.has(brand)
            return (
              <div key={brand} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleBrand(brand)}
                  className="w-full flex items-center justify-between px-6 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isCollapsed ? <ChevronRight size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                    <span className="font-semibold text-gray-900">{brand}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{brandProducts.length} SKU{brandProducts.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {brandProducts.filter((p) => p.active).length} active
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                      <thead className="bg-gray-50">
                        <tr>
                          {["Code", "Name / SKU", "Wattage", "Packing", "Category", "Supplier", "Status", ""].map((h) => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {brandProducts.map((product) => {
                          const ppp = product.panelsPerContainer && product.palletsPerContainer
                            ? product.panelsPerContainer / product.palletsPerContainer
                            : null
                          return (
                            <tr key={product.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-mono text-gray-600">{product.code}</td>
                              <td className="px-4 py-3 text-sm">
                                <p className="font-medium text-gray-900">{product.name}</p>
                                {product.skuName && <p className="text-xs text-gray-400">{product.skuName}</p>}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium">{product.wattage}W</td>
                              <td className="px-4 py-3 text-sm text-gray-500">
                                {product.panelsPerContainer ? (
                                  <span>{product.panelsPerContainer}/ctr{ppp ? ` · ${ppp.toFixed(0)}/pallet` : ""}</span>
                                ) : "—"}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500">{product.category}</td>
                              <td className="px-4 py-3 text-sm text-gray-500">{product.defaultSupplier?.name || "—"}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${product.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                  {product.active ? "Active" : "Inactive"}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex gap-2">
                                  <Button size="sm" variant="ghost" onClick={() => handleEdit(product)}><Pencil size={14} /></Button>
                                  {product.active && <Button size="sm" variant="danger" onClick={() => handleDeactivate(product.id)}>Deactivate</Button>}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? "Edit Product" : "Add Product"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Product Code" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <Input label="Brand" required value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
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
