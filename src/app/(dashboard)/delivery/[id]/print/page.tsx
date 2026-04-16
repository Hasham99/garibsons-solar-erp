"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { formatDate } from "@/lib/utils"

interface DeliveryOrder {
  id: string
  doNumber: string
  quantity: number
  watts: number
  status: string
  authorizedBy: string | null
  authorizedAt: string | null
  dispatchedAt: string | null
  notes: string | null
  createdAt: string
  salesOrder: {
    soNumber: string
    customer: { name: string; address: string | null; ntn: string | null; contactPhone: string | null }
    lines: Array<{ product: { name: string; code: string; wattage: number }; quantity: number; watts: number; ratePerWatt: number; totalAmount: number }>
    grandTotal: number
  }
  warehouse: { name: string; location: string; godown: string | null }
}

export default function DeliveryOrderPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<DeliveryOrder | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/delivery-orders/${id}`)
      .then((r) => r.json())
      .then((data) => { setOrder(data); setLoading(false) })
  }, [id])

  useEffect(() => {
    if (!loading && order) setTimeout(() => window.print(), 500)
  }, [loading, order])

  if (loading) return <div className="p-8 text-gray-500">Loading delivery order...</div>
  if (!order) return <div className="p-8 text-red-500">Delivery order not found</div>

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
            <div className="text-blue-700 font-bold text-lg">DELIVERY ORDER</div>
            <p className="text-sm font-medium mt-1">{order.doNumber}</p>
            <p className="text-xs text-gray-500">{formatDate(order.createdAt)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Deliver To</p>
            <p className="font-semibold text-gray-900">{order.salesOrder.customer.name}</p>
            {order.salesOrder.customer.address && <p className="text-sm text-gray-600 mt-1">{order.salesOrder.customer.address}</p>}
            {order.salesOrder.customer.ntn && <p className="text-sm text-gray-600">NTN: {order.salesOrder.customer.ntn}</p>}
            {order.salesOrder.customer.contactPhone && <p className="text-sm text-gray-600">{order.salesOrder.customer.contactPhone}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Dispatch Details</p>
            <table className="text-sm text-gray-700 w-full">
              <tbody>
                <tr><td className="text-gray-500 pr-4">DO No.:</td><td className="font-medium">{order.doNumber}</td></tr>
                <tr><td className="text-gray-500 pr-4">SO No.:</td><td>{order.salesOrder.soNumber}</td></tr>
                <tr><td className="text-gray-500 pr-4">Date:</td><td>{formatDate(order.createdAt)}</td></tr>
                <tr><td className="text-gray-500 pr-4">Status:</td><td className="font-medium">{order.status}</td></tr>
                {order.authorizedBy && <tr><td className="text-gray-500 pr-4">Auth. By:</td><td>{order.authorizedBy}</td></tr>}
                {order.dispatchedAt && <tr><td className="text-gray-500 pr-4">Dispatched:</td><td>{formatDate(order.dispatchedAt)}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-gray-500">Dispatch From</p>
            <p className="font-semibold">{order.warehouse.name}</p>
            <p className="text-xs text-gray-500">{order.warehouse.location}</p>
            {order.warehouse.godown && <p className="text-xs text-gray-500">Godown: {order.warehouse.godown}</p>}
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Panels</p>
            <p className="font-bold text-2xl text-blue-700">{order.quantity.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Watts</p>
            <p className="font-bold text-2xl text-blue-700">{(order.watts / 1000).toFixed(1)} kW</p>
          </div>
        </div>

        <table className="w-full mb-6 text-sm border-collapse">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-center">Wattage</th>
              <th className="px-3 py-2 text-right">Qty (Panels)</th>
              <th className="px-3 py-2 text-right">Qty (Watts)</th>
            </tr>
          </thead>
          <tbody>
            {order.salesOrder.lines.map((line, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                <td className="px-3 py-2">
                  <p className="font-medium">{line.product.name}</p>
                  <p className="text-xs text-gray-500">{line.product.code}</p>
                </td>
                <td className="px-3 py-2 text-center">{line.product.wattage}W</td>
                <td className="px-3 py-2 text-right font-semibold">{line.quantity.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{line.watts.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {order.notes && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Notes</p>
            <p className="text-sm text-gray-700">{order.notes}</p>
          </div>
        )}

        <div className="border-t-2 border-gray-200 pt-6 grid grid-cols-3 gap-4 text-xs text-gray-500 text-center">
          <div>
            <p className="font-semibold text-gray-700 mb-10">Driver Signature</p>
            <p>__________________________</p>
            <p>Name & CNIC</p>
          </div>
          <div>
            <p className="font-semibold text-gray-700 mb-10">Customer / Receiver</p>
            <p>__________________________</p>
            <p>Name, Stamp & Date</p>
          </div>
          <div>
            <p className="font-semibold text-gray-700 mb-10">Authorized By</p>
            <p>__________________________</p>
            <p>For Garibsons Pvt. Ltd.</p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">Generated by Garibsons Solar ERP · {new Date().toLocaleString("en-PK")}</p>
      </div>
    </>
  )
}
