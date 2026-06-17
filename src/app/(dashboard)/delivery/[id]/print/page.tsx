"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { Printer, Download, Copy, X } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { Letterhead } from "@/components/print/Letterhead"

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
  referenceNo: string | null
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
  warehouse: {
    name: string
    location: string
    godown: string | null
    contacts?: { name: string; whatsapp: string; isPrimary: boolean }[]
  }
}

function computePallets(panels: number, product: PrintLine["product"]): number | null {
  if (!product.panelsPerContainer || !product.palletsPerContainer) return null
  const panelsPerPallet = product.panelsPerContainer / product.palletsPerContainer
  return Math.ceil(panels / panelsPerPallet)
}

/* Company contact details shown in the footer of the printed DO. The label is the
   simple title; `text` is the friendly link text (no raw URLs) and `href` the real link. */
const CONTACT_DETAILS: Array<{ label: string; text: string; href?: string }> = [
  { label: "Website", text: "gsenergysystems.com", href: "https://gsenergysystems.com" },
  { label: "Email", text: "info@gsenergysystems.com", href: "mailto:info@gsenergysystems.com" },
  { label: "Phone", text: "+92 21 35641842", href: "tel:+922135641842" },
  { label: "WhatsApp", text: "+92 336 9533566", href: "https://wa.me/923369533566" },
  { label: "Instagram", text: "gsenergypakistan", href: "https://www.instagram.com/gsenergypakistan?igsh=cnplZ2t3dGN5OWFj" },
  { label: "LinkedIn", text: "GS Energy Systems", href: "https://www.linkedin.com/company/gs-energy-systems/" },
  { label: "Facebook", text: "GS Energy Systems", href: "https://www.facebook.com/share/1BQh3QPueT/" },
]

