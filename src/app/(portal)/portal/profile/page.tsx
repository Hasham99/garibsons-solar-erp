"use client"

import { useState } from "react"
import { usePortalAuth } from "@/components/portal/PortalAuthProvider"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { TOPBAR_SURFACE } from "@/lib/surfaces"
import { formatCurrency } from "@/lib/utils"
import { Building2, Mail, Check, X, KeyRound, Lock, Pencil, Wallet, TrendingUp, Banknote } from "lucide-react"
import toast from "react-hot-toast"

interface Summary { totalSales: number; totalCollected: number; outstanding: number }

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")
}

export default function PortalProfilePage() {
  const { user, customer, loading } = usePortalAuth()
  const { data: summary } = useFetch<Summary>("/api/portal/summary")
  const [current, setCurrent] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [saving, setSaving] = useState(false)

  const passwordTooShort = password.length > 0 && password.length < 6
  const passwordMismatch = password.length > 0 && confirm.length > 0 && password !== confirm
  const canSave = Boolean(current) && password.length >= 6 && password === confirm

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const res = await fetch("/api/portal/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: password }),
      })
      if (res.ok) {
        toast.success("Password changed")
        setCurrent("")
        setPassword("")
        setConfirm("")
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to change password")
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading || !user) return <TableSkeleton columns={2} rows={6} />

  const outstanding = summary?.outstanding ?? 0

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in-up">
      <Header title="My Profile" />

      {/* Identity banner */}
      <div className="relative overflow-hidden rounded-2xl border border-line shadow-card">
        <div className="px-6 py-7 sm:px-8" style={TOPBAR_SURFACE}>
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-lg ring-1 ring-white/15" style={{ backgroundColor: "#2563eb", backgroundImage: "linear-gradient(135deg,#3b82f6,#4f46e5)" }}>
              {initials(user.name)}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold text-white">{user.name}</h2>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-slate-300"><Mail size={13} className="shrink-0" />{user.email}</p>
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-blue-400/15 px-2.5 py-0.5 text-xs font-medium text-blue-100 ring-1 ring-inset ring-blue-300/25">
                <Building2 size={12} />{customer?.name}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        {/* Account details + password */}
        <div className="space-y-5 rounded-2xl border border-line bg-surface p-6 shadow-card lg:col-span-2">
          <div className="flex items-center gap-2">
            <Pencil size={15} className="text-tertiary" />
            <h2 className="text-sm font-semibold text-foreground">Account Details</h2>
          </div>

          <div>
            <label className="mb-1 block text-[13px] font-medium text-secondary">Customer</label>
            <Input value={customer?.name || ""} disabled readOnly className="bg-muted text-secondary" />
          </div>

          <div>
            <label className="mb-1 block text-[13px] font-medium text-secondary">Email</label>
            <div className="relative">
              <Input value={user.email} disabled readOnly className="bg-muted pr-9 text-secondary" />
              <Lock size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-tertiary" />
            </div>
            <p className="mt-1.5 text-[12px] text-tertiary">Contact Garibsons Solar to change your email.</p>
          </div>

          {/* Change password */}
          <div className="space-y-4 rounded-xl border border-line bg-muted p-4">
            <div className="flex items-center gap-2">
              <KeyRound size={14} className="text-tertiary" />
              <p className="text-[12px] font-semibold uppercase tracking-wide text-secondary">Change Password</p>
            </div>
            <Input label="Current Password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Enter current password" />
            <Input label="New Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" error={passwordTooShort ? "Use at least 6 characters" : undefined} />
            <div>
              <Input label="Confirm New Password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter new password" disabled={!password} />
              {password && confirm && (
                <p className={`mt-1.5 flex items-center gap-1 text-[12px] ${passwordMismatch ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {passwordMismatch ? <X size={12} /> : <Check size={12} />}
                  {passwordMismatch ? "Passwords don't match" : "Passwords match"}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Button onClick={handleSave} loading={saving} disabled={!canSave}>Change Password</Button>
          </div>
        </div>

        {/* Account overview */}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card lg:col-span-3">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet size={15} className="text-tertiary" />
              <h2 className="text-sm font-semibold text-foreground">Account Overview</h2>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/15 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25">
              <Building2 size={12} />{customer?.name}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <OverviewStat
              label={outstanding > 0 ? "Outstanding" : "Advance / Credit"}
              value={summary ? formatCurrency(Math.abs(outstanding)) : "…"}
              icon={<Wallet size={16} />}
              tone={outstanding > 0 ? "amber" : "emerald"}
            />
            <OverviewStat label="Total Billed" value={summary ? formatCurrency(summary.totalSales) : "…"} icon={<TrendingUp size={16} />} tone="blue" />
            <OverviewStat label="Total Paid" value={summary ? formatCurrency(summary.totalCollected) : "…"} icon={<Banknote size={16} />} tone="emerald" />
          </div>

          <p className="mt-5 rounded-lg border border-dashed border-line bg-muted px-4 py-3 text-[13px] text-secondary">
            Balances reflect your latest orders, deliveries and verified payments. Upload a payment slip and we&rsquo;ll update your ledger once it&rsquo;s reviewed.
          </p>
        </div>
      </div>
    </div>
  )
}

const TONES: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/20",
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20",
  amber: "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20",
}

function OverviewStat({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: keyof typeof TONES }) {
  return (
    <div className="rounded-xl border border-line bg-muted/60 p-4">
      <span className={`inline-flex rounded-lg p-2 ring-1 ring-inset ${TONES[tone]}`}>{icon}</span>
      <p className="mt-3 text-[12px] font-medium text-secondary">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums tracking-tight text-foreground">{value}</p>
    </div>
  )
}
