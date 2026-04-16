"use client"

import { useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { LoadingPage } from "@/components/ui/Spinner"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Download } from "lucide-react"
import toast, { Toaster } from "react-hot-toast"

interface PLRow {
  poNumber: string
  product: string
  supplier: string
  totalPanels: number
  panelsSold: number
  panelsRemaining: number
  landedCostPerPanel: number
  totalLandedCost: number
  costOfSales: number
  salesRevenue: number
  grossProfit: number
  grossMarginPct: number
  inventoryValue: number
  status: string
}

interface PLData {
  rows: PLRow[]
  totals: {
    panelsSold: number
    salesRevenue: number
    costOfSales: number
    grossProfit: number
    inventoryValue: number
    grossMarginPct: number
  }
}

interface ReceivablesData {
  aging: Array<{
    invoiceNumber: string
    customer: string
    invoiceDate: string
    grandTotal: number
    outstanding: number
    daysDiff: number
    bucket: string
  }>
  summary: { current: number; "1to30": number; "31to60": number; "61to90": number; over90: number; total: number }
}

interface GSTInputRow {
  reference: string
  date: string
  supplier: string
  product: string
  totalLandedCost: number
  gstInputAmount: number
}

interface GSTData {
  gstOutput: Array<{
    invoiceNumber: string
    invoiceDate: string
    customer: string
    customerNTN: string | null
    customerSTRN: string | null
    subTotal: number
    gstRate: number
    gstAmount: number
    grandTotal: number
  }>
  gstInput: GSTInputRow[]
  summary: { totalSales: number; totalGSTOutput: number; totalGSTInput: number; netGSTPayable: number }
}

