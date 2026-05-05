"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { formatDate } from "@/lib/utils"

interface PrintLine {
  product: {
    name: string
    code: string
    wattage: number
    panelsPerContainer: number | null
    palletsPerContainer: number | null
  }
  quantity: number
  watts: number
  ratePerWatt: number
  totalAmount: number
}

interface DOLine {
  product: {
    name: string
    code: string
    wattage: number
    panelsPerContainer: number | null
    palletsPerContainer: number | null
  }
  quantity: number
  watts: number
}

interface DeliveryOrder {
  id: string
  doNumber: string
  quantity: number
  watts: number
  validityDays: number
  status: string
  authorizedBy: string | null
  authorizedAt: string | null
  dispatchedAt: string | null
  notes: string | null
  createdAt: string
  lines: DOLine[]
  salesOrder: {
    soNumber: string
    customer: { name: string; address: string | null; ntn: string | null; contactPhone: string | null }
    lines: PrintLine[]
    grandTotal: number
  }
  warehouse: { name: string; location: string; godown: string | null }
}

function computePallets(panels: number, product: PrintLine["product"]): number | null {
  if (!product.panelsPerContainer || !product.palletsPerContainer) return null
  const panelsPerPallet = product.panelsPerContainer / product.palletsPerContainer
  return Math.ceil(panels / panelsPerPallet)
}

