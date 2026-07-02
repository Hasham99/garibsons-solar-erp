"use client"

import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { StatCard } from "@/components/ui/Card"
import { Table, Column } from "@/components/ui/Table"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { formatCurrency, formatDate } from "@/lib/utils"
import { TrendingUp, Banknote, Wallet } from "lucide-react"

interface LedgerRow {
  id: string
  date: string
  type: "OPENING" | "SO" | "DO" | "PARTIAL" | "RECEIPT"
  reference: string
  description: string
  debit: number
  credit: number
  runningBalance: number
}
interface LedgerResp {
  rows: LedgerRow[]
  totalDebits: number
  totalCredits: number
  balance: number
  opening: { amount: number; direction: "RECEIVABLE" | "ADVANCE"; date: string } | null
}

export default function PortalLedgerPage() {
  const { data, loading } = useFetch<LedgerResp>("/api/portal/ledger")
  const rows = (data?.rows || []).slice().reverse()
  // Show opening separately from the pure billed/paid totals (matches staff views).
  const openingDebit = data?.opening?.direction === "RECEIVABLE" ? data.opening.amount : 0
  const openingCredit = data?.opening?.direction === "ADVANCE" ? data.opening.amount : 0

  const columns: Column<LedgerRow>[] = [
    {
      key: "date",
      header: "Date",
      sortable: true,
      value: (r) => r.date,
      render: (r) => <span className="whitespace-nowrap">{formatDate(r.date)}</span>,
    },
    {
      key: "reference",
      header: "Reference",
      sortable: true,
      render: (r) => (
        <div className="min-w-0">
          <div className="font-medium text-foreground">{r.reference}</div>
          <div className="truncate text-xs text-tertiary">{r.description}</div>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      numeric: true,
      value: (r) => r.credit > 0 ? r.credit : r.debit,
      render: (r) => (
        <span className={r.credit > 0 ? "text-emerald-600" : "text-foreground"}>
          {r.credit > 0 ? `+${formatCurrency(r.credit)}` : formatCurrency(r.debit)}
        </span>
      ),
    },
    {
      key: "runningBalance",
      header: "Balance",
      numeric: true,
      value: (r) => r.runningBalance,
      render: (r) => formatCurrency(r.runningBalance),
    },
  ]

  return (
    <div className="space-y-5 animate-fade-in-up">
      <Header title="Ledger" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard title="Billed" value={data ? formatCurrency(data.totalDebits - openingDebit) : "…"} icon={<TrendingUp size={18} />} color="blue" />
        <StatCard title="Paid" value={data ? formatCurrency(data.totalCredits - openingCredit) : "…"} icon={<Banknote size={18} />} color="emerald" />
        <StatCard title="Balance" value={data ? formatCurrency(data.balance) : "…"} icon={<Wallet size={18} />} color="amber" />
      </div>

      {loading ? (
        <TableSkeleton />
      ) : (
        <Table
          columns={columns}
          data={rows}
          searchPlaceholder="Search reference or description…"
          searchKeys={["description"]}
          filters={[
            {
              key: "type",
              label: "Type",
              value: (r) => r.type,
              options: [
                { value: "OPENING", label: "Opening Balance" },
                { value: "SO", label: "Sales Order" },
                { value: "DO", label: "Delivery" },
                { value: "PARTIAL", label: "Partial Lift" },
                { value: "RECEIPT", label: "Payment" },
              ],
            },
            { key: "date", label: "Date", type: "date", value: (r) => r.date },
          ]}
          emptyMessage="No ledger entries yet."
        />
      )}
    </div>
  )
}
