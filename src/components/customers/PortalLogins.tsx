"use client"

import { useState, useEffect, useImperativeHandle, forwardRef } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Modal } from "@/components/ui/Modal"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { formatDate } from "@/lib/utils"
import { Pencil, Send, Trash2, Copy, Sparkles, Share2, MessageCircle } from "lucide-react"
import toast from "react-hot-toast"

export interface PortalLoginsHandle {
  openAdd: () => void
}

interface PortalUser {
  id: string
  name: string
  email: string
  active: boolean
  lastLoginAt: string | null
  createdAt: string
}

function portalLoginUrl() {
  return typeof window !== "undefined" ? `${window.location.origin}/portal/login` : "/portal/login"
}

function credentialsMessage(email: string, password: string) {
  return `Garibsons Solar — Customer Portal\n\nLog in here: ${portalLoginUrl()}\nEmail: ${email}\nPassword: ${password}\n\nKeep these details safe.`
}

function inviteMessage(email: string) {
  return `Garibsons Solar — Customer Portal\n\nLog in here: ${portalLoginUrl()}\nYour email: ${email}`
}

function copyText(text: string) {
  if (!text) return
  navigator.clipboard?.writeText(text)
  toast.success("Copied")
}

function shareOrCopy(text: string) {
  if (typeof navigator !== "undefined" && navigator.share) navigator.share({ text }).catch(() => {})
  else copyText(text)
}

function whatsappShare(text: string) {
  if (typeof window !== "undefined") window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank")
}

/** Generate a strong password: guaranteed mix of cases, a digit and a symbol. */
function suggestPassword() {
  const lower = "abcdefghijkmnpqrstuvwxyz"
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
  const digit = "23456789"
  const sym = "!@#$%&*?"
  const all = lower + upper + digit + sym
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)]
  let pw = pick(lower) + pick(upper) + pick(digit) + pick(sym)
  for (let i = 0; i < 10; i++) pw += pick(all)
  return pw.split("").sort(() => Math.random() - 0.5).join("")
}

