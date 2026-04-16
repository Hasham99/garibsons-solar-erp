"use client"

import { useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Modal } from "@/components/ui/Modal"
import { Table } from "@/components/ui/Table"
import { LoadingPage } from "@/components/ui/Spinner"
import { Plus, Pencil } from "lucide-react"
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

  const panelsPerContainer = parseFloat(form.panelsPerContainer) || 0
  const palletsPerContainer = parseFloat(form.palletsPerContainer) || 0
  const wattage = parseFloat(form.wattage) || 0
  const panelsPerPallet = panelsPerContainer > 0 && palletsPerContainer > 0 ? panelsPerContainer / palletsPerContainer : 0
  const wattsPerPallet = panelsPerPallet * wattage
  const totalWattsPerContainer = panelsPerContainer * wattage

  const columns = [
    { key: "code", header: "Code", sortable: true },
    { key: "name", header: "Name", sortable: true },
    { key: "brand", header: "Brand" },
    { key: "wattage", header: "Wattage", render: (row: Product) => `${row.wattage}W` },
    {
      key: "packing",
      header: "Packing",
      render: (row: Product) => {
        if (!row.panelsPerContainer || !row.palletsPerContainer) return "-"
        const productPanelsPerPallet = row.panelsPerContainer / row.palletsPerContainer
        return `${row.panelsPerContainer} / ctr · ${productPanelsPerPallet.toFixed(0)} / pallet`
      },
    },
    { key: "category", header: "Category" },
    { key: "defaultSupplier", header: "Default Supplier", render: (row: Product) => row.defaultSupplier?.name || <span className="text-gray-400">-</span> },
    { key: "active", header: "Status", render: (row: Product) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${row.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
        {row.active ? "Active" : "Inactive"}
      </span>
    )},
    {
      key: "actions",
      header: "Actions",
      render: (row: Product) => (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => handleEdit(row)}><Pencil size={14} /></Button>
          {row.active && <Button size="sm" variant="danger" onClick={() => handleDeactivate(row.id)}>Deactivate</Button>}
        </div>
      ),
    },
  ]

  if (loading) return <LoadingPage />

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <Header
        title="Products"
        breadcrumbs={[{ label: "Master Data" }, { label: "Products" }]}
        actions={<Button onClick={handleNew}><Plus size={16} className="mr-2" />Add Product</Button>}
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <Table
          columns={columns}
          data={(products || [])}
          emptyMessage="No products yet"
        />
      </div>

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
            <Input
              label="Panels per Container"
              type="number"
              value={form.panelsPerContainer}
              onChange={(e) => setForm({ ...form, panelsPerContainer: e.target.value })}
            />
            <Input
              label="Pallets per Container"
              type="number"
              value={form.palletsPerContainer}
              onChange={(e) => setForm({ ...form, palletsPerContainer: e.target.value })}
            />
          </div>

          <Select
            label="Default Supplier"
            value={form.defaultSupplierId}
            onChange={(e) => setForm({ ...form, defaultSupplierId: e.target.value })}
          >
            <option value="">None</option>
            {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>

          {(panelsPerPallet > 0 || totalWattsPerContainer > 0) && (
            <div className="grid grid-cols-3 gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm">
              <div>
                <p className="text-xs text-blue-700">Panels / Pallet</p>
                <p className="font-semibold text-blue-900">{panelsPerPallet > 0 ? panelsPerPallet.toFixed(0) : "-"}</p>
              </div>
              <div>
                <p className="text-xs text-blue-700">Watts / Pallet</p>
                <p className="font-semibold text-blue-900">{wattsPerPallet > 0 ? wattsPerPallet.toLocaleString() : "-"}</p>
              </div>
              <div>
                <p className="text-xs text-blue-700">Watts / Container</p>
                <p className="font-semibold text-blue-900">{totalWattsPerContainer > 0 ? totalWattsPerContainer.toLocaleString() : "-"}</p>
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
