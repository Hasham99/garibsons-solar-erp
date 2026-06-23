"use client"

import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Table, Column } from "@/components/ui/Table"
import { Badge } from "@/components/ui/Badge"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { formatDate } from "@/lib/utils"

interface Delivery {
  id: string
  doNumber: string
  status: string
  quantity: number
  createdAt: string
  salesOrder: { soNumber: string }
}

export default function PortalDeliveriesPage() {
  const { data, loading } = useFetch<Delivery[]>("/api/portal/deliveries")

  const columns: Column<Delivery>[] = [
    { key: "doNumber", header: "DO #", sortable: true },
    { key: "soNumber", header: "Order #", value: (r) => r.salesOrder.soNumber, render: (r) => r.salesOrder.soNumber },
    { key: "createdAt", header: "Date", sortable: true, value: (r) => r.createdAt, render: (r) => <span className="whitespace-nowrap">{formatDate(r.createdAt)}</span> },
    { key: "status", header: "Status", value: (r) => r.status, render: (r) => <Badge status={r.status} /> },
    { key: "quantity", header: "Qty", numeric: true, value: (r) => r.quantity, render: (r) => `${r.quantity} pcs` },
  ]

  return (
    <div className="space-y-5 animate-fade-in-up">
      <Header title="Deliveries" />
      {loading ? (
        <TableSkeleton />
      ) : (
        <Table
          columns={columns}
          data={data || []}
          searchPlaceholder="Search DO # or order #…"
          filters={[
            { key: "status", label: "Status", value: (r) => r.status },
            { key: "date", label: "Date", type: "date", value: (r) => r.createdAt },
          ]}
          emptyMessage="No deliveries yet."
          defaultSortKey="createdAt"
          defaultSortDir="desc"
        />
      )}
    </div>
  )
}
