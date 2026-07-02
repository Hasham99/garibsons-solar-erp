"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Printer, X } from "lucide-react"
import { formatAmount, formatDate } from "@/lib/utils"
import { Letterhead } from "@/components/print/Letterhead"

interface ReturnLine {
  product: { name: string; code: string; wattage: number }
  quantity: number
  watts: number
  ratePerWatt: number
  amount: number
}

interface SalesReturn {
  id: string
  returnNumber: string
  type: "RETURN" | "EXCHANGE"
  status: "COMPLETED" | "VOID"
  returnDate: string
  creditAmount: number
  reason: string | null
  notes: string | null
  createdBy: { name: string } | null
  customer: { name: string; address: string | null; ntn: string | null; contactPhone: string | null }
  deliveryOrder: { doNumber: string; referenceNo: string | null }
  salesOrder: { soNumber: string }
  warehouse: { name: string; location: string; godown: string | null }
  lines: ReturnLine[]
}

export default function SalesReturnPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [ret, setRet] = useState<SalesReturn | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/sales-returns/${id}`)
      .then((r) => r.json())
      .then((data) => { setRet(data?.error ? null : data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!loading && ret) setTimeout(() => window.print(), 500)
  }, [loading, ret])

  if (loading) {
    return <div className="mx-auto max-w-3xl p-8 text-center text-sm text-slate-400">Preparing credit note…</div>
  }
  if (!ret) {
    return (
      <div className="mx-auto mt-24 max-w-md px-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
          <X size={22} />
        </div>
        <p className="mt-4 text-base font-semibold text-slate-800">Credit note not found</p>
        <button
          type="button"
          onClick={() => window.close()}
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
      </div>
    )
  }

  const docTitle = ret.type === "EXCHANGE" ? "EXCHANGE CREDIT NOTE" : "CREDIT NOTE"

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

      <div className="print-surface relative mx-auto max-w-3xl bg-white p-8">
        <div className="no-print mb-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            <Printer size={15} /> Print / Save PDF
          </button>
          <button
            type="button"
            onClick={() => window.close()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50"
          >
            <X size={15} /> Close
          </button>
        </div>

        <Letterhead docTitle={docTitle} docNumber={ret.returnNumber} docDate={formatDate(ret.returnDate)} />

        {ret.status === "VOID" && (
          <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-center text-sm font-semibold text-rose-700">
            VOIDED — this credit note has been reversed
          </div>
        )}

        <div className="mb-8 grid grid-cols-2 gap-8">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Credit To</p>
            <p className="font-semibold text-gray-900">{ret.customer.name}</p>
            {ret.customer.address && <p className="mt-1 text-sm text-gray-600">{ret.customer.address}</p>}
            {ret.customer.ntn && <p className="text-sm text-gray-600">NTN: {ret.customer.ntn}</p>}
            {ret.customer.contactPhone && <p className="text-sm text-gray-600">{ret.customer.contactPhone}</p>}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Details</p>
            <table className="w-full text-sm text-gray-700">
              <tbody>
                <tr><td className="pr-4 text-gray-500">Type:</td><td className="font-medium">{ret.type === "EXCHANGE" ? "Exchange" : "Return"}</td></tr>
                <tr><td className="pr-4 text-gray-500">Against DO:</td><td>{ret.deliveryOrder.doNumber}</td></tr>
                <tr><td className="pr-4 text-gray-500">SO No.:</td><td>{ret.salesOrder.soNumber}</td></tr>
                <tr><td className="pr-4 text-gray-500">Date:</td><td>{formatDate(ret.returnDate)}</td></tr>
                <tr><td className="pr-4 text-gray-500">Returned To:</td><td>{ret.warehouse.name}</td></tr>
                {ret.createdBy?.name && <tr><td className="pr-4 text-gray-500">By:</td><td>{ret.createdBy.name}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <table className="mb-6 w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-center">Wattage</th>
              <th className="px-3 py-2 text-right">Panels</th>
              <th className="px-3 py-2 text-right">Watts</th>
              <th className="px-3 py-2 text-right">Rate/Watt</th>
              <th className="px-3 py-2 text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {ret.lines.map((line, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                <td className="px-3 py-2">
                  <p className="font-medium">{line.product.name}</p>
                  <p className="text-xs text-gray-500">{line.product.code}</p>
                </td>
                <td className="px-3 py-2 text-center">{line.product.wattage}W</td>
                <td className="px-3 py-2 text-right font-semibold">{line.quantity.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{line.watts.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{line.ratePerWatt.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-medium">{formatAmount(line.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 font-semibold">
              <td className="px-3 py-2" colSpan={5}>Total Credit</td>
              <td className="px-3 py-2 text-right">{formatAmount(ret.creditAmount)}</td>
            </tr>
          </tfoot>
        </table>

        {ret.reason && (
          <div className="mb-4">
            <p className="mb-1 text-xs font-semibold uppercase text-gray-400">Reason</p>
            <p className="text-sm text-gray-700">{ret.reason}</p>
          </div>
        )}

        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-800">
          {formatAmount(ret.creditAmount)} has been credited to the customer&apos;s account and the returned goods
          restored to stock.
        </div>

        <p className="mt-12 border-t pt-4 text-center text-xs text-gray-400">
          Generated by Garibsons Solar ERP · {new Date().toLocaleString("en-PK")}
        </p>
      </div>
    </>
  )
}
