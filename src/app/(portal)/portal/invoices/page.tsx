"use client"

import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Table, Column } from "@/components/ui/Table"
import { Badge } from "@/components/ui/Badge"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { formatCurrency, formatDate } from "@/lib/utils"

interface Invoice {
  id: string
  invoiceNumber: string
  status: string
  grandTotal: number
  createdAt: string
  salesOrder: { soNumber: string }
}

export default function PortalInvoicesPage() {
  const { data, loading } = useFetch<Invoice[]>("/api/portal/invoices")

  const columns: Column<Invoice>[] = [
    { key: "invoiceNumber", header: "Invoice #", sortable: true },
    { key: "soNumber", header: "Order #", value: (r) => r.salesOrder.soNumber, render: (r) => r.salesOrder.soNumber },
    { key: "createdAt", header: "Date", sortable: true, value: (r) => r.createdAt, render: (r) => <span className="whitespace-nowrap">{formatDate(r.createdAt)}</span> },
    { key: "status", header: "Status", value: (r) => r.status, render: (r) => <Badge status={r.status} /> },
    { key: "grandTotal", header: "Total", numeric: true, value: (r) => r.grandTotal, render: (r) => formatCurrency(r.grandTotal) },
  ]

  return (
    <div className="space-y-5 animate-fade-in-up">
      <Header title="Invoices" />
      {loading ? (
        <TableSkeleton />
      ) : (
        <Table
          columns={columns}
          data={data || []}
          searchPlaceholder="Search invoice # or order #…"
          filters={[
            { key: "status", label: "Status", value: (r) => r.status },
            { key: "date", label: "Date", type: "date", value: (r) => r.createdAt },
          ]}
          emptyMessage="No invoices yet."
          defaultSortKey="createdAt"
          defaultSortDir="desc"
        />
      )}
    </div>
  )
}