function passwordStrength(pw: string) {
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++
  if (/\d/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  const score = Math.min(s, 4)
  const meta = [
    { label: "Very weak", bar: "bg-rose-500", text: "text-rose-600" },
    { label: "Weak", bar: "bg-rose-500", text: "text-rose-600" },
    { label: "Fair", bar: "bg-amber-500", text: "text-amber-600" },
    { label: "Good", bar: "bg-blue-500", text: "text-blue-600" },
    { label: "Strong", bar: "bg-emerald-500", text: "text-emerald-600" },
  ][score]
  return { score, pct: pw ? ((score + 1) / 5) * 100 : 0, ...meta }
}

function PasswordControls({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const st = passwordStrength(value)
  return (
    <div>
      <Input label={label} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Type a password or suggest a strong one" autoComplete="new-password" />
      {value && (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full transition-all duration-300 ${st.bar}`} style={{ width: `${st.pct}%` }} />
          </div>
          <div className={`mt-1 text-xs font-medium ${st.text}`}>{st.label} password</div>
        </div>
      )}
      <div className="mt-2 flex gap-4">
        <button type="button" onClick={() => onChange(suggestPassword())} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
          <Sparkles size={13} /> Suggest strong password
        </button>
        {value && (
          <button type="button" onClick={() => copyText(value)} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
            <Copy size={12} /> Copy
          </button>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-400"}`} />
      {active ? "Active" : "Disabled"}
    </span>
  )
}

export const PortalLogins = forwardRef<
  PortalLoginsHandle,
  { customerId: string; customerName: string; canWrite: boolean; onCountChange?: (n: number) => void }
>(function PortalLogins({ customerId, customerName, canWrite, onCountChange }, ref) {
  const { data: users, loading, refetch } = useFetch<PortalUser[]>(`/api/customers/${customerId}/portal-users`)

  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ email: "", password: "" })
  const [editFor, setEditFor] = useState<PortalUser | null>(null)
  const [editForm, setEditForm] = useState({ email: "", password: "", active: true })
  const [inviteFor, setInviteFor] = useState<PortalUser | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PortalUser | null>(null)
  const [shareCreds, setShareCreds] = useState<{ email: string; password: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (users) onCountChange?.(users.length)
  }, [users, onCountChange])

  const openAdd = () => {
    if (users && users.length > 0) {
      toast.error("This customer already has a login. Edit or delete it to replace.")
      return
    }
    setAddForm({ email: "", password: "" })
    setShowAdd(true)
  }
  useImperativeHandle(ref, () => ({ openAdd }))

  const openEdit = (u: PortalUser) => {
    setEditForm({ email: u.email, password: "", active: u.active })
    setEditFor(u)
  }

  const handleAdd = async () => {
    if (!addForm.email || !addForm.password) return toast.error("Email and password are required")
    setSaving(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/portal-users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: customerName, email: addForm.email, password: addForm.password }),
      })
      if (res.ok) {
        toast.success("Portal login created")
        setShowAdd(false)
        setShareCreds({ email: addForm.email, password: addForm.password })
        refetch()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to create login")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!editFor) return
    if (!editForm.email) return toast.error("Email is required")
    setSaving(true)
    try {
      const body: { email: string; active: boolean; password?: string } = { email: editForm.email, active: editForm.active }
      if (editForm.password) body.password = editForm.password
      const res = await fetch(`/api/customers/${customerId}/portal-users/${editFor.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        toast.success("Login updated")
        const sharePw = editForm.password
        const email = editForm.email
        setEditFor(null)
        refetch()
        if (sharePw) setShareCreds({ email, password: sharePw })
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to update login")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setBusy(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/portal-users/${deleteTarget.id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Login deleted")
        setDeleteTarget(null)
        refetch()
      } else toast.error("Failed to delete login")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Portal Access" subtitle="Login this party uses to upload slips and view their ledger">
      {loading ? (
        <p className="text-sm text-tertiary">Loading…</p>
      ) : !users || users.length === 0 ? (
        <p className="text-sm text-tertiary">No portal login yet. {canWrite && "Use “Add Login” above to give this party access."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-tertiary">
                <th className="pb-2 pr-4 font-medium">Email</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 font-medium">Last Login</th>
                <th className="pb-2 pr-4 font-medium">Created</th>
                {canWrite && <th className="pb-2 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="py-3 pr-4 font-medium text-foreground">{u.email}</td>
                  <td className="py-3 pr-4"><StatusBadge active={u.active} /></td>
                  <td className="py-3 pr-4 whitespace-nowrap text-secondary">{u.lastLoginAt ? formatDate(u.lastLoginAt) : "Never"}</td>
                  <td className="py-3 pr-4 whitespace-nowrap text-secondary">{formatDate(u.createdAt)}</td>
                  {canWrite && (
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          title="Invite"
                          aria-label="Invite"
                          onClick={() => setInviteFor(u)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-secondary transition-colors hover:bg-muted hover:text-blue-600"
                        >
                          <Send size={15} />
                        </button>
                        <button
                          type="button"
                          title="Edit"
                          aria-label="Edit"
                          onClick={() => openEdit(u)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-secondary transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          aria-label="Delete"
                          onClick={() => setDeleteTarget(u)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-secondary transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:hover:border-rose-500/30 dark:hover:bg-rose-500/10"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add login */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Portal Login" size="sm">
        <div className="space-y-4">
          <Input label="Contact Name" value={customerName} disabled helperText="Defaults to the customer name" />
          <Input label="Login Email *" type="email" value={addForm.email} onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))} />
          <PasswordControls label="Temporary Password *" value={addForm.password} onChange={(v) => setAddForm((p) => ({ ...p, password: v }))} />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowAdd(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleAdd} loading={saving}>Create Login</Button>
          </div>
        </div>
      </Modal>

      {/* Edit login */}
      <Modal isOpen={editFor !== null} onClose={() => setEditFor(null)} title="Edit Login" size="sm">
        <div className="space-y-4">
          <Input label="Login Email *" type="email" value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} />
          <div>
            <PasswordControls label="New Password" value={editForm.password} onChange={(v) => setEditForm((p) => ({ ...p, password: v }))} />
            <p className="mt-1 text-xs text-tertiary">Leave blank to keep the current password.</p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5">
            <div>
              <div className="text-sm font-medium text-foreground">Active</div>
              <div className="text-xs text-tertiary">{editForm.active ? "Party can log in" : "Login is disabled"}</div>
            </div>
            <button
              type="button"
              onClick={() => setEditForm((p) => ({ ...p, active: !p.active }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm.active ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
              aria-pressed={editForm.active}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editForm.active ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setEditFor(null)} disabled={saving}>Cancel</Button>
            <Button onClick={handleEdit} loading={saving}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      {/* Invite (link + email) */}
      <Modal isOpen={inviteFor !== null} onClose={() => setInviteFor(null)} title="Invite to Portal" size="sm">
        {inviteFor && (
          <div className="space-y-4">
            <p className="text-sm text-secondary">Send the portal link to the party. They sign in with the email below and their password.</p>
            <div className="space-y-2 rounded-xl border border-line bg-muted p-3 text-sm">
              <div className="flex justify-between gap-3"><span className="text-tertiary">Portal link</span><span className="truncate font-medium text-foreground">{portalLoginUrl()}</span></div>
              <div className="flex justify-between gap-3"><span className="text-tertiary">Email</span><span className="truncate font-medium text-foreground">{inviteFor.email}</span></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="success" onClick={() => whatsappShare(inviteMessage(inviteFor.email))}><MessageCircle size={15} className="mr-1.5" /> WhatsApp</Button>
              <Button variant="secondary" onClick={() => shareOrCopy(inviteMessage(inviteFor.email))}><Share2 size={15} className="mr-1.5" /> Share</Button>
              <Button variant="secondary" onClick={() => copyText(inviteMessage(inviteFor.email))}><Copy size={15} className="mr-1.5" /> Copy</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Share full credentials — only right after create / password change */}
      <Modal isOpen={shareCreds !== null} onClose={() => setShareCreds(null)} title="Share Login Details" size="sm">
        {shareCreds && (
          <div className="space-y-4">
            <p className="text-sm text-secondary">The password is shown only now — share it before closing.</p>
            <div className="space-y-2 rounded-xl border border-line bg-muted p-3 text-sm">
              <div className="flex justify-between gap-3"><span className="text-tertiary">Portal link</span><span className="truncate font-medium text-foreground">{portalLoginUrl()}</span></div>
              <div className="flex justify-between gap-3"><span className="text-tertiary">Email</span><span className="truncate font-medium text-foreground">{shareCreds.email}</span></div>
              <div className="flex justify-between gap-3"><span className="text-tertiary">Password</span><span className="font-mono font-medium text-foreground">{shareCreds.password}</span></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="success" onClick={() => whatsappShare(credentialsMessage(shareCreds.email, shareCreds.password))}><MessageCircle size={15} className="mr-1.5" /> WhatsApp</Button>
              <Button variant="secondary" onClick={() => shareOrCopy(credentialsMessage(shareCreds.email, shareCreds.password))}><Share2 size={15} className="mr-1.5" /> Share</Button>
              <Button variant="secondary" onClick={() => copyText(credentialsMessage(shareCreds.email, shareCreds.password))}><Copy size={15} className="mr-1.5" /> Copy</Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Delete portal login?"
        message={`This will permanently remove the login for ${deleteTarget?.email}. Slips they already uploaded are kept.`}
        confirmLabel="Delete"
        loading={busy}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </Card>
  )
})
