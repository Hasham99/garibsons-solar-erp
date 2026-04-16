"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { formatCurrency, formatDate } from "@/lib/utils"

interface Quotation {
  id: string
  qNumber: string
  createdAt: string
  validUntil: string | null
  status: string
  notes: string | null
  customer: { name: string; address: string | null; ntn: string | null; strn: string | null; contactPhone: string | null }
  lines: Array<{
    product: { name: string; code: string; wattage: number }
    quantity: number
    watts: number
    ratePerWatt: number
    ratePerPanel: number
    totalAmount: number
  }>
}

export default function QuotationPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [quotation, setQuotation] = useState<Quotation | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/quotations/${id}`)
      .then((r) => r.json())
      .then((data) => { setQuotation(data); setLoading(false) })
  }, [id])

  useEffect(() => {
    if (!loading && quotation) setTimeout(() => window.print(), 500)
  }, [loading, quotation])

  if (loading) return <div className="p-8 text-gray-500">Loading quotation...</div>
  if (!quotation) return <div className="p-8 text-red-500">Quotation not found</div>

  const totalAmount = quotation.lines.reduce((s, l) => s + l.totalAmount, 0)

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
        <div className="no-print flex justify-end mb-4 gap-2">
          <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Print / Save PDF</button>
          <button onClick={() => window.close()} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm">Close</button>
        </div>

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">GARIBSONS PRIVATE LIMITED</h1>
            <p className="text-sm text-gray-500 mt-1">Solar Division</p>
          </div>
          <div className="text-right">
            <div className="text-blue-700 font-bold text-lg">QUOTATION</div>
            <p className="text-sm font-medium mt-1">{quotation.qNumber}</p>
            <p className="text-xs text-gray-500">{formatDate(quotation.createdAt)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Quotation For</p>
            <p className="font-semibold text-gray-900">{quotation.customer.name}</p>
            {quotation.customer.address && <p className="text-sm text-gray-600 mt-1">{quotation.customer.address}</p>}
            {quotation.customer.ntn && <p className="text-sm text-gray-600">NTN: {quotation.customer.ntn}</p>}
            {quotation.customer.contactPhone && <p className="text-sm text-gray-600">{quotation.customer.contactPhone}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Details</p>
            <table className="text-sm text-gray-700 w-full">
              <tbody>
                <tr><td className="text-gray-500 pr-4">Quotation No.:</td><td className="font-medium">{quotation.qNumber}</td></tr>
                <tr><td className="text-gray-500 pr-4">Date:</td><td>{formatDate(quotation.createdAt)}</td></tr>
                {quotation.validUntil && <tr><td className="text-gray-500 pr-4">Valid Until:</td><td className="font-medium text-red-700">{formatDate(quotation.validUntil)}</td></tr>}
                <tr><td className="text-gray-500 pr-4">Status:</td><td>{quotation.status}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <table className="w-full mb-6 text-sm border-collapse">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-center">Wattage</th>
              <th className="px-3 py-2 text-right">Qty (Panels)</th>
              <th className="px-3 py-2 text-right">Total MW</th>
              <th className="px-3 py-2 text-right">Rate/Watt (PKR)</th>
              <th className="px-3 py-2 text-right">Amount (PKR)</th>
            </tr>
          </thead>
          <tbody>
            {quotation.lines.map((line, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                <td className="px-3 py-2">
                  <p className="font-medium">{line.product.name}</p>
                  <p className="text-xs text-gray-500">{line.product.code}</p>
                </td>
                <td className="px-3 py-2 text-center">{line.product.wattage}W</td>
                <td className="px-3 py-2 text-right">{line.quantity.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{(line.watts / 1000000).toFixed(3)} MW</td>
                <td className="px-3 py-2 text-right">Rs {line.ratePerWatt.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-medium">{formatCurrency(line.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-800 bg-gray-50">
              <td colSpan={5} className="px-3 py-3 font-bold text-right">TOTAL QUOTED VALUE:</td>
              <td className="px-3 py-3 font-bold text-right text-lg">{formatCurrency(totalAmount)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-sm">
          <p className="text-blue-800">
            <span className="font-semibold">Note:</span> This is a quotation only. GST will be applied at the applicable rate on the final invoice.
            Prices are valid until {quotation.validUntil ? formatDate(quotation.validUntil) : "further notice"}.
          </p>
        </div>

        {quotation.notes && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Notes</p>
            <p className="text-sm text-gray-700">{quotation.notes}</p>
          </div>
        )}

        <div className="border-t-2 border-gray-200 pt-6 grid grid-cols-2 gap-8 text-xs text-gray-500">
          <div>
            <p className="font-semibold text-gray-700 mb-1">Terms</p>
            <p>Prices subject to availability. Payment terms as agreed.</p>
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
