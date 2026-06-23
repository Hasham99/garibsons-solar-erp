"use client"

import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Table, Column } from "@/components/ui/Table"
import { Badge } from "@/components/ui/Badge"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { formatCurrency, formatDate } from "@/lib/utils"

interface Order {
  id: string
  soNumber: string
  status: string
  grandTotal: number
  createdAt: string
}

export default function PortalOrdersPage() {
  const { data, loading } = useFetch<Order[]>("/api/portal/orders")

  const columns: Column<Order>[] = [
    { key: "soNumber", header: "Order #", sortable: true },
    { key: "createdAt", header: "Date", sortable: true, value: (r) => r.createdAt, render: (r) => <span className="whitespace-nowrap">{formatDate(r.createdAt)}</span> },
    { key: "status", header: "Status", value: (r) => r.status, render: (r) => <Badge status={r.status} /> },
    { key: "grandTotal", header: "Total", numeric: true, value: (r) => r.grandTotal, render: (r) => formatCurrency(r.grandTotal) },
  ]

  return (
    <div className="space-y-5 animate-fade-in-up">
      <Header title="Sales Orders" />
      {loading ? (
        <TableSkeleton />
      ) : (
        <Table
          columns={columns}
          data={data || []}
          searchPlaceholder="Search order #…"
          filters={[
            { key: "status", label: "Status", value: (r) => r.status },
            { key: "date", label: "Date", type: "date", value: (r) => r.createdAt },
          ]}
          emptyMessage="No orders yet."
          defaultSortKey="createdAt"
          defaultSortDir="desc"
        />
      )}
    </div>
  )
}
