"use client"

import { useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Select } from "@/components/ui/Select"
import { Card } from "@/components/ui/Card"
import { LoadingPage } from "@/components/ui/Spinner"
import { formatCurrency, formatDate } from "@/lib/utils"

interface LedgerEntry {
  id: string
  date: string
  description: string
  debit: number
  credit: number
  runningBalance: number
  invoice: { invoiceNumber: string } | null
  salesOrder: { soNumber: string } | null
}

interface Customer {
  id: string
  name: string
}

export default function LedgerPage() {
  const [customerId, setCustomerId] = useState("")
  const { data: customers } = useFetch<Customer[]>("/api/customers")
  const { data: ledger, loading } = useFetch<LedgerEntry[]>(
    customerId ? `/api/ledger?customerId=${customerId}` : "/api/ledger",
    [customerId]
  )

  const totalDebit = ledger?.reduce((s, e) => s + e.debit, 0) || 0
  const totalCredit = ledger?.reduce((s, e) => s + e.credit, 0) || 0
  const netBalance = totalDebit - totalCredit

  // Aging calculation
  const now = new Date()
  const aging = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, over90: 0 }
  ledger?.forEach((entry) => {
    if (entry.debit > entry.credit) {
      const days = Math.floor((now.getTime() - new Date(entry.date).getTime()) / (1000 * 60 * 60 * 24))
      const outstanding = entry.debit - entry.credit
      if (days <= 0) aging.current += outstanding
      else if (days <= 30) aging["1-30"] += outstanding
      else if (days <= 60) aging["31-60"] += outstanding
      else if (days <= 90) aging["61-90"] += outstanding
      else aging.over90 += outstanding
    }
  })

  return (
    <div className="space-y-6">
      <Header title="Party Ledger" />

      <Card>
        <div className="flex items-end gap-4">
          <div className="w-72">
            <Select
              label="Select Customer"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">All Customers</option>
              {customers?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Total Debit</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(totalDebit)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Total Credit</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalCredit)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Net Balance (Receivable)</p>
          <p className={`text-2xl font-bold mt-1 ${netBalance > 0 ? "text-orange-600" : "text-green-600"}`}>
            {formatCurrency(Math.abs(netBalance))}
          </p>
        </div>
      </div>

      {/* Aging Summary */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Receivables Aging Summary</h3>
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: "Current", value: aging.current, color: "green" },
            { label: "1-30 days", value: aging["1-30"], color: "yellow" },
            { label: "31-60 days", value: aging["31-60"], color: "orange" },
            { label: "61-90 days", value: aging["61-90"], color: "red" },
            { label: "Over 90 days", value: aging.over90, color: "red" },
          ].map(({ label, value, color }) => (
            <div key={label} className={`p-3 rounded-lg bg-${color}-50 border border-${color}-100`}>
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`font-bold text-${color}-700 mt-1`}>{formatCurrency(value)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Ledger Entries</h3>
        </div>
        {loading ? (
          <LoadingPage />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {["Date", "Description", "Reference", "Debit", "Credit", "Balance"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {ledger && ledger.length > 0 ? ledger.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">{formatDate(entry.date)}</td>
                    <td className="px-4 py-3 text-sm">{entry.description}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {entry.invoice?.invoiceNumber || entry.salesOrder?.soNumber || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-red-600 font-medium">
                      {entry.debit > 0 ? formatCurrency(entry.debit) : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-green-600 font-medium">
                      {entry.credit > 0 ? formatCurrency(entry.credit) : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold">
                      {formatCurrency(entry.runningBalance)}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                      No ledger entries found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
