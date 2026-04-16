"use client"

import { useState } from "react"
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
import { Plus, ArrowRight } from "lucide-react"
import toast, { Toaster } from "react-hot-toast"
import { useRouter } from "next/navigation"

interface Quotation {
  id: string
  qNumber: string
  customer: { name: string }
  status: string
  validUntil: string | null
  createdAt: string
  lines: Array<{ totalAmount: number; quantity: number; product: { name: string } }>
}

export default function QuotationsPage() {
  const router = useRouter()
  const { data: quotations, loading, refetch } = useFetch<Quotation[]>("/api/quotations")
  const { data: customers } = useFetch<{ id: string; name: string }[]>("/api/customers")
  const { data: products } = useFetch<{ id: string; name: string; wattage: number }[]>("/api/products")

  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ customerId: "", validUntil: "", notes: "" })
  const [lines, setLines] = useState([{ productId: "", quantity: "", ratePerWatt: "", notes: "" }])

  const addLine = () => setLines([...lines, { productId: "", quantity: "", ratePerWatt: "", notes: "" }])
  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx))

  const handleCreate = async () => {
    setSaving(true)
    try {
      const computedLines = lines.map((l) => {
        const product = products?.find((p) => p.id === l.productId)
        const qty = parseInt(l.quantity)
        const watts = qty * (product?.wattage || 0)
        const ratePerWatt = parseFloat(l.ratePerWatt)
        const ratePerPanel = ratePerWatt * (product?.wattage || 0)
        const totalAmount = ratePerPanel * qty
        return { productId: l.productId, quantity: qty, watts, ratePerWatt, ratePerPanel, totalAmount }
      })

      const res = await fetch("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, lines: computedLines }),
      })

      if (res.ok) {
        toast.success("Quotation created")
        setShowCreate(false)
        setForm({ customerId: "", validUntil: "", notes: "" })
        setLines([{ productId: "", quantity: "", ratePerWatt: "", notes: "" }])
        refetch()
      } else {
        toast.error("Failed to create quotation")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleConvertToSO = async (quotation: Quotation) => {
    router.push(`/sales?quotationId=${quotation.id}`)
  }

  const columns = [
    { key: "qNumber", header: "Quotation #", sortable: true },
    { key: "customer", header: "Customer", render: (row: Quotation) => row.customer?.name },
    {
      key: "lines",
      header: "Items",
      render: (row: Quotation) => (
        <div>
          {row.lines?.slice(0, 2).map((l, i) => (
            <p key={i} className="text-xs">{l.product?.name} × {l.quantity}</p>
          ))}
          {row.lines?.length > 2 && <p className="text-xs text-gray-400">+{row.lines.length - 2} more</p>}
        </div>
      ),
    },
    {
      key: "total",
      header: "Total",
      render: (row: Quotation) => formatCurrency(row.lines?.reduce((s, l) => s + l.totalAmount, 0) || 0),
    },
    { key: "status", header: "Status", render: (row: Quotation) => <Badge status={row.status} /> },
    { key: "validUntil", header: "Valid Until", render: (row: Quotation) => row.validUntil ? formatDate(row.validUntil) : "-" },
    { key: "createdAt", header: "Date", render: (row: Quotation) => formatDate(row.createdAt) },
    {
      key: "actions",
      header: "Actions",
      render: (row: Quotation) => row.status === "DRAFT" && (
        <Button size="sm" variant="secondary" onClick={() => handleConvertToSO(row)}>
          <ArrowRight size={14} className="mr-1" />
          Convert to SO
        </Button>
      ),
    },
  ]

  if (loading) return <LoadingPage />

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <Header
        title="Quotations"
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} className="mr-2" />
            New Quotation
          </Button>
        }
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <Table
          columns={columns}
          data={(quotations || [])}
          emptyMessage="No quotations yet"
        />
      </div>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Quotation" size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Customer" required value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              <option value="">Select customer...</option>
              {customers?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Input label="Valid Until" type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Line Items</label>
              <Button size="sm" variant="ghost" onClick={addLine}>+ Add Line</Button>
            </div>
            <div className="space-y-3">
              {lines.map((line, idx) => {
                const product = products?.find((p) => p.id === line.productId)
                const qty = parseInt(line.quantity) || 0
                const ratePerWatt = parseFloat(line.ratePerWatt) || 0
                const ratePerPanel = ratePerWatt * (product?.wattage || 0)
                const total = ratePerPanel * qty
                return (
                  <div key={idx} className="flex items-end gap-3 p-3 bg-gray-50 rounded-lg">
                    <Select
                      label="Product"
                      value={line.productId}
                      onChange={(e) => {
                        setLines(lines.map((l, i) => i === idx ? { ...l, productId: e.target.value } : l))
                      }}
                    >
                      <option value="">Select...</option>
                      {products?.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.wattage}W)</option>)}
                    </Select>
                    <Input
                      label="Qty (panels)"
                      type="number"
                      value={line.quantity}
                      onChange={(e) => {
                        setLines(lines.map((l, i) => i === idx ? { ...l, quantity: e.target.value } : l))
                      }}
                    />
                    <Input
                      label="Rate/Watt (PKR)"
                      type="number"
                      step="0.01"
                      value={line.ratePerWatt}
                      onChange={(e) => {
                        setLines(lines.map((l, i) => i === idx ? { ...l, ratePerWatt: e.target.value } : l))
                      }}
                    />
                    <div className="min-w-[120px]">
                      <p className="text-xs text-gray-500 mb-1">Total</p>
                      <p className="font-medium text-sm">{formatCurrency(total)}</p>
                    </div>
                    {lines.length > 1 && (
                      <Button size="sm" variant="danger" onClick={() => removeLine(idx)}>×</Button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={saving}>Create Quotation</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
