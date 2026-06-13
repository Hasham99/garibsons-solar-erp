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
import { TableSkeleton } from "@/components/ui/Skeleton"
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu"
import { DetailsModal } from "@/components/ui/DetailsModal"
import { formatAmount, formatCurrency, formatDate, statusRowClass } from "@/lib/utils"
import { Plus, DollarSign } from "lucide-react"
import toast from "react-hot-toast"

interface Invoice {
  id: string
  invoiceNumber: string
  salesOrder: { soNumber: string; customer: { name: string } }
  invoiceDate: string
  subTotal: number
  gstRate: number
  gstAmount: number
  grandTotal: number
  status: string
  payments: Array<{ amount: number }>
}

export default function InvoicesPage() {
  const [detailRow, setDetailRow] = useState<Invoice | null>(null)
  const { data: invoices, loading, refetch } = useFetch<Invoice[]>("/api/invoices")
  const { data: orders } = useFetch<{ id: string; soNumber: string; customer: { name: string }; subTotal: number; gstRate: number; status: string }[]>("/api/sales-orders")
  const { data: dos } = useFetch<{ id: string; doNumber: string }[]>("/api/delivery-orders")

  const [showCreate, setShowCreate] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({ soId: "", doId: "", invoiceDate: "", notes: "" })
  const [paymentForm, setPaymentForm] = useState({ amount: "", paymentDate: "", method: "Bank Transfer", reference: "", notes: "" })

  const eligibleSOs = orders?.filter((o) => ["DELIVERED", "INVOICED", "PAYMENT_CONFIRMED"].includes(o.status)) || []

  const handleCreate = async () => {
    setSaving(true)
    try {
      const so = orders?.find((o) => o.id === form.soId)
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          subTotal: so?.subTotal,
          gstRate: so?.gstRate,
        }),
      })
      if (res.ok) {
        toast.success("Invoice created")
        setShowCreate(false)
        setForm({ soId: "", doId: "", invoiceDate: "", notes: "" })
        refetch()
      } else {
        toast.error("Failed to create invoice")
      }
    } finally {
      setSaving(false)
    }
  }

  const handlePayment = async () => {
    if (!selectedInvoice) return
    setSaving(true)
    try {
      const res = await fetch(`/api/invoices/${selectedInvoice.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentForm),
      })
      if (res.ok) {
        toast.success("Payment recorded")
        setShowPayment(false)
        setSelectedInvoice(null)
        setPaymentForm({ amount: "", paymentDate: "", method: "Bank Transfer", reference: "", notes: "" })
        refetch()
      } else {
        toast.error("Failed to record payment")
      }
    } finally {
      setSaving(false)
    }
  }

  const invoiceRowActions = (row: Invoice): RowAction[] =>
    row.status !== "PAID" ? [
      { label: "Record Payment", icon: <DollarSign size={15} />, onClick: () => { setSelectedInvoice(row); setShowPayment(true) } },
    ] : []

  const columns = [
    { key: "invoiceNumber", header: "Invoice #", sortable: true },
    { key: "invoiceDate", header: "Date", numeric: true, render: (row: Invoice) => formatDate(row.invoiceDate) },
    { key: "salesOrder", header: "Customer", sortable: true, value: (row: Invoice) => row.salesOrder?.customer?.name, render: (row: Invoice) => (
      <div>
        <p className="font-medium">{row.salesOrder?.customer?.name}</p>
        <p className="text-xs text-gray-500">{row.salesOrder?.soNumber}</p>
      </div>
    )},
    { key: "subTotal", header: "Sub Total (PKR)", numeric: true, render: (row: Invoice) => formatAmount(row.subTotal) },
    { key: "gstAmount", header: "GST (PKR)", numeric: true, render: (row: Invoice) => `${row.gstRate}% = ${formatAmount(row.gstAmount)}` },
    { key: "grandTotal", header: "Total (PKR)", numeric: true, render: (row: Invoice) => <span className="font-bold">{formatAmount(row.grandTotal)}</span> },
    {
      key: "paid",
      header: "Paid (PKR)",
      numeric: true,
      render: (row: Invoice) => {
        const paid = row.payments?.reduce((s, p) => s + p.amount, 0) || 0
        return formatAmount(paid)
      },
    },
    {
      key: "outstanding",
      header: "Outstanding (PKR)",
      numeric: true,
      render: (row: Invoice) => {
        const paid = row.payments?.reduce((s, p) => s + p.amount, 0) || 0
        const outstanding = row.grandTotal - paid
        return <span className={outstanding > 0 ? "text-red-600 font-medium" : "text-green-600"}>{formatAmount(outstanding)}</span>
      },
    },
    { key: "status", header: "Status", render: (row: Invoice) => <Badge status={row.status} /> },
    {
      key: "actions",
      header: "Actions",
      render: (row: Invoice) => <RowActionsMenu actions={invoiceRowActions(row)} />,
    },
  ]

  if (loading) return <TableSkeleton columns={7} rows={10} />

  return (
    <div className="space-y-6 animate-fade-in-up">

      {/* Row details */}
      <DetailsModal
        isOpen={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title={`Invoice — ${detailRow?.invoiceNumber || ""}`}
        fields={detailRow ? (() => {
          const paid = detailRow.payments?.reduce((s, p) => s + p.amount, 0) || 0
          return [
            { label: "Customer", value: detailRow.salesOrder?.customer?.name },
            { label: "Sales Order", value: detailRow.salesOrder?.soNumber },
            { label: "Invoice Date", value: formatDate(detailRow.invoiceDate) },
            { label: "Status", value: <Badge status={detailRow.status} /> },
            { label: "Sub Total", value: formatCurrency(detailRow.subTotal) },
            { label: "GST", value: detailRow.gstRate > 0 ? `${detailRow.gstRate}% = ${formatCurrency(detailRow.gstAmount)}` : "—" },
            { label: "Grand Total", value: <span className="font-bold">{formatCurrency(detailRow.grandTotal)}</span> },
            { label: "Paid / Outstanding", value: `${formatCurrency(paid)} / ${formatCurrency(detailRow.grandTotal - paid)}` },
          ]
        })() : []}
        actions={detailRow ? invoiceRowActions(detailRow) : []}
      />

      <Header
        title="Invoices"
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} className="mr-2" />
            New Invoice
          </Button>
        }
      />

      <div className="bg-white rounded-xl shadow-card border border-slate-200/70">
        <Table
          columns={columns}
          data={(invoices || [])}
          emptyMessage="No invoices yet"
          rowClassName={(row: Invoice) => statusRowClass(row.status)}
          onRowClick={(row: Invoice) => setDetailRow(row)}
          searchPlaceholder="Search invoice #, customer, SO #…"
          searchKeys={["salesOrder.soNumber"]}
          filters={[
            { key: "status", label: "Status", value: (row: Invoice) => row.status },
            { key: "invoiceDate", label: "Invoice Date", type: "date", value: (row: Invoice) => row.invoiceDate },
          ]}
        />
      </div>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Invoice">
        <div className="space-y-4">
          <Select label="Sales Order" required value={form.soId} onChange={(e) => setForm({ ...form, soId: e.target.value })}>
            <option value="">Select SO...</option>
            {eligibleSOs.map((o) => (
              <option key={o.id} value={o.id}>{o.soNumber} - {o.customer.name}</option>
            ))}
          </Select>

          <Select label="Delivery Order (optional)" value={form.doId} onChange={(e) => setForm({ ...form, doId: e.target.value })}>
            <option value="">No DO linked</option>
            {dos?.map((d) => <option key={d.id} value={d.id}>{d.doNumber}</option>)}
          </Select>

          <Input label="Invoice Date" type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} />
          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

          {form.soId && (() => {
            const so = orders?.find((o) => o.id === form.soId)
            if (!so) return null
            const gst = so.subTotal * (so.gstRate / 100)
            return (
              <div className="bg-blue-50 rounded-lg p-4 text-sm space-y-1">
                <div className="flex justify-between"><span>Sub Total:</span><span>{formatCurrency(so.subTotal)}</span></div>
                <div className="flex justify-between"><span>GST ({so.gstRate}%):</span><span>{formatCurrency(gst)}</span></div>
                <div className="flex justify-between font-bold border-t pt-1"><span>Total:</span><span>{formatCurrency(so.subTotal + gst)}</span></div>
              </div>
            )
          })()}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={saving}>Create Invoice</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showPayment} onClose={() => setShowPayment(false)} title={`Record Payment - ${selectedInvoice?.invoiceNumber}`}>
        <div className="space-y-4">
          {selectedInvoice && (
            <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
              <div className="flex justify-between"><span>Invoice Total:</span><span className="font-medium">{formatCurrency(selectedInvoice.grandTotal)}</span></div>
              <div className="flex justify-between"><span>Paid:</span><span>{formatCurrency(selectedInvoice.payments?.reduce((s, p) => s + p.amount, 0) || 0)}</span></div>
              <div className="flex justify-between font-bold text-red-600"><span>Outstanding:</span>
                <span>{formatCurrency(selectedInvoice.grandTotal - (selectedInvoice.payments?.reduce((s, p) => s + p.amount, 0) || 0))}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input label="Amount" type="number" step="0.01" required value={paymentForm.amount}
              onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
            <Input label="Payment Date" type="date" value={paymentForm.paymentDate}
              onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select label="Method" value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}>
              <option>Bank Transfer</option>
              <option>Cheque</option>
              <option>Cash</option>
              <option>Online</option>
            </Select>
            <Input label="Reference #" value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} />
          </div>

          <Input label="Notes" value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} />

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowPayment(false)}>Cancel</Button>
            <Button onClick={handlePayment} loading={saving}>Record Payment</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
