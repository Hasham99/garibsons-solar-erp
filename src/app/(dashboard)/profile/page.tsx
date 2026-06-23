"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuth, accessOf } from "@/hooks/useAuth"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { can, modulesBySection, SECTIONS, type Access } from "@/lib/permissions/modules"
import { TOPBAR_SURFACE } from "@/lib/surfaces"
import { ShieldCheck, Lock, Check, X, Mail, Pencil, KeyRound } from "lucide-react"
import toast from "react-hot-toast"

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
}

export default function ProfilePage() {
  const { user, loading } = useAuth()
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user) setName(user.name)
  }, [user])

  const nameChanged = Boolean(user && name.trim() && name.trim() !== user.name)
  const passwordTooShort = password.length > 0 && password.length < 6
  const passwordMismatch = password.length > 0 && confirm.length > 0 && password !== confirm
  const dirty = nameChanged || password.length > 0
  const canSave = dirty && !passwordTooShort && !passwordMismatch && (!password || password === confirm)

  const handleSave = async () => {
    if (!user || !canSave) return
    setSaving(true)
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), password: password || undefined }),
      })
      if (res.ok) {
        toast.success("Profile updated")
        setPassword("")
        setConfirm("")
        // Reload so the new name reflects in the persistent sidebar / top bar.
        setTimeout(() => window.location.reload(), 700)
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to update profile")
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading || !user) return <TableSkeleton columns={2} rows={6} />

  const access = accessOf(user)

  return (
    <div className="mx-auto space-y-6 animate-fade-in-up max-w-5xl">
      <Header title="My Profile" breadcrumbs={[{ label: "Profile" }]} />

      {/* Identity banner */}
      <div className="relative overflow-hidden rounded-2xl border border-line shadow-card">
        <div className="px-6 py-7 sm:px-8" style={TOPBAR_SURFACE}>
          <div className="flex items-center gap-4">
            <span
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-lg ring-1 ring-white/15"
              style={{ backgroundColor: "#2563eb", backgroundImage: "linear-gradient(135deg,#3b82f6,#4f46e5)" }}
            >
              {initials(user.name)}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold text-white">{user.name}</h2>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-slate-300">
                <Mail size={13} className="shrink-0" />
                {user.email}
              </p>
              <span
                className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                  user.fullAccess
                    ? "bg-emerald-400/15 text-emerald-200 ring-emerald-300/25"
                    : "bg-blue-400/15 text-blue-100 ring-blue-300/25"
                }`}
              >
                <ShieldCheck size={12} />
                {user.fullAccess ? "Full Access" : user.role}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Account details */}
        <div className="lg:col-span-2 bg-surface rounded-2xl shadow-card border border-line p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Pencil size={15} className="text-tertiary" />
            <h2 className="text-sm font-semibold text-foreground">Account Details</h2>
          </div>

          <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />

          <div>
            <label className="block text-[13px] font-medium text-secondary mb-1">Email</label>
            <div className="relative">
              <Input
                value={user.email}
                disabled
                readOnly
                className="bg-muted text-secondary cursor-not-allowed pr-9"
              />
              <Lock size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-tertiary" />
            </div>
            <p className="mt-1.5 text-[12px] text-tertiary">
              Email can&apos;t be changed here — ask an admin to update it for you.
            </p>
          </div>

          {/* Password */}
          <div className="rounded-xl border border-line bg-muted p-4 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound size={14} className="text-tertiary" />
              <p className="text-[12px] font-semibold uppercase tracking-wide text-secondary">Change Password</p>
            </div>
            <Input
              label="New Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to keep current"
              error={passwordTooShort ? "Use at least 6 characters" : undefined}
            />
            <div>
              <Input
                label="Confirm New Password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter new password"
                disabled={!password}
              />
              {password && confirm && (
                <p className={`mt-1.5 flex items-center gap-1 text-[12px] ${passwordMismatch ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {passwordMismatch ? <X size={12} /> : <Check size={12} />}
                  {passwordMismatch ? "Passwords don't match" : "Passwords match"}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            {dirty && <span className="text-[12px] text-tertiary">Unsaved changes</span>}
            <Button onClick={handleSave} loading={saving} disabled={!canSave}>
              Save Changes
            </Button>
          </div>
        </div>

        {/* Permissions */}
        <div className="lg:col-span-3 bg-surface rounded-2xl shadow-card border border-line p-6">
          <PermissionsPanel access={access} fullAccess={user.fullAccess} />
        </div>
      </div>
    </div>
  )
}

function PermissionsPanel({ access, fullAccess }: { access: Access; fullAccess: boolean }) {
  const grouped = modulesBySection()

  const { sections, moduleCount, writeCount } = useMemo(() => {
    let moduleCount = 0
    let writeCount = 0
    const sections = SECTIONS.map((section) => {
      const mods = (grouped[section] || [])
        .filter((m) => can(access, m.key, "read"))
        .map((m) => {
          const write = can(access, m.key, "write")
          moduleCount++
          if (write) writeCount++
          return { ...m, write }
        })
      return { section, mods }
    }).filter((s) => s.mods.length > 0)
    return { sections, moduleCount, writeCount }
  }, [access, grouped])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={15} className="text-tertiary" />
          <h2 className="text-sm font-semibold text-foreground">My Permissions</h2>
        </div>
        {!fullAccess && moduleCount > 0 && (
          <span className="text-[12px] text-tertiary">
            {moduleCount} module{moduleCount !== 1 ? "s" : ""} · {writeCount} writable
          </span>
        )}
      </div>

      {fullAccess ? (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-4 flex items-start gap-3">
          <span className="shrink-0 rounded-full bg-emerald-100 dark:bg-emerald-500/10 p-1.5 text-emerald-600 dark:text-emerald-300">
            <Check size={15} />
          </span>
          <div>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Full Access</p>
            <p className="text-[13px] text-emerald-700 dark:text-emerald-300 mt-0.5">
              You have unrestricted access to every module and all data across the ERP.
            </p>
          </div>
        </div>
      ) : sections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-muted px-4 py-10 text-center">
          <Lock size={20} className="mx-auto text-tertiary" />
          <p className="text-sm font-medium text-secondary mt-2">No access assigned yet</p>
          <p className="text-[13px] text-tertiary mt-0.5">Ask an admin to grant the modules you need.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {sections.map(({ section, mods }) => (
            <div key={section}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-tertiary mb-2">{section}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {mods.map((m) => (
                  <div
                    key={m.key}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line bg-muted px-3 py-2"
                  >
                    <span className="truncate text-[13px] font-medium text-secondary">{m.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Read
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          m.write ? "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-tertiary"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${m.write ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                        Write
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
