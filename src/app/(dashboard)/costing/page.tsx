"use client"

import { useState, useEffect } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Badge } from "@/components/ui/Badge"
import { Card } from "@/components/ui/Card"
import { Table } from "@/components/ui/Table"
import { formatCurrency, formatDate } from "@/lib/utils"
import toast from "react-hot-toast"
import { Toaster } from "react-hot-toast"

interface ExchangeRate {
  id: string
  date: string
  source: string
  rate: number
}

interface TaxConfig {
  id: string
  name: string
  customsDuty: number
  additionalCD: number
  excise: number
  salesTax: number
  additionalST: number
  incomeTax: number
  handlingPerWatt: number
  isDefault: boolean
}

interface CostingCalc {
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
  impTotalCost: number | null
  createdAt: string
}

const impFields = [
  { key: "impLcValuePkr",       label: "Document LC Value PKR" },
  { key: "impFreightFob",       label: "Import Freight - FOB" },
  { key: "impBankCharges",      label: "Bank Charges" },
  { key: "impMarineInsurance",  label: "Insurance Marine/Transit 0.15%" },
  { key: "impSalesTax",         label: "S.Tax (10%+3%)" },
  { key: "impExcise",           label: "Excise 0.80%" },
  { key: "impShippingDO",       label: "Shipping DO" },
  { key: "impTerminalHandling", label: "Terminal (THC)" },
  { key: "impMiscClearing",     label: "Misc Customs & Clearing" },
  { key: "impTransportation",   label: "Transportation" },
  { key: "impMiscAdminGs",      label: "Misc & Admin GS" },
] as const

type ImpKey = (typeof impFields)[number]["key"]

const emptyImpForm: Record<ImpKey, string> = {
  impLcValuePkr: "", impFreightFob: "", impBankCharges: "", impMarineInsurance: "",
  impSalesTax: "", impExcise: "", impShippingDO: "", impTerminalHandling: "",
  impMiscClearing: "", impTransportation: "", impMiscAdminGs: "",
}