function ContactRow({ label, text, href }: { label: string; text: string; href?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-16 shrink-0 text-gray-400">{label}</span>
      {href ? (
        <a href={href} className="text-gray-700 underline decoration-gray-300 underline-offset-2">
          {text}
        </a>
      ) : (
        <span className="text-gray-700">{text}</span>
      )}
    </div>
  )
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

    // The footer should sit at the bottom of the A4 page, not flow right after the
    // content. We exclude it from the capture and redraw it onto the canvas below.
    const footerText = printAreaRef.current.querySelector("[data-footer]")?.textContent ?? ""

    // Capture at natural rendered size — no width override to avoid clipping.
    // The fixed-position watermark renders unpredictably in html-to-image, so we
    // exclude it here and redraw it onto the canvas ourselves below.
    const dataUrl = await toPng(printAreaRef.current, {
      quality: 1,
      pixelRatio: PIXEL_RATIO,
      backgroundColor: "#ffffff",
      filter: (node) => !(node instanceof HTMLElement && (node.dataset.watermark || node.dataset.footer)),
    })

    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const pad = PAD * PIXEL_RATIO

        // The image is always a fixed A4 page — same as the PDF print.
        const canvasW = A4_W * PIXEL_RATIO
        const canvasH = A4_H * PIXEL_RATIO

        // Reserve a band at the bottom for the footer so content never overlaps it.
        const footerBand = footerText ? 50 * PIXEL_RATIO : 0
        const contentAreaW = canvasW - pad * 2
        const contentAreaH = canvasH - pad * 2 - footerBand

        // Scale content to fit within the A4 content area (width and height).
        const scale = Math.min(contentAreaW / img.width, contentAreaH / img.height)
        const scaledW = Math.round(img.width * scale)
        const scaledH = Math.round(img.height * scale)
        const dx = Math.round((canvasW - scaledW) / 2)

        const canvas = document.createElement("canvas")
        canvas.width = canvasW
        canvas.height = canvasH

        const ctx = canvas.getContext("2d")!
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(0, 0, canvasW, canvasH)
        ctx.drawImage(img, dx, pad, scaledW, scaledH)

        // Draw the footer pinned to the bottom of the A4 page.
        if (footerText) {
          ctx.save()
          ctx.fillStyle = "#9ca3af"
          ctx.font = `${12 * PIXEL_RATIO}px Arial, sans-serif`
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(footerText, canvasW / 2, canvasH - pad)
          ctx.restore()
        }

        const logo = new Image()
        logo.onload = () => {
          const wmW = 420 * PIXEL_RATIO
          const wmH = wmW * (logo.height / logo.width)
          ctx.save()
          ctx.globalAlpha = 0.05
          ctx.translate(canvasW / 2, canvasH / 2)
          ctx.drawImage(logo, -wmW / 2, -wmH / 2, wmW, wmH)
          ctx.restore()
          resolve(canvas)
        }
        logo.onerror = () => resolve(canvas)
        // Match the on-screen / print watermark (Letterhead uses logo-emblem.png).
        logo.src = "/logo-emblem.png"
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

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <div className="animate-pulse space-y-6" aria-hidden>
          {/* Letterhead */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-xl bg-slate-200" />
              <div className="space-y-2">
                <div className="h-5 w-52 rounded bg-slate-200" />
                <div className="h-3 w-36 rounded bg-slate-100" />
                <div className="h-3 w-64 rounded bg-slate-100" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="ml-auto h-5 w-40 rounded bg-slate-200" />
              <div className="ml-auto h-3 w-24 rounded bg-slate-100" />
            </div>
          </div>
          <div className="h-px bg-slate-200" />
          {/* Deliver to / dispatch details */}
          <div className="grid grid-cols-2 gap-8">
            {[0, 1].map((c) => (
              <div key={c} className="space-y-2.5">
                <div className="h-3 w-24 rounded bg-slate-100" />
                <div className="h-4 w-40 rounded bg-slate-200" />
                <div className="h-3 w-32 rounded bg-slate-100" />
              </div>
            ))}
          </div>
          {/* Table */}
          <div className="space-y-2">
            <div className="h-9 rounded bg-slate-200" />
            {[0, 1, 2].map((r) => (
              <div key={r} className="h-8 rounded bg-slate-100" />
            ))}
          </div>
        </div>
        <p className="mt-10 text-center text-sm text-slate-400">Preparing delivery order…</p>
      </div>
    )
  }
  if (!order) {
    return (
      <div className="mx-auto mt-24 max-w-md px-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
          <X size={22} />
        </div>
        <p className="mt-4 text-base font-semibold text-slate-800">Delivery order not found</p>
        <p className="mt-1 text-sm text-slate-500">It may have been deleted, or the link is invalid.</p>
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
          .print-footer { position: fixed; bottom: 0; left: 0; right: 0; }
        }
        body { font-family: Arial, sans-serif; }
      `}</style>

      <div className="print-surface relative max-w-3xl mx-auto p-8 bg-white">
        <div className="no-print flex justify-end mb-4 gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            <Printer size={15} /> Print / Save PDF
          </button>
          <button
            type="button"
            onClick={handleDownloadImage}
            disabled={imgWorking}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <Download size={15} /> {imgWorking ? "Working…" : "Download Image"}
          </button>
          <button
            type="button"
            onClick={handleCopyImage}
            disabled={imgWorking}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <Copy size={15} /> Copy Image
          </button>
          <button
            type="button"
            onClick={() => window.close()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50"
          >
            <X size={15} /> Close
          </button>
        </div>

        <div ref={printAreaRef}>

        {/* Header */}
        <Letterhead docTitle="DELIVERY ORDER" docNumber={order.doNumber} docDate={formatDate(order.createdAt)} />

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
                {order.referenceNo && <tr><td className="text-gray-500 pr-4">Ref. DO No.:</td><td className="font-medium">{order.referenceNo}</td></tr>}
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
          {order.warehouse.contacts?.[0]?.name && (
            <p className="font-semibold text-sm text-gray-900">ATTN: {order.warehouse.contacts[0].name}</p>
          )}
          {order.warehouse.contacts?.[0]?.whatsapp && (
            <p className="text-xs text-gray-500">{order.warehouse.contacts[0].whatsapp}</p>
          )}
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

        {/* Thank-you note */}
        <div className="border-t-2 border-gray-200 pt-6 text-center">
          <p className="text-sm font-semibold text-gray-800">Thank you for your business!</p>
          <p className="text-xs text-gray-500 mt-1">
            For any help, questions, or feedback, please don&apos;t hesitate to reach out to us.
          </p>
        </div>

        {/* Company contact details — fills the lower area of the page */}
        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50/60 px-6 py-4">
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 mb-3">Get in touch</p>
          <div className="grid grid-cols-2 gap-x-12 gap-y-2.5 text-xs max-w-xl mx-auto">
            {CONTACT_DETAILS.map((c) => (
              <ContactRow key={c.label} label={c.label} text={c.text} href={c.href} />
            ))}
          </div>
        </div>

        <p data-footer className="print-footer text-center text-xs text-gray-400 mt-12 pt-4">Generated by GS Energy Solar ERP · {new Date().toLocaleString("en-PK")}</p>
        </div>{/* end printAreaRef */}
      </div>
    </>
  )
}
