import * as XLSX from "xlsx"

/**
 * Branded Excel (.xlsx) download used alongside downloadPdf for ledger/report
 * exports. Renders: company name → title → meta lines → optional KPI pairs →
 * header row → data rows → optional bold totals row, with sensible column widths.
 */

export interface ExcelOptions {
  title: string
  subtitle?: string
  metaLines?: string[]
  kpis?: { label: string; value: string }[]
  headers: string[]
  rows: (string | number)[][]
  totalsRow?: (string | number)[]
  fileName: string
  sheetName?: string
}

export function downloadExcel(opts: ExcelOptions) {
  const aoa: (string | number)[][] = []
  aoa.push(["GARIBSONS (PVT) LTD"])
  aoa.push([opts.title])
  if (opts.subtitle) aoa.push([opts.subtitle])
  for (const line of opts.metaLines || []) aoa.push([line])
  aoa.push([`Generated: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`])
  if (opts.kpis?.length) {
    aoa.push([])
    for (const k of opts.kpis) aoa.push([k.label, k.value])
  }
  aoa.push([])
  const headerRowIdx = aoa.length
  aoa.push(opts.headers)
  for (const r of opts.rows) aoa.push(r)
  if (opts.totalsRow) aoa.push(opts.totalsRow)

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Column widths sized to the longest cell in each column (capped)
  ws["!cols"] = opts.headers.map((h, c) => {
    let w = String(h).length
    for (const r of opts.rows) w = Math.max(w, String(r[c] ?? "").length)
    if (opts.totalsRow) w = Math.max(w, String(opts.totalsRow[c] ?? "").length)
    return { wch: Math.min(Math.max(w + 2, 10), 50) }
  })
  // Freeze everything above the data rows so headers stay visible
  ws["!freeze"] = { xSplit: 0, ySplit: headerRowIdx + 1 }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, (opts.sheetName || opts.title).slice(0, 31))
  XLSX.writeFile(wb, `${opts.fileName}.xlsx`)
}
