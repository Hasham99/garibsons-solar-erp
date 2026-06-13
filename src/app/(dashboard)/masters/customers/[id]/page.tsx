"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Card, StatCard } from "@/components/ui/Card"
import { Table, Column } from "@/components/ui/Table"
import { Skeleton, StatCardSkeleton, TableSkeleton } from "@/components/ui/Skeleton"
import { Stagger, StaggerItem } from "@/components/motion/Motion"
import { formatCurrency, formatAmount, formatDate } from "@/lib/utils"
import { ArrowLeft, BookOpen, Banknote, Star, TrendingUp, Wallet } from "lucide-react"

interface Contact {
  id: string
  name: string
  whatsapp: string
  isPrimary: boolean
}

interface Customer {
  id: string
  name: string
  type: string
  ntn: string | null
  strn: string | null
  address: string | null
  contactPerson: string | null
  contactPhone: string | null
  contactEmail: string | null
  creditLimit: number | null
  paymentTerms: string
  active: boolean
  contacts: Contact[]
}

interface BalanceResponse {
  totalCollected: number
  totalSOValue: number
  balance: number
}

interface LedgerRow {
  id: string
  date: string
  type: "SO" | "DO" | "PARTIAL" | "RECEIPT"
  reference: string
  description: string
  debit: number
  credit: number
  runningBalance: number
}

interface LedgerResponse {
  rows: LedgerRow[]
}

const TYPE_CHIPS: Record<string, string> = {
  SO: "bg-blue-50 text-blue-700 ring-blue-600/15",
  DO: "bg-indigo-50 text-indigo-700 ring-indigo-600/15",
  PARTIAL: "bg-amber-50 text-amber-700 ring-amber-600/20",
  RECEIPT: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-slate-50 last:border-0">
      <span className="text-[13px] text-slate-500 shrink-0">{label}</span>
      <span className="text-[13px] font-medium text-slate-800 text-right">{value || "—"}</span>
    </div>
  )
}

export default function CustomerProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const { data: customer, loading: loadingCustomer } = useFetch<Customer>(`/api/customers/${id}`)
  const { data: balance, loading: loadingBalance } = useFetch<BalanceResponse>(`/api/customers/${id}/balance`)
  const { data: ledger, loading: loadingLedger } = useFetch<LedgerResponse>(`/api/ledger?customerId=${id}`)

  const outstanding = (balance?.totalSOValue || 0) - (balance?.totalCollected || 0)
  const recent = (ledger?.rows || []).slice(-12).reverse()

  const columns: Column<LedgerRow>[] = [
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TYPE_CHIPS[r.type] || "bg-slate-50 text-slate-600 ring-slate-500/15"}`}>
          {r.type}
        </span>
      ),
    },
    { key: "reference", header: "Reference" },
    { key: "date", header: "Date", numeric: true, render: (r) => formatDate(r.date), value: (r) => r.date, sortable: true },
    { key: "description", header: "Description", className: "max-w-[280px]" },
    {
      key: "debit",
      header: "Debit (PKR)",
      numeric: true,
      className: "text-right",
      render: (r) => (r.debit ? <span className="text-slate-900">{formatAmount(r.debit)}</span> : "—"),
    },
    {
      key: "credit",
      header: "Credit (PKR)",
      numeric: true,
      className: "text-right",
      render: (r) => (r.credit ? <span className="text-emerald-600 font-medium">{formatAmount(r.credit)}</span> : "—"),
    },
    {
      key: "runningBalance",
      header: "Balance (PKR)",
      numeric: true,
      className: "text-right",
      render: (r) => formatAmount(r.runningBalance),
    },
  ]

  if (loadingCustomer) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <TableSkeleton columns={6} rows={6} />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="py-16 text-center">
        <p className="text-slate-500">Customer not found.</p>
        <Link href="/masters/customers" className="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-800">
          ← Back to customers
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <Header
        title={customer.name}
        actions={
          <>
            <Button variant="ghost" onClick={() => router.push("/masters/customers")}>
              <ArrowLeft size={15} className="mr-2" />
              All Customers
            </Button>
            <Button variant="secondary" onClick={() => router.push(`/masters/customers/${id}/receipts`)}>
              <Banknote size={15} className="mr-2" />
              Receipts
            </Button>
            <Button onClick={() => router.push(`/ledger?customerId=${id}`)}>
              <BookOpen size={15} className="mr-2" />
              Full Ledger
            </Button>
          </>
        }
      />

      {/* Financial snapshot */}
      <Stagger className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StaggerItem className="h-full">
          <StatCard
            title="Total Sales"
            value={loadingBalance ? "…" : formatCurrency(balance?.totalSOValue || 0)}
            icon={<TrendingUp size={20} />}
            color="blue"
          />
        </StaggerItem>
        <StaggerItem className="h-full">
          <StatCard
            title="Total Collected"
            value={loadingBalance ? "…" : formatCurrency(balance?.totalCollected || 0)}
            icon={<Banknote size={20} />}
            color="emerald"
          />
        </StaggerItem>
        <StaggerItem className="h-full">
          <StatCard
            title="Outstanding"
            value={loadingBalance ? "…" : formatCurrency(outstanding)}
            subtitle={outstanding > 0 ? "Receivable from customer" : "Fully settled"}
            icon={<Wallet size={20} />}
            color={outstanding > 0 ? "rose" : "green"}
          />
        </StaggerItem>
      </Stagger>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Details */}
        <Card title="Details" subtitle={customer.active ? "Active customer" : "Inactive"}>
          <div className="-my-2">
            <DetailRow label="Type" value={customer.type.replace(/_/g, " ")} />
            <DetailRow label="Contact person" value={customer.contactPerson} />
            <DetailRow label="Phone" value={customer.contactPhone} />
            <DetailRow label="Email" value={customer.contactEmail} />
            <DetailRow label="Address" value={customer.address} />
            <DetailRow label="NTN" value={customer.ntn} />
            <DetailRow label="STRN" value={customer.strn} />
            <DetailRow label="Payment terms" value={customer.paymentTerms.replace(/_/g, " ")} />
            <DetailRow label="Credit limit" value={customer.creditLimit ? formatCurrency(customer.creditLimit) : null} />
          </div>
          {customer.contacts.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Contacts</p>
              <div className="space-y-1.5">
                {customer.contacts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                      {c.isPrimary && <Star size={11} className="fill-amber-400 text-amber-400" />}
                      {c.name}
                    </span>
                    <span className="text-slate-500 tabular-nums">{c.whatsapp}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Recent activity */}
        <Card
          title="Recent Activity"
          subtitle="Latest orders, deliveries and collections"
          className="lg:col-span-2"
        >
          {loadingLedger ? (
            <TableSkeleton columns={6} rows={5} />
          ) : (
            <div className="-m-6">
              <Table
                columns={columns}
                data={recent}
                searchable={false}
                pageSize={12}
                pageSizeOptions={[]}
                emptyMessage="No activity for this customer yet"
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