const AGING_BUCKETS = [
  { label: "Current (0d)", key: "current", color: "bg-green-50 border-green-200 text-green-800" },
  { label: "1–30 Days", key: "1to30", color: "bg-yellow-50 border-yellow-200 text-yellow-800" },
  { label: "31–60 Days", key: "31to60", color: "bg-orange-50 border-orange-200 text-orange-800" },
  { label: "61–90 Days", key: "61to90", color: "bg-red-50 border-red-200 text-red-700" },
  { label: "90+ Days", key: "over90", color: "bg-red-100 border-red-300 text-red-900" },
]

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<"receivables" | "gst" | "pl">("receivables")
  const [gstMonth, setGstMonth] = useState(new Date().toISOString().slice(0, 7))
  const [exportingGST, setExportingGST] = useState(false)

  const { data: plData, loading: plLoading } = useFetch<PLData>("/api/reports/pl")
  const { data: receivables, loading: recLoading } = useFetch<ReceivablesData>("/api/reports/receivables")
  const { data: gstData, loading: gstLoading } = useFetch<GSTData>(
    `/api/reports/gst${gstMonth ? `?month=${gstMonth}` : ""}`,
    [gstMonth]
  )

  const handleGSTExport = async () => {
    setExportingGST(true)
    try {
      const url = `/api/reports/gst-export${gstMonth ? `?month=${gstMonth}` : ""}`
      const res = await fetch(url)
      if (!res.ok) { toast.error("Export failed"); return }
      const blob = await res.blob()
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = `GST_Return_${gstMonth || "All"}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
      toast.success("GST export downloaded")
    } finally {
      setExportingGST(false)
    }
  }

  const tabs = [
    { key: "receivables", label: "Receivables Aging" },
    { key: "gst", label: "GST Returns" },
    { key: "pl", label: "P&L by Shipment" },
  ]

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <Header title="Reports & Analytics" />

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── RECEIVABLES AGING ── */}
      {activeTab === "receivables" && (
        <div className="space-y-6">
          {recLoading ? <LoadingPage /> : (
            <>
              {receivables && (
                <div className="grid grid-cols-5 gap-3">
                  {AGING_BUCKETS.map(({ label, key, color }) => (
                    <div key={key} className={`rounded-xl border p-4 ${color}`}>
                      <p className="text-xs font-medium">{label}</p>
                      <p className="font-bold text-lg mt-1">{formatCurrency(receivables.summary[key as keyof typeof receivables.summary])}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Invoice #", "Customer", "Invoice Date", "Total", "Outstanding", "Age", "Bucket"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {receivables?.aging.map((item) => (
                      <tr key={item.invoiceNumber} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-blue-700">{item.invoiceNumber}</td>
                        <td className="px-4 py-3 text-sm">{item.customer}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{formatDate(item.invoiceDate)}</td>
                        <td className="px-4 py-3 text-sm">{formatCurrency(item.grandTotal)}</td>
                        <td className="px-4 py-3 text-sm font-bold text-red-600">{formatCurrency(item.outstanding)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{item.daysDiff}d</td>
                        <td className="px-4 py-3"><Badge status={item.bucket.toUpperCase()} /></td>
                      </tr>
                    ))}
                    {(!receivables?.aging || receivables.aging.length === 0) && (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">No outstanding receivables — all invoices paid</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {receivables && receivables.summary.total > 0 && (
                <div className="flex justify-end">
                  <div className="bg-red-50 border border-red-200 rounded-xl px-6 py-3">
                    <span className="text-red-800 font-bold">Total Outstanding: {formatCurrency(receivables.summary.total)}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── GST RETURNS ── */}
      {activeTab === "gst" && (
        <div className="space-y-6">
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
              <input
                type="month"
                value={gstMonth}
                onChange={(e) => setGstMonth(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <Button onClick={handleGSTExport} loading={exportingGST} variant="secondary">
              <Download size={14} className="mr-2" />
              Export Excel (FBR)
            </Button>
          </div>

          {gstLoading ? <LoadingPage /> : (
            <>
              {gstData && (
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-sm text-gray-500">Total Sales (Ex-GST)</p>
                    <p className="text-xl font-bold mt-1">{formatCurrency(gstData.summary.totalSales)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                    <p className="text-sm text-blue-600">GST Output (Collected)</p>
                    <p className="text-xl font-bold text-blue-800 mt-1">{formatCurrency(gstData.summary.totalGSTOutput)}</p>
                  </div>
                  <div className="bg-green-50 rounded-xl border border-green-200 p-4">
                    <p className="text-sm text-green-600">GST Input (Paid on Imports)</p>
                    <p className="text-xl font-bold text-green-800 mt-1">{formatCurrency(gstData.summary.totalGSTInput)}</p>
                  </div>
                  <div className={`rounded-xl border p-4 ${gstData.summary.netGSTPayable >= 0 ? "bg-orange-50 border-orange-200" : "bg-green-100 border-green-300"}`}>
                    <p className={`text-sm ${gstData.summary.netGSTPayable >= 0 ? "text-orange-600" : "text-green-700"}`}>
                      Net GST {gstData.summary.netGSTPayable >= 0 ? "Payable" : "Refundable"}
                    </p>
                    <p className={`text-xl font-bold mt-1 ${gstData.summary.netGSTPayable >= 0 ? "text-orange-800" : "text-green-800"}`}>
                      {formatCurrency(Math.abs(gstData.summary.netGSTPayable))}
                    </p>
                  </div>
                </div>
              )}

              {/* Output GST Table */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="px-6 py-3 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900 text-sm">Output GST — Sales Invoices</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {["Invoice #", "Date", "Customer", "NTN", "Sales (Ex-GST)", "GST Rate", "GST Amount", "Total"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {gstData?.gstOutput.map((item) => (
                        <tr key={item.invoiceNumber} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium">{item.invoiceNumber}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{formatDate(item.invoiceDate)}</td>
                          <td className="px-4 py-3 text-sm">{item.customer}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{item.customerNTN || "—"}</td>
                          <td className="px-4 py-3 text-sm">{formatCurrency(item.subTotal)}</td>
                          <td className="px-4 py-3 text-sm">{item.gstRate}%</td>
                          <td className="px-4 py-3 text-sm text-blue-600 font-medium">{formatCurrency(item.gstAmount)}</td>
                          <td className="px-4 py-3 text-sm font-bold">{formatCurrency(item.grandTotal)}</td>
                        </tr>
                      ))}
                      {(!gstData?.gstOutput || gstData.gstOutput.length === 0) && (
                        <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">No invoices for this period</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Input GST Table */}
              {gstData && gstData.gstInput.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                  <div className="px-6 py-3 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-900 text-sm">Input GST — Import / Clearing</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {["PO Reference", "Date", "Supplier", "Product", "Total Landed Cost", "GST Input"].map((h) => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {gstData.gstInput.map((item) => (
                          <tr key={item.reference} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium">{item.reference}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{formatDate(item.date)}</td>
                            <td className="px-4 py-3 text-sm">{item.supplier}</td>
                            <td className="px-4 py-3 text-sm">{item.product}</td>
                            <td className="px-4 py-3 text-sm">{formatCurrency(item.totalLandedCost)}</td>
                            <td className="px-4 py-3 text-sm text-green-700 font-medium">{formatCurrency(item.gstInputAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── P&L BY SHIPMENT ── */}
      {activeTab === "pl" && (
        <div className="space-y-6">
          {plLoading ? <LoadingPage /> : (
            <>
              {plData && (
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-sm text-gray-500">Sales Revenue</p>
                    <p className="text-xl font-bold mt-1">{formatCurrency(plData.totals.salesRevenue)}</p>
                  </div>
                  <div className="bg-red-50 rounded-xl border border-red-200 p-4">
                    <p className="text-sm text-red-600">Cost of Sales</p>
                    <p className="text-xl font-bold text-red-800 mt-1">{formatCurrency(plData.totals.costOfSales)}</p>
                  </div>
                  <div className={`rounded-xl border p-4 ${plData.totals.grossProfit >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                    <p className={`text-sm ${plData.totals.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>Gross Profit</p>
                    <p className={`text-xl font-bold mt-1 ${plData.totals.grossProfit >= 0 ? "text-green-800" : "text-red-800"}`}>
                      {formatCurrency(plData.totals.grossProfit)}
                    </p>
                  </div>
                  <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                    <p className="text-sm text-blue-600">Gross Margin</p>
                    <p className="text-xl font-bold text-blue-800 mt-1">{plData.totals.grossMarginPct.toFixed(1)}%</p>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {["PO", "Product", "Supplier", "Total", "Sold", "Remaining", "Revenue", "COGS", "Gross Profit", "Margin %", "Inv. Value", "Status"].map((h) => (
                        <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {plData?.rows.map((item) => (
                      <tr key={item.poNumber} className="hover:bg-gray-50">
                        <td className="px-3 py-3 text-sm font-medium text-blue-700">{item.poNumber}</td>
                        <td className="px-3 py-3 text-sm max-w-[140px] truncate" title={item.product}>{item.product}</td>
                        <td className="px-3 py-3 text-sm text-gray-600 max-w-[120px] truncate">{item.supplier}</td>
                        <td className="px-3 py-3 text-sm">{item.totalPanels.toLocaleString()}</td>
                        <td className="px-3 py-3 text-sm">{item.panelsSold.toLocaleString()}</td>
                        <td className="px-3 py-3 text-sm">{item.panelsRemaining.toLocaleString()}</td>
                        <td className="px-3 py-3 text-sm font-medium">{item.salesRevenue > 0 ? formatCurrency(item.salesRevenue) : <span className="text-gray-400">—</span>}</td>
                        <td className="px-3 py-3 text-sm text-red-600">{formatCurrency(item.costOfSales)}</td>
                        <td className={`px-3 py-3 text-sm font-semibold ${item.grossProfit >= 0 ? "text-green-700" : "text-red-600"}`}>
                          {item.salesRevenue > 0 ? formatCurrency(item.grossProfit) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className={`px-3 py-3 text-sm font-bold ${item.grossMarginPct >= 0 ? "text-green-700" : "text-red-600"}`}>
                          {item.salesRevenue > 0 ? `${item.grossMarginPct.toFixed(1)}%` : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-600">{formatCurrency(item.inventoryValue)}</td>
                        <td className="px-3 py-3"><Badge status={item.status} /></td>
                      </tr>
                    ))}
                    {(!plData?.rows || plData.rows.length === 0) && (
                      <tr><td colSpan={12} className="px-4 py-12 text-center text-gray-400 text-sm">No shipment data. Receive stock from cleared POs to see P&L.</td></tr>
                    )}
                  </tbody>
                  {plData && plData.rows.length > 0 && (
                    <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                      <tr>
                        <td colSpan={3} className="px-3 py-3 text-sm font-bold text-gray-700">TOTAL</td>
                        <td className="px-3 py-3 text-sm font-bold">{plData.rows.reduce((s, r) => s + r.totalPanels, 0).toLocaleString()}</td>
                        <td className="px-3 py-3 text-sm font-bold">{plData.totals.panelsSold.toLocaleString()}</td>
                        <td className="px-3 py-3 text-sm font-bold">{plData.rows.reduce((s, r) => s + r.panelsRemaining, 0).toLocaleString()}</td>
                        <td className="px-3 py-3 text-sm font-bold">{formatCurrency(plData.totals.salesRevenue)}</td>
                        <td className="px-3 py-3 text-sm font-bold text-red-600">{formatCurrency(plData.totals.costOfSales)}</td>
                        <td className={`px-3 py-3 text-sm font-bold ${plData.totals.grossProfit >= 0 ? "text-green-700" : "text-red-600"}`}>
                          {formatCurrency(plData.totals.grossProfit)}
                        </td>
                        <td className={`px-3 py-3 text-sm font-bold ${plData.totals.grossMarginPct >= 0 ? "text-green-700" : "text-red-600"}`}>
                          {plData.totals.grossMarginPct.toFixed(1)}%
                        </td>
                        <td className="px-3 py-3 text-sm font-bold text-gray-600">{formatCurrency(plData.totals.inventoryValue)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
