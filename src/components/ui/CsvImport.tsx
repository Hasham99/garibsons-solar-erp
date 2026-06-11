"use client"

import { useRef, useState } from "react"
import * as XLSX from "xlsx"
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, X } from "lucide-react"
import { Button } from "./Button"
import { Modal } from "./Modal"

export interface ImportResult {
  inserted: number
  skipped: number
  errors: { row: number; message: string }[]
}

interface CsvImportProps {
  /** API endpoint that accepts { rows } and returns an ImportResult. */
  endpoint: string
  /** Heading shown in the modal. */
  title: string
  /** Column headers for the downloadable sample template. */
  sampleColumns: string[]
  /** One or more example data rows for the sample template. */
  sampleRows?: (string | number)[][]
  /** File name used for the sample download (without extension). */
  sampleName?: string
  /** Short help text shown above the uploader. */
  guide?: string
  /** Label for the trigger button. */
  label?: string
  /** Called after a successful import so the page can refetch. */
  onComplete?: () => void
}

function toCsv(columns: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "")
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n")
}

export function CsvImport({
  endpoint,
  title,
  sampleColumns,
  sampleRows = [],
  sampleName = "sample",
  guide,
  label = "Import CSV",
  onComplete,
}: CsvImportProps) {
  const [open, setOpen] = useState(false)
  const [fileName, setFileName] = useState("")
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setFileName("")
    setRows([])
    setResult(null)
    setError("")
    if (inputRef.current) inputRef.current.value = ""
  }

  const close = () => {
    setOpen(false)
    reset()
  }

  const downloadSample = () => {
    const csv = toCsv(sampleColumns, sampleRows)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${sampleName}-template.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleFile = async (file: File) => {
    setParsing(true)
    setError("")
    setResult(null)
    try {
      const buf = await file.arrayBuffer()
      // raw:true + cellDates:false — keep CSV date text as-is (e.g. "09-06-26" stays
      // a string) so the server parses dates DAY-FIRST (DD-MM-YY). Letting SheetJS
      // parse them would silently apply US month-first order. .xlsx date cells
      // arrive as Excel serial numbers, which the server also handles.
      const wb = XLSX.read(buf, { type: "array", raw: true, cellDates: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true })
      // normalise Date cells to ISO strings for JSON transport
      const normalised = parsed.map((r) => {
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(r)) out[k] = v instanceof Date ? v.toISOString() : v
        return out
      })
      // Drop the template's format-hint row (first cell starts with "FORMAT") if present.
      const dataRows = normalised.filter(
        (r) => !String(Object.values(r)[0] ?? "").trim().toLowerCase().startsWith("format")
      )
      setRows(dataRows)
      setFileName(file.name)
    } catch {
      setError("Could not read this file. Please upload a .csv or .xlsx file.")
    } finally {
      setParsing(false)
    }
  }

  const runImport = async () => {
    setImporting(true)
    setError("")
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Import failed")
        return
      }
      setResult(data as ImportResult)
      onComplete?.()
    } catch {
      setError("Import failed — network or server error.")
    } finally {
      setImporting(false)
    }
  }

  const previewCols = rows.length ? Object.keys(rows[0]).slice(0, 6) : []

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Upload size={15} className="mr-2" />
        {label}
      </Button>

      <Modal isOpen={open} onClose={close} title={title} size="lg">
        <div className="space-y-4">
          {/* Sample download */}
          <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 p-3">
            <div className="text-sm">
              <p className="font-medium text-blue-900">Need the format?</p>
              <p className="text-xs text-blue-700">Download the sample, fill it in, then upload.</p>
            </div>
            <Button size="sm" variant="ghost" onClick={downloadSample}>
              <Download size={14} className="mr-1" />Sample CSV
            </Button>
          </div>

          {guide && <p className="text-xs text-gray-500">{guide}</p>}

          {/* Uploader */}
          {!result && (
            <div className="rounded-xl border-2 border-dashed border-gray-300 p-6 text-center">
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <FileSpreadsheet size={28} className="mx-auto text-gray-400" />
              {fileName ? (
                <p className="mt-2 text-sm font-medium text-gray-800">{fileName}</p>
              ) : (
                <p className="mt-2 text-sm text-gray-500">Upload a .csv or .xlsx file</p>
              )}
              <Button size="sm" variant="secondary" className="mt-3" onClick={() => inputRef.current?.click()} loading={parsing}>
                Choose File
              </Button>
              {fileName && (
                <button onClick={reset} className="ml-2 text-xs text-gray-400 hover:text-gray-600">
                  <X size={13} className="inline" /> clear
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle size={15} />{error}
            </div>
          )}

          {/* Preview */}
          {rows.length > 0 && !result && (
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">
                {rows.length.toLocaleString()} rows found — preview:
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {previewCols.map((c) => (
                        <th key={c} className="px-2 py-1.5 text-left font-medium text-gray-500">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        {previewCols.map((c) => (
                          <td key={c} className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{String(r[c] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <CheckCircle2 size={16} />
                Imported <strong>{result.inserted.toLocaleString()}</strong> records
                {result.skipped > 0 && <span>· skipped {result.skipped.toLocaleString()} duplicate(s)</span>}
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-1 text-sm font-medium text-amber-800">
                    {result.errors.length.toLocaleString()} row(s) could not be imported:
                  </p>
                  <div className="max-h-48 overflow-y-auto text-xs text-amber-700">
                    {result.errors.slice(0, 200).map((e, i) => (
                      <p key={i}>Row {e.row}: {e.message}</p>
                    ))}
                    {result.errors.length > 200 && <p>…and {result.errors.length - 200} more</p>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={close}>{result ? "Close" : "Cancel"}</Button>
            {!result && (
              <Button onClick={runImport} loading={importing} disabled={rows.length === 0}>
                Import {rows.length > 0 ? rows.length.toLocaleString() : ""} Rows
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}
