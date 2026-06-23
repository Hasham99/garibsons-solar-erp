"use client"

import Link from "next/link"
import { useFetch } from "@/hooks/useFetch"
import { usePortalAuth } from "@/components/portal/PortalAuthProvider"
import { Card, StatCard } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Upload, TrendingUp, Banknote, Wallet, ArrowRight, ReceiptText, CalendarClock } from "lucide-react"

interface Summary { totalSales: number; totalCollected: number; outstanding: number }
interface LedgerRow { id: string; date: string; reference: string; description: string; debit: number; credit: number }
interface LedgerResp { rows: LedgerRow[] }
interface Slip { id: string; status: "PENDING" | "VERIFIED" | "REJECTED" | "ALREADY_RECEIVED"; claimedAmount: number | null; claimedValueDate: string | null; createdAt: string }

export default function PortalDashboard() {
  const { customer } = usePortalAuth()
  const { data: summary } = useFetch<Summary>("/api/portal/summary")
  const { data: ledger } = useFetch<LedgerResp>("/api/portal/ledger")
  const { data: slips } = useFetch<Slip[]>("/api/portal/slips")

  const recent = (ledger?.rows || []).slice(-6).reverse()
  const recentSlips = (slips || []).slice(0, 4)
  const outstanding = summary?.outstanding ?? 0

  const today = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())
  const pktHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", hour: "numeric", hour12: false }).format(new Date())) % 24
  const greeting = pktHour < 12 ? "Good morning" : pktHour < 17 ? "Good afternoon" : "Good evening"

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Hero header — deep navy gradient with soft solar glows, matching the admin dashboard. */}
      <div
        className="relative overflow-hidden rounded-2xl px-6 py-7 sm:px-8 text-white shadow-pop"
        style={{ backgroundColor: "#142447", backgroundImage: "linear-gradient(135deg, #1e2533 0%, #142447 50%, #1e3a8a 100%)" }}
      >
        <div className="pointer-events-none absolute -top-24 -right-12 h-64 w-64 rounded-full bg-blue-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/4 h-72 w-72 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-[13px] font-medium text-blue-200/90">
              <CalendarClock size={14} />
              {today}
            </p>
            <h1 className="mt-2 truncate text-2xl font-bold tracking-tight sm:text-3xl">
              {greeting}
              {customer?.name ? `, ${customer.name}` : ""}
            </h1>
            <p className="mt-1.5 text-[15px] text-slate-300/90">Here&rsquo;s a quick look at your account.</p>
          </div>
          <Link href="/portal/upload" className="shrink-0">
            <span className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-900 shadow-sm transition-all hover:-translate-y-px hover:bg-slate-100 hover:shadow-md">
              <Upload size={16} /> Upload Slip
            </span>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title={outstanding > 0 ? "Outstanding Balance" : "Advance / Credit"}
          value={summary ? formatCurrency(Math.abs(outstanding)) : "…"}
          subtitle={outstanding > 0 ? "Payable to Garibsons Solar" : "In your favour"}
          icon={<Wallet size={20} />}
          color={outstanding > 0 ? "amber" : "emerald"}
        />
        <StatCard title="Total Billed" value={summary ? formatCurrency(summary.totalSales) : "…"} icon={<TrendingUp size={20} />} color="blue" />
        <StatCard title="Total Paid" value={summary ? formatCurrency(summary.totalCollected) : "…"} icon={<Banknote size={20} />} color="emerald" />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent activity */}
        <div className="lg:col-span-2">
          <Card
            title="Recent Activity"
            subtitle="Your latest orders and payments"
            actions={<Link href="/portal/ledger" className="text-xs font-medium text-blue-600 hover:underline">View ledger</Link>}
          >
            {recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-tertiary">No activity yet.</p>
            ) : (
              <div className="divide-y divide-line">
                {recent.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{r.reference}</div>
                      <div className="truncate text-xs text-tertiary">{r.description}</div>
                      <div className="text-[11px] text-tertiary">{formatDate(r.date)}</div>
                    </div>
                    <div className={`shrink-0 text-sm font-semibold tabular-nums ${r.credit > 0 ? "text-emerald-600" : "text-foreground"}`}>
                      {r.credit > 0 ? `+${formatCurrency(r.credit)}` : formatCurrency(r.debit)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Upload CTA */}
          <Card title="">
            <div className="flex flex-col items-start gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white"><Upload size={20} /></span>
              <div>
                <div className="font-semibold text-foreground">Upload a payment slip</div>
                <div className="text-xs text-secondary">Send us your bank slip in seconds — we&apos;ll verify and update your ledger.</div>
              </div>
              <Link href="/portal/upload" className="w-full">
                <Button className="w-full">Upload Slip <ArrowRight size={15} className="ml-1.5" /></Button>
              </Link>
            </div>
          </Card>

          {/* Recent slips */}
          <Card
            title="Recent Slips"
            actions={<Link href="/portal/slips" className="text-xs font-medium text-blue-600 hover:underline">View all</Link>}
          >
            {recentSlips.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 py-6 text-center">
                <ReceiptText size={20} className="text-tertiary" />
                <p className="text-sm text-tertiary">No slips uploaded yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-line">
                {recentSlips.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{s.claimedAmount != null ? formatCurrency(s.claimedAmount) : "—"}</div>
                      <div className="text-[11px] text-tertiary">{formatDate(s.claimedValueDate || s.createdAt)}</div>
                    </div>
                    <Badge status={s.status} className={s.status === "VERIFIED" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300" : undefined} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
