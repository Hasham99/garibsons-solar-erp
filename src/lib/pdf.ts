import jsPDF, { GState } from "jspdf"
import autoTable from "jspdf-autotable"
import { GS_LOGO } from "@/lib/logo"

/**
 * Branded, director-grade PDF builder used by ledger/report exports.
 * Renders: blue company masthead → report title + meta → optional KPI chips →
 * striped data table (+ bold totals row) → page footer with date & page no.
 */

export interface PdfColumn {
  header: string
  align?: "left" | "right" | "center"
}

export interface PdfKpi {
  label: string
  value: string
}

export interface PdfOptions {
  title: string
  subtitle?: string
  metaLines?: string[]
  kpis?: PdfKpi[]
  columns: PdfColumn[]
  rows: (string | number)[][]
  totalsRow?: (string | number)[]
  fileName: string
  orientation?: "portrait" | "landscape"
}

const BLUE: [number, number, number] = [37, 99, 235] // tailwind blue-600
const DARK: [number, number, number] = [17, 24, 39] // gray-900
const GRAY: [number, number, number] = [107, 114, 128] // gray-500

export function downloadPdf(opts: PdfOptions) {
  const doc = new jsPDF({ orientation: opts.orientation ?? "portrait", unit: "pt", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 40

  // ── Masthead: logo + company identity, blue rule underneath ──
  try {
    doc.addImage(GS_LOGO, "PNG", margin, 14, 39, 40) // mark is 294×300
  } catch {
    /* logo render is best-effort */
  }
  doc.setTextColor(...DARK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.text("GARIBSONS (PVT) LTD", margin + 52, 30)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...GRAY)
  doc.text("C-69/71, 12th Commercial Street II Extension, D.H.A. Karachi - 75500, Pakistan", margin + 52, 44)
  doc.setFontSize(9)
  doc.text(
    `Generated: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`,
    pageW - margin,
    30,
    { align: "right" }
  )
  doc.setDrawColor(...BLUE)
  doc.setLineWidth(2)
  doc.line(margin, 64, pageW - margin, 64)

  // ── Title block ──
  let y = 92
  doc.setTextColor(...DARK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  doc.text(opts.title, margin, y)
  if (opts.subtitle) {
    y += 18
    doc.setFontSize(11)
    doc.setFont("helvetica", "normal")
    doc.text(opts.subtitle, margin, y)
  }
  if (opts.metaLines?.length) {
    doc.setFontSize(9)
    doc.setTextColor(...GRAY)
    for (const line of opts.metaLines) {
      y += 14
      doc.text(line, margin, y)
    }
  }
  y += 16

  // ── KPI chips ──
  if (opts.kpis?.length) {
    const chipW = (pageW - margin * 2 - (opts.kpis.length - 1) * 10) / opts.kpis.length
    const chipH = 44
    opts.kpis.forEach((k, i) => {
      const x = margin + i * (chipW + 10)
      doc.setFillColor(243, 244, 246) // gray-100
      doc.roundedRect(x, y, chipW, chipH, 4, 4, "F")
      doc.setFontSize(8)
      doc.setTextColor(...GRAY)
      doc.text(k.label.toUpperCase(), x + 10, y + 16)
      doc.setFontSize(11)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(...DARK)
      doc.text(k.value, x + 10, y + 33)
      doc.setFont("helvetica", "normal")
    })
    y += chipH + 18
  }

  // ── Table ──
  const body = opts.rows.map((r) => r.map((c) => String(c ?? "")))
  const foot = opts.totalsRow ? [opts.totalsRow.map((c) => String(c ?? ""))] : undefined
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, top: 80 },
    head: [opts.columns.map((c) => c.header)],
    body,
    foot,
    showFoot: "lastPage", // totals once, after ALL data — not repeated per page
    styles: { fontSize: 8.5, cellPadding: 5, textColor: DARK },
    headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
    footStyles: { fillColor: [229, 231, 235], textColor: DARK, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: Object.fromEntries(
      opts.columns.map((c, i) => [i, { halign: c.align ?? "left" }])
    ),
    didParseCell: (data) => {
      // columnStyles only affect body cells — mirror each column's alignment
      // onto head & foot so the TOTAL row lines up with the values above it.
      if (data.section === "head" || data.section === "foot") {
        data.cell.styles.halign = opts.columns[data.column.index]?.align ?? "left"
      }
    },
    didDrawPage: () => {
      const pageH = doc.internal.pageSize.getHeight()

      // Faint brand watermark, centered on every page (best-effort)
      try {
        doc.saveGraphicsState()
        doc.setGState(new GState({ opacity: 0.05 }))
        const wmW = 300
        const wmH = wmW * (300 / 294) // mark is 294×300
        doc.addImage(GS_LOGO, "PNG", (pageW - wmW) / 2, (pageH - wmH) / 2, wmW, wmH)
        doc.restoreGraphicsState()
      } catch {
        /* watermark render is best-effort */
      }

      doc.setFontSize(8)
      doc.setTextColor(...GRAY)
      doc.text("Garibsons (Pvt) Ltd — internal report", margin, pageH - 20)
      doc.text(`Page ${doc.getNumberOfPages()}`, pageW - margin, pageH - 20, { align: "right" })
    },
  })

  doc.save(`${opts.fileName}.pdf`)
}

/** Simple CSV download for the same row/column data. */
export function downloadCsv(fileName: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "")
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${fileName}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
