import { Skeleton, TableSkeleton } from "@/components/ui/Skeleton"

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>
      <TableSkeleton columns={5} rows={8} />
    </div>
  )
}