export default function DeliveryOrderPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<DeliveryOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [imgWorking, setImgWorking] = useState(false)
  const printAreaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/delivery-orders/${id}`)
      .then((r) => r.json())
      .then((data) => { setOrder(data); setLoading(false) })
  }, [id])

  useEffect(() => {
    if (!loading && order) setTimeout(() => window.print(), 500)
  }, [loading, order])

  // A4 at 96 DPI = 794 × 1123px; we render at 2× for sharpness
  const A4_W = 794
  const A4_H = 1123
  const PIXEL_RATIO = 2
  const PAD = 48 // px padding on all sides (at 1×)

  const buildA4Canvas = async (): Promise<HTMLCanvasElement | null> => {
    if (!printAreaRef.current) return null
    const { toPng } = await import("html-to-image")

    // Capture at natural rendered size — no width override to avoid clipping
    const dataUrl = await toPng(printAreaRef.current, {
      quality: 1,
      pixelRatio: PIXEL_RATIO,
      backgroundColor: "#ffffff",
    })

    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const pad = PAD * PIXEL_RATIO
        const canvasW = A4_W * PIXEL_RATIO
        const contentAreaW = canvasW - pad * 2

        // Scale content to fit exactly within the A4 content width
        const scale = contentAreaW / img.width
        const scaledW = contentAreaW
        const scaledH = Math.round(img.height * scale)

        const canvasH = Math.max(A4_H * PIXEL_RATIO, scaledH + pad * 2)

        const canvas = document.createElement("canvas")
        canvas.width = canvasW
        canvas.height = canvasH

        const ctx = canvas.getContext("2d")!
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(0, 0, canvasW, canvasH)
        ctx.drawImage(img, pad, pad, scaledW, scaledH)

        resolve(canvas)
      }
      img.src = dataUrl
    })
  }

  const handleDownloadImage = async () => {
    if (!order) return
    setImgWorking(true)
    try {
      const canvas = await buildA4Canvas()
      if (!canvas) return
      const a = document.createElement("a")
      a.download = `DO-${order.doNumber}.png`
      a.href = canvas.toDataURL("image/png", 1)
      a.click()
    } catch (e) {
      console.error(e)
      alert("Failed to generate image")
    } finally {
      setImgWorking(false)
    }
  }

  const handleCopyImage = async () => {
    if (!order) return
    setImgWorking(true)
    try {
      const canvas = await buildA4Canvas()
      if (!canvas) return
      canvas.toBlob(async (blob) => {
        if (!blob) return
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
          alert("DO image copied to clipboard!")
        } catch {
          alert("Copy to clipboard not supported in this browser. Use Download instead.")
        }
      }, "image/png")
    } catch (e) {
      console.error(e)
      alert("Failed to copy image")
    } finally {
      setImgWorking(false)
    }
  }

  if (loading) return <div className="p-8 text-gray-500">Loading delivery order...</div>
  if (!order) return <div className="p-8 text-red-500">Delivery order not found</div>

  // Use actual per-product DO lines when available; fall back to proration for legacy DOs
  const doLines = order.lines && order.lines.length > 0
    ? order.lines.map((line) => ({
        ...line,
        doQty: line.quantity,
        doWatts: line.watts,
        pallets: computePallets(line.quantity, line.product),
      }))
    : (() => {
        const soTotalPanels = order.salesOrder.lines.reduce((s, l) => s + l.quantity, 0)
        const doQty = order.quantity
        return order.salesOrder.lines.map((line, i) => {
          const isLast = i === order.salesOrder.lines.length - 1
          const previous = order.salesOrder.lines.slice(0, i).reduce((s, l) => {
            return s + (soTotalPanels > 0 ? Math.round((l.quantity / soTotalPanels) * doQty) : 0)
          }, 0)
          const qty = isLast
            ? doQty - previous
            : (soTotalPanels > 0 ? Math.round((line.quantity / soTotalPanels) * doQty) : 0)
          const watts = qty * line.product.wattage
          return { ...line, doQty: qty, doWatts: watts, pallets: computePallets(qty, line.product) }
        })
      })()

  const validityDays = order.validityDays ?? 3

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
          <button type="button" onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Print / Save PDF</button>
          <button type="button" onClick={handleDownloadImage} disabled={imgWorking} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">
            {imgWorking ? "Working..." : "Download Image"}
          </button>
          <button type="button" onClick={handleCopyImage} disabled={imgWorking} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">
            Copy Image
          </button>
          <button type="button" onClick={() => window.close()} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm">Close</button>
        </div>

        <div ref={printAreaRef}>

        {/* Header */}
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

        {/* Deliver To + Dispatch Details */}
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
                <tr><td className="text-gray-500 pr-4">SO No.:</td><td>{order.salesOrder.soNumber}</td></tr>
                <tr><td className="text-gray-500 pr-4">Date:</td><td>{formatDate(order.createdAt)}</td></tr>
                <tr><td className="text-gray-500 pr-4">Status:</td><td className="font-medium">{order.status}</td></tr>
                {order.authorizedBy && <tr><td className="text-gray-500 pr-4">Auth. By:</td><td>{order.authorizedBy}</td></tr>}
                {order.dispatchedAt && <tr><td className="text-gray-500 pr-4">Dispatched:</td><td>{formatDate(order.dispatchedAt)}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Warehouse / Dispatch From */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <p className="text-xs text-gray-500 mb-1">Dispatch From</p>
          <p className="font-semibold text-sm text-gray-900">{order.warehouse.name}</p>
          <p className="text-xs text-gray-500">{order.warehouse.location}</p>
          {order.warehouse.godown && <p className="text-xs text-gray-500">Godown: {order.warehouse.godown}</p>}
        </div>

        {/* Line items — shows DO quantity, not full SO quantity */}
        <table className="w-full mb-6 text-sm border-collapse">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-center">Wattage</th>
              <th className="px-3 py-2 text-right">Panels (DO)</th>
              <th className="px-3 py-2 text-right">Watts</th>
              {doLines.some((l) => l.pallets !== null) && <th className="px-3 py-2 text-right">Pallets</th>}
            </tr>
          </thead>
          <tbody>
            {doLines.map((line, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                <td className="px-3 py-2">
                  <p className="font-medium">{line.product.name}</p>
                  <p className="text-xs text-gray-500">{line.product.code}</p>
                </td>
                <td className="px-3 py-2 text-center">{line.product.wattage}W</td>
                <td className="px-3 py-2 text-right font-semibold">{line.doQty.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{line.doWatts.toLocaleString()}</td>
                {doLines.some((l) => l.pallets !== null) && (
                  <td className="px-3 py-2 text-right">{line.pallets ?? "—"}</td>
                )}
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

        {/* Validity notice — shown below notes */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 mb-6 text-sm text-yellow-800 font-medium">
          This Delivery Order is valid for <span className="font-bold">{validityDays} working day{validityDays !== 1 ? "s" : ""}</span> from the date of issue.
        </div>

        {/* Signatures */}
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
        </div>{/* end printAreaRef */}
      </div>
    </>
  )
}
