"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { formatCurrency, formatDate } from "@/lib/utils"

interface Invoice {
  id: string
  invoiceNumber: string
  invoiceDate: string
  subTotal: number
  gstRate: number
  gstAmount: number
  grandTotal: number
  status: string
  notes: string | null
  salesOrder: {
    soNumber: string
    customer: { name: string; address: string | null; ntn: string | null; strn: string | null; contactPhone: string | null }
    lines: Array<{ product: { name: string; code: string; wattage: number }; quantity: number; watts: number; ratePerWatt: number; ratePerPanel: number; totalAmount: number }>
  }
  deliveryOrder: { doNumber: string } | null
  payments: Array<{ amount: number; paymentDate: string; method: string | null }>
}

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/invoices/${id}`)
      .then((r) => r.json())
      .then((data) => { setInvoice(data); setLoading(false) })
  }, [id])

  useEffect(() => {
    if (!loading && invoice) {
      setTimeout(() => window.print(), 500)
    }
  }, [loading, invoice])

  if (loading) return <div className="p-8 text-gray-500">Loading invoice...</div>
  if (!invoice) return <div className="p-8 text-red-500">Invoice not found</div>

  const totalPaid = invoice.payments.reduce((s, p) => s + p.amount, 0)
  const outstanding = invoice.grandTotal - totalPaid

  return (
    <>
      <style>{`
        @media print {
          @page { margin: 15mm; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        body { font-family: Arial, sans-serif; }
      `}</style>

      <div className="max-w-3xl mx-auto p-8 bg-white">
        {/* Print button */}
        <div className="no-print flex justify-end mb-4 gap-2">
          <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Print / Save PDF</button>
          <button onClick={() => window.close()} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm">Close</button>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">GARIBSONS PRIVATE LIMITED</h1>
            <p className="text-sm text-gray-500 mt-1">Solar Division</p>
          </div>
          <div className="text-right">
            <div className="text-blue-700 font-bold text-lg">GST INVOICE</div>
            <p className="text-sm font-medium mt-1">{invoice.invoiceNumber}</p>
            <p className="text-xs text-gray-500">{formatDate(invoice.invoiceDate)}</p>
          </div>
        </div>

        {/* Bill To */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Bill To</p>
            <p className="font-semibold text-gray-900">{invoice.salesOrder.customer.name}</p>
            {invoice.salesOrder.customer.address && <p className="text-sm text-gray-600 mt-1">{invoice.salesOrder.customer.address}</p>}
            {invoice.salesOrder.customer.ntn && <p className="text-sm text-gray-600">NTN: {invoice.salesOrder.customer.ntn}</p>}
            {invoice.salesOrder.customer.strn && <p className="text-sm text-gray-600">STRN: {invoice.salesOrder.customer.strn}</p>}
            {invoice.salesOrder.customer.contactPhone && <p className="text-sm text-gray-600">{invoice.salesOrder.customer.contactPhone}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Invoice Details</p>
            <table className="text-sm text-gray-700 w-full">
              <tbody>
                <tr><td className="text-gray-500 pr-4">Invoice No.:</td><td className="font-medium">{invoice.invoiceNumber}</td></tr>
                <tr><td className="text-gray-500 pr-4">Date:</td><td>{formatDate(invoice.invoiceDate)}</td></tr>
                <tr><td className="text-gray-500 pr-4">SO No.:</td><td>{invoice.salesOrder.soNumber}</td></tr>
                {invoice.deliveryOrder && <tr><td className="text-gray-500 pr-4">DO No.:</td><td>{invoice.deliveryOrder.doNumber}</td></tr>}
                <tr><td className="text-gray-500 pr-4">Status:</td><td className="font-medium">{invoice.status}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Line Items */}
        <table className="w-full mb-6 text-sm border-collapse">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-center">Wattage</th>
              <th className="px-3 py-2 text-right">Qty (Panels)</th>
              <th className="px-3 py-2 text-right">Qty (Watts)</th>
              <th className="px-3 py-2 text-right">Rate/Watt</th>
              <th className="px-3 py-2 text-right">Rate/Panel</th>
              <th className="px-3 py-2 text-right">Amount (PKR)</th>
            </tr>
          </thead>
          <tbody>
            {invoice.salesOrder.lines.map((line, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                <td className="px-3 py-2">
                  <p className="font-medium">{line.product.name}</p>
                  <p className="text-xs text-gray-500">{line.product.code}</p>
                </td>
                <td className="px-3 py-2 text-center">{line.product.wattage}W</td>
                <td className="px-3 py-2 text-right">{line.quantity.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{line.watts.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">Rs {line.ratePerWatt.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">Rs {line.ratePerPanel.toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-medium">{formatCurrency(line.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-72">
            <div className="flex justify-between py-2 border-b border-gray-200 text-sm">
              <span className="text-gray-600">Sub Total:</span>
              <span className="font-medium">{formatCurrency(invoice.subTotal)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-200 text-sm">
              <span className="text-gray-600">GST ({invoice.gstRate}%):</span>
              <span className="font-medium">{formatCurrency(invoice.gstAmount)}</span>
            </div>
            <div className="flex justify-between py-2 border-b-2 border-gray-800 text-base font-bold">
              <span>GRAND TOTAL:</span>
              <span>{formatCurrency(invoice.grandTotal)}</span>
            </div>
            {totalPaid > 0 && (
              <>
                <div className="flex justify-between py-2 text-sm text-green-700">
                  <span>Amount Paid:</span>
                  <span>({formatCurrency(totalPaid)})</span>
                </div>
                <div className="flex justify-between py-2 font-semibold text-red-700">
                  <span>Outstanding:</span>
                  <span>{formatCurrency(outstanding)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-gray-700">{invoice.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="border-t-2 border-gray-200 pt-6 grid grid-cols-2 gap-8 text-xs text-gray-500">
          <div>
            <p className="font-semibold text-gray-700 mb-1">Terms & Conditions</p>
            <p>Payment is due as per agreed terms. Goods once sold are not returnable.</p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-gray-700 mb-8">Authorized Signature</p>
            <p>__________________________</p>
            <p>For Garibsons Pvt. Ltd.</p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">Generated by Garibsons Solar ERP · {new Date().toLocaleString("en-PK")}</p>
      </div>
    </>
  )
}
