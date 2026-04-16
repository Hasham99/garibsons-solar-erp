"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { formatCurrency, formatDate } from "@/lib/utils"

interface Costing {
  id: string
  reference: string
  status: string
  fobPerWatt: number
  freightPerWatt: number
  cifPerWattUsd: number
  effectiveExRate: number
  cifPerWattPkr: number
  taxRate: number
  taxPerWatt: number
  handlingPerWatt: number
  landedCostPerWatt: number
  landedCostPerPanel: number
  totalShipmentValue: number
  panelWattage: number
  totalPanels: number
  notes: string | null
  createdAt: string
  exchangeRate: { source: string; rate: number } | null
  taxConfig: {
    name: string
    customsDuty: number
    additionalCD: number
    excise: number
    salesTax: number
    additionalST: number
    incomeTax: number
    handlingPerWatt: number
  } | null
}

export default function CostingPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [costing, setCosting] = useState<Costing | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/costing/${id}`)
      .then((r) => r.json())
      .then((data) => { setCosting(data); setLoading(false) })
  }, [id])

  useEffect(() => {
    if (!loading && costing) setTimeout(() => window.print(), 500)
  }, [loading, costing])

  if (loading) return <div className="p-8 text-gray-500">Loading costing...</div>
  if (!costing) return <div className="p-8 text-red-500">Costing not found</div>

  const calcRows = [
    { step: 1, label: "FOB Cost per Watt (USD)", value: `$${costing.fobPerWatt.toFixed(4)}`, note: "From supplier proforma" },
    { step: 2, label: "Freight per Watt (USD)", value: `$${costing.freightPerWatt.toFixed(4)}`, note: "Shipping cost" },
    { step: 3, label: "CIF per Watt (USD)", value: `$${costing.cifPerWattUsd.toFixed(4)}`, note: "FOB + Freight" },
    { step: 4, label: "Exchange Rate (PKR/USD)", value: `Rs ${costing.effectiveExRate}`, note: costing.exchangeRate?.source || "Custom rate" },
    { step: 5, label: "CIF per Watt (PKR)", value: `Rs ${costing.cifPerWattPkr.toFixed(2)}`, note: "CIF USD × Exchange Rate" },
    { step: 6, label: "Tax Rate (%)", value: `${costing.taxRate.toFixed(2)}%`, note: "Customs + GST + other duties" },
    { step: 7, label: "Tax per Watt (PKR)", value: `Rs ${costing.taxPerWatt.toFixed(2)}`, note: "CIF PKR × Tax Rate" },
    { step: 8, label: "Handling per Watt (PKR)", value: `Rs ${costing.handlingPerWatt.toFixed(2)}`, note: "Fixed handling charge" },
    { step: 9, label: "Landed Cost per Watt (PKR)", value: `Rs ${costing.landedCostPerWatt.toFixed(2)}`, note: "CIF + Tax + Handling", highlight: true },
    { step: 10, label: "Panel Wattage", value: `${costing.panelWattage}W`, note: "Per panel" },
    { step: 11, label: "Landed Cost per Panel (PKR)", value: formatCurrency(costing.landedCostPerPanel), note: "Cost/Watt × Wattage", highlight: true },
    { step: 12, label: "Total Panels", value: costing.totalPanels.toLocaleString(), note: "Shipment quantity" },
    { step: 13, label: "Total Shipment Value (PKR)", value: formatCurrency(costing.totalShipmentValue), note: "Cost/Panel × Panels", highlight: true },
  ]

  return (
    <>
      <style>{`
        @media print {
          @page { margin: 15mm; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .highlight { background-color: #eff6ff !important; }
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
            <div className="text-blue-700 font-bold text-lg">LANDED COST CALCULATION</div>
            <p className="text-sm font-medium mt-1">{costing.reference}</p>
            <p className="text-xs text-gray-500">{formatDate(costing.createdAt)}</p>
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-1 ${costing.status === "FINALIZED" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
              {costing.status}
            </span>
          </div>
        </div>

        <table className="w-full mb-6 text-sm border-collapse">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="px-3 py-2 text-left w-8">Step</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2 text-left text-gray-300 text-xs">Note</th>
            </tr>
          </thead>
          <tbody>
            {calcRows.map((row) => (
              <tr key={row.step} className={row.highlight ? "highlight bg-blue-50 font-semibold" : row.step % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                <td className="px-3 py-2 text-gray-400 text-xs">{row.step}</td>
                <td className="px-3 py-2">{row.label}</td>
                <td className="px-3 py-2 text-right font-mono">{row.value}</td>
                <td className="px-3 py-2 text-gray-400 text-xs">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {costing.taxConfig && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Tax Configuration: {costing.taxConfig.name}</p>
            <div className="grid grid-cols-3 gap-2 text-sm">
              {[
                { label: "Customs Duty", value: costing.taxConfig.customsDuty },
                { label: "Additional CD", value: costing.taxConfig.additionalCD },
                { label: "Excise/Cess", value: costing.taxConfig.excise },
                { label: "Sales Tax (GST)", value: costing.taxConfig.salesTax },
                { label: "Additional ST", value: costing.taxConfig.additionalST },
                { label: "Income Tax (AIT)", value: costing.taxConfig.incomeTax },
              ].map((t) => (
                <div key={t.label} className="bg-gray-50 rounded p-2">
                  <p className="text-xs text-gray-500">{t.label}</p>
                  <p className="font-medium">{t.value}%</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {costing.notes && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Notes</p>
            <p className="text-sm text-gray-700">{costing.notes}</p>
          </div>
        )}

        <div className="border-t-2 border-gray-200 pt-6 grid grid-cols-2 gap-8 text-xs text-gray-500">
          <div>
            <p className="text-gray-600 text-sm">This document is for internal approval only. All calculations are based on rates current at the time of preparation.</p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-gray-700 mb-8">Approved By</p>
            <p>__________________________</p>
            <p>Director, Garibsons Pvt. Ltd.</p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">Generated by Garibsons Solar ERP · {new Date().toLocaleString("en-PK")}</p>
      </div>
    </>
  )
}