export default function CostingPage() {
  const { data: rates } = useFetch<ExchangeRate[]>("/api/exchange-rates")
  const { data: taxConfigs } = useFetch<TaxConfig[]>("/api/tax-configs")
  const { data: costings, refetch } = useFetch<CostingCalc[]>("/api/costing")

  // ── Step 01: CIF Calculation ──
  const [fobPerWatt, setFobPerWatt] = useState("")
  const [freightPerWatt, setFreightPerWatt] = useState("")
  const [panelWattage, setPanelWattage] = useState("")
  const [totalPanels, setTotalPanels] = useState("")
  const [selectedRateId, setSelectedRateId] = useState("")
  const [customExRate, setCustomExRate] = useState("")
  const [selectedTaxId, setSelectedTaxId] = useState("")
  const [taxMode, setTaxMode] = useState<"config" | "simple">("config")
  const [simpleTaxRate, setSimpleTaxRate] = useState("22.5")
  const [notes, setNotes] = useState("")

  // ── Step 02: Import Cost Breakdown ──
  const [impForm, setImpForm] = useState<Record<ImpKey, string>>(emptyImpForm)

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (rates && rates.length > 0 && !selectedRateId) setSelectedRateId(rates[0].id)
  }, [rates, selectedRateId])

  useEffect(() => {
    if (taxConfigs && !selectedTaxId) {
      const def = taxConfigs.find((t) => t.isDefault) || taxConfigs[0]
      if (def) setSelectedTaxId(def.id)
    }
  }, [taxConfigs, selectedTaxId])

  // ── Step 01 calculations ──
  const fob = parseFloat(fobPerWatt) || 0
  const freight = parseFloat(freightPerWatt) || 0
  const cifUsd = fob + freight
  const selectedRate = rates?.find((r) => r.id === selectedRateId)
  const exRate = customExRate ? parseFloat(customExRate) : (selectedRate?.rate || 0)
  const cifPkr = cifUsd * exRate

  let taxRate = parseFloat(simpleTaxRate) || 0
  let handlingPW = 2
  if (taxMode === "config" && selectedTaxId) {
    const tc = taxConfigs?.find((t) => t.id === selectedTaxId)
    if (tc) {
      taxRate = tc.customsDuty + tc.additionalCD + tc.excise + tc.salesTax + tc.additionalST + tc.incomeTax
      handlingPW = tc.handlingPerWatt
    }
  }
  const taxPerWatt = cifPkr * (taxRate / 100)
  const landedCostPerWatt = cifPkr + taxPerWatt + handlingPW
  const wattage = parseInt(panelWattage) || 0
  const panels = parseInt(totalPanels) || 0
  const landedCostPerPanel = landedCostPerWatt * wattage
  const totalShipmentValue = landedCostPerPanel * panels

  // ── Step 02 calculations ──
  const totalWatts = panels * wattage
  const impTotal = impFields.reduce((sum, f) => sum + (parseFloat(impForm[f.key]) || 0), 0)
  const avgPerWatt = (totalWatts > 0 && impTotal > 0) ? impTotal / totalWatts : null

  const handleSave = async (status: "DRAFT" | "FINALIZED") => {
    setSaving(true)
    try {
      const impTotalCost = impTotal > 0 ? impTotal : null
      const body = {
        status,
        fobPerWatt: fob,
        freightPerWatt: freight,
        exchangeRateId: selectedRateId || null,
        customExchangeRate: customExRate ? parseFloat(customExRate) : null,
        taxConfigId: taxMode === "config" ? selectedTaxId : null,
        customTaxRate: taxMode === "simple" ? parseFloat(simpleTaxRate) : null,
        panelWattage: wattage,
        totalPanels: panels,
        notes,
        cifPerWattUsd: cifUsd,
        effectiveExRate: exRate,
        cifPerWattPkr: cifPkr,
        taxRate,
        taxPerWatt,
        handlingPerWatt: handlingPW,
        landedCostPerWatt,
        landedCostPerPanel,
        totalShipmentValue,
        ...Object.fromEntries(impFields.map((f) => [f.key, impForm[f.key] || null])),
        impTotalCost,
      }

      const res = await fetch("/api/costing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        toast.success(`Costing saved as ${status}`)
        refetch()
      } else {
        toast.error("Failed to save costing")
      }
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    { key: "reference", header: "Reference", sortable: true },
    { key: "status", header: "Status", render: (row: CostingCalc) => <Badge status={row.status} /> },
    { key: "panelWattage", header: "Wattage", render: (row: CostingCalc) => `${row.panelWattage}W` },
    { key: "totalPanels", header: "Panels", render: (row: CostingCalc) => row.totalPanels.toLocaleString() },
    { key: "landedCostPerWatt", header: "PKR/Watt", render: (row: CostingCalc) => `Rs ${row.landedCostPerWatt.toFixed(2)}` },
    { key: "landedCostPerPanel", header: "PKR/Panel", render: (row: CostingCalc) => formatCurrency(row.landedCostPerPanel) },
    { key: "impTotalCost", header: "Import Total", render: (row: CostingCalc) => row.impTotalCost ? formatCurrency(row.impTotalCost) : <span className="text-gray-400">—</span> },
    { key: "totalShipmentValue", header: "Calc Value", render: (row: CostingCalc) => formatCurrency(row.totalShipmentValue) },
    { key: "createdAt", header: "Date", render: (row: CostingCalc) => formatDate(row.createdAt) },
  ]

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <Header title="Costing Calculator" breadcrumbs={[{ label: "Costing Calculator" }]} />

      {/* ── Step 01: CIF Calculation ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Step 01 — CIF & Landed Cost Inputs">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="FOB per Watt (USD)" type="number" step="0.001" value={fobPerWatt} onChange={(e) => setFobPerWatt(e.target.value)} placeholder="e.g. 0.095" />
              <Input label="Freight per Watt (USD)" type="number" step="0.001" value={freightPerWatt} onChange={(e) => setFreightPerWatt(e.target.value)} placeholder="e.g. 0.01" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Select label="Exchange Rate" value={selectedRateId} onChange={(e) => { setSelectedRateId(e.target.value); setCustomExRate("") }}>
                <option value="">Select rate...</option>
                {rates?.map((r) => <option key={r.id} value={r.id}>{r.source} - Rs {r.rate}</option>)}
              </Select>
              <Input label="Custom Rate Override" type="number" step="0.01" value={customExRate} onChange={(e) => setCustomExRate(e.target.value)} placeholder="Leave blank to use above" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tax Mode</label>
              <div className="flex gap-3">
                {(["config", "simple"] as const).map((mode) => (
                  <label key={mode} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value={mode} checked={taxMode === mode} onChange={() => setTaxMode(mode)} className="text-blue-600" />
                    <span className="text-sm">{mode === "config" ? "Use Tax Config" : "Simple Rate"}</span>
                  </label>
                ))}
              </div>
            </div>

            {taxMode === "config" ? (
              <Select label="Tax Configuration" value={selectedTaxId} onChange={(e) => setSelectedTaxId(e.target.value)}>
                <option value="">Select config...</option>
                {taxConfigs?.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (Default)" : ""}</option>)}
              </Select>
            ) : (
              <Input label="Tax Rate (% of invoice value)" type="number" step="0.1" value={simpleTaxRate} onChange={(e) => setSimpleTaxRate(e.target.value)} />
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input label="Panel Wattage (W)" type="number" value={panelWattage} onChange={(e) => setPanelWattage(e.target.value)} placeholder="e.g. 585" />
              <Input label="Total Panels" type="number" value={totalPanels} onChange={(e) => setTotalPanels(e.target.value)} placeholder="e.g. 3600" />
            </div>

            <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." />

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={() => handleSave("DRAFT")} loading={saving}>Save as Draft</Button>
              <Button variant="primary" onClick={() => handleSave("FINALIZED")} loading={saving}>Finalize</Button>
            </div>
          </div>
        </Card>

        <Card title="Step 01 — Calculation Results">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "FOB per Watt", value: fob > 0 ? `$${fob.toFixed(4)}` : "—" },
                { label: "Freight per Watt", value: freight > 0 ? `$${freight.toFixed(4)}` : "—" },
                { label: "CIF per Watt (USD)", value: cifUsd > 0 ? `$${cifUsd.toFixed(4)}` : "—" },
                { label: "Exchange Rate", value: exRate > 0 ? `Rs ${exRate}` : "—" },
                { label: "CIF per Watt (PKR)", value: cifPkr > 0 ? `Rs ${cifPkr.toFixed(2)}` : "—" },
                { label: "Tax Rate (% of value)", value: taxRate > 0 ? `${taxRate.toFixed(2)}%` : "—" },
                { label: "Tax per Watt", value: taxPerWatt > 0 ? `Rs ${taxPerWatt.toFixed(2)}` : "—" },
                { label: "Handling per Watt", value: `Rs ${handlingPW.toFixed(2)}` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="font-semibold text-gray-900">{value}</p>
                </div>
              ))}
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <span className="font-medium text-blue-900">Landed Cost / Watt</span>
                <span className="font-bold text-blue-900 text-lg">{landedCostPerWatt > 0 ? `Rs ${landedCostPerWatt.toFixed(2)}` : "—"}</span>
              </div>
              {wattage > 0 && (
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <span className="font-medium text-blue-900">Landed Cost / Panel ({wattage}W)</span>
                  <span className="font-bold text-blue-900 text-lg">{landedCostPerPanel > 0 ? formatCurrency(landedCostPerPanel) : "—"}</span>
                </div>
              )}
              {panels > 0 && (
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                  <span className="font-medium text-green-900">Total Shipment Value ({panels.toLocaleString()} panels)</span>
                  <span className="font-bold text-green-900 text-xl">{totalShipmentValue > 0 ? formatCurrency(totalShipmentValue) : "—"}</span>
                </div>
              )}
            </div>

            {taxMode === "config" && selectedTaxId && (() => {
              const tc = taxConfigs?.find((t) => t.id === selectedTaxId)
              if (!tc) return null
              return (
                <div className="border-t pt-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">Tax Breakdown (% of invoice value)</p>
                  <div className="space-y-1 text-sm">
                    {[
                      { label: "Customs Duty", value: tc.customsDuty },
                      { label: "Additional CD", value: tc.additionalCD },
                      { label: "Excise", value: tc.excise },
                      { label: "Sales Tax", value: tc.salesTax },
                      { label: "Additional ST", value: tc.additionalST },
                      { label: "Income Tax", value: tc.incomeTax },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between text-gray-600">
                        <span>{label}</span><span>{value}%</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-medium text-gray-900 border-t pt-1 mt-1">
                      <span>Total Tax</span><span>{taxRate.toFixed(2)}%</span>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </Card>
      </div>

      {/* ── Step 02: Import Cost Breakdown ── */}
      <Card title="Step 02 — Import Cost Breakdown">
        <p className="text-sm text-gray-500 mb-4">
          Enter the actual PKR amounts for each expense category.
          {totalWatts > 0 && <span className="ml-1">Avg/W is calculated on <strong>{totalWatts.toLocaleString()} W</strong> ({panels.toLocaleString()} panels × {wattage}W).</span>}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-4 text-gray-500 font-medium w-64">Expense</th>
                <th className="text-right py-2 px-4 text-gray-500 font-medium w-44">PKR Amount</th>
                <th className="text-right py-2 pl-4 text-gray-500 font-medium w-24">Avg/W</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {impFields.map(({ key, label }) => {
                const pkrVal = parseFloat(impForm[key]) || 0
                const avgW = totalWatts > 0 && pkrVal > 0 ? pkrVal / totalWatts : null
                return (
                  <tr key={key} className="hover:bg-gray-50">
                    <td className="py-2 pr-4 text-gray-700">{label}</td>
                    <td className="py-2 px-4">
                      <input
                        type="number"
                        step="0.01"
                        value={impForm[key]}
                        onChange={(e) => setImpForm((prev) => ({ ...prev, [key]: e.target.value }))}
                        placeholder="0"
                        aria-label={label}
                        className="w-full text-right rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="py-2 pl-4 text-right font-medium text-gray-700">
                      {avgW !== null ? avgW.toFixed(2) : "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-blue-50">
                <td className="py-3 pr-4 font-bold text-blue-900">Total Landed Cost (Import)</td>
                <td className="py-3 px-4 text-right font-bold text-blue-900 text-base">{impTotal > 0 ? formatCurrency(impTotal) : "—"}</td>
                <td className="py-3 pl-4 text-right font-bold text-blue-900">{avgPerWatt !== null ? avgPerWatt.toFixed(2) : "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {impTotal > 0 && panels > 0 && (
          <div className="mt-4 p-3 bg-green-50 rounded-lg text-sm text-green-800 flex justify-between">
            <span>Import Cost per Panel ({wattage}W)</span>
            <span className="font-bold">{formatCurrency(impTotal / panels)}</span>
          </div>
        )}
      </Card>

      {/* ── Past Costings ── */}
      <Card title="Past Costing Calculations">
        <Table columns={columns} data={costings || []} emptyMessage="No costing calculations yet" />
      </Card>
    </div>
  )
}
