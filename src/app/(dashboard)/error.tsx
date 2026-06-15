"use client"

import Link from "next/link"
import { AlertTriangle, RotateCcw, LayoutDashboard } from "lucide-react"
import { Button } from "@/components/ui/Button"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md text-center animate-fade-in-up">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-500 dark:text-rose-400 ring-1 ring-inset ring-rose-100 dark:ring-rose-500/25">
          <AlertTriangle size={26} />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-secondary">
          This page hit an unexpected error. Your data is safe — try again, or head back to the dashboard.
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-tertiary tabular-nums">Error reference: {error.digest}</p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button onClick={reset}>
            <RotateCcw size={15} className="mr-2" />
            Try again
          </Button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-secondary shadow-sm transition-colors hover:bg-muted"
          >
            <LayoutDashboard size={15} />
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
