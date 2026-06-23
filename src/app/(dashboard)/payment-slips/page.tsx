"use client"

import { useState, type ReactNode } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Drawer } from "@/components/ui/Drawer"
import { Table, Column } from "@/components/ui/Table"
import { Modal } from "@/components/ui/Modal"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { Spinner } from "@/components/ui/Spinner"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu"
import { formatCurrency, formatDate } from "@/lib/utils"
import { useAuth, accessOf } from "@/hooks/useAuth"
import { can } from "@/lib/permissions/modules"
import type { DuplicateResult } from "@/lib/collections/duplicate"
import { Eye, CheckCircle2, AlertTriangle, Pencil, Trash2 } from "lucide-react"
import toast from "react-hot-toast"

interface LinkedReceipt {
  id: string
  receiptNo: string
  reference: string | null
  amount: number
  valueDate: string
  notes: string | null
  bank: { id: string; name: string }
}

type SlipStatus = "PENDING" | "VERIFIED" | "REJECTED" | "ALREADY_RECEIVED"

interface Slip {
  id: string
  status: SlipStatus
  fileType: string
  imageUrl: string | null
  imagePurgedAt: string | null
  claimedAmount: number | null
  claimedValueDate: string | null
  reviewedAt: string | null
  rejectionReason: string | null
  createdAt: string
  customer: { id: string; name: string }
  submittedBy: { name: string; email: string } | null
  linkedReceipt: LinkedReceipt | null
}

interface Bank {
  id: string
  name: string
}

const statusText = (s: SlipStatus) =>
  s === "VERIFIED" ? "Approved" : s === "ALREADY_RECEIVED" ? "Already Received" : s === "REJECTED" ? "Rejected" : "Pending"

// Colored row tint + left border per status — mirrors the Sales Orders table.
const rowTint = (r: Slip) => {
  switch (r.status) {
    case "PENDING": return "bg-amber-50/60 dark:bg-amber-500/10 border-l-4 border-l-amber-400"
    case "VERIFIED": return "bg-emerald-50/60 dark:bg-emerald-500/10 border-l-4 border-l-emerald-400"
    case "ALREADY_RECEIVED": return "bg-sky-50/60 dark:bg-sky-500/10 border-l-4 border-l-sky-400"
    case "REJECTED": return "bg-rose-50/60 dark:bg-rose-500/10 border-l-4 border-l-rose-300 dark:border-l-rose-500"
    default: return ""
  }
}

function statusBadge(status: SlipStatus) {
  const map: Record<SlipStatus, { label: string; cls: string }> = {
    VERIFIED: { label: "Approved", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300" },
    REJECTED: { label: "Rejected", cls: "bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300" },
    PENDING: { label: "Pending", cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300" },
    ALREADY_RECEIVED: { label: "Already Received", cls: "bg-sky-100 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300" },
  }
  const s = map[status]
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
}

// Recorded value when reviewed, else the party-claimed value (or — when unknown).
const dBank = (r: Slip) => r.linkedReceipt?.bank.name ?? "—"
const dRef = (r: Slip) => r.linkedReceipt?.reference || "—"
const dTitle = (r: Slip) => r.linkedReceipt?.notes || "—"
const dAmount = (r: Slip) => r.linkedReceipt?.amount ?? r.claimedAmount
const dValueDate = (r: Slip) => r.linkedReceipt?.valueDate ?? r.claimedValueDate ?? r.createdAt

/** Slip image with a spinner placeholder while it loads. */
function SlipImage({ slip }: { slip: Slip }) {
  const [loaded, setLoaded] = useState(false)
  const src = `/api/payment-slips/${slip.id}/image`

  if (!slip.imageUrl || slip.imagePurgedAt) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-tertiary">
        {slip.imagePurgedAt ? "Image deleted after retention period" : "No image"}
      </div>
    )
  }
  if (slip.fileType === "application/pdf") {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className="flex h-40 items-center justify-center text-sm font-medium text-blue-600 hover:underline">
        Open PDF slip ↗
      </a>
    )
  }
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="block">
      {!loaded && (
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Payment slip" onLoad={() => setLoaded(true)} className={`mx-auto max-h-80 w-auto rounded ${loaded ? "" : "hidden"}`} />
    </a>
  )
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-tertiary">{label}</div>
      <div className="font-medium text-foreground">{value}</div>
    </div>
  )
}

const emptyForm = { bankId: "", reference: "", amount: "", valueDate: "", notes: "" }

export default function PaymentSlipsPage() {
  const { user } = useAuth()
  const access = accessOf(user)
  const canWrite = can(access, "payments.slips", "write")

  const { data: slips, loading, refetch } = useFetch<Slip[]>("/api/payment-slips?status=ALL")
  const { data: banks } = useFetch<Bank[]>("/api/banks")

  const [review, setReview] = useState<Slip | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [dupWarn, setDupWarn] = useState<DuplicateResult | null>(null)

  // The review drawer doubles as an editor: "review" mode validates a pending
  // slip (verify flow), "edit" mode saves corrections to any slip (PATCH).
  const [mode, setMode] = useState<"review" | "edit">("review")
  const [savingEdit, setSavingEdit] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Slip | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openReview = (slip: Slip) => {
    setReview(slip)
    setMode("review")
    setForm({
      bankId: "",
      reference: "",
      amount: slip.claimedAmount != null ? String(slip.claimedAmount) : "",
      valueDate: slip.claimedValueDate ? new Date(slip.claimedValueDate).toISOString().slice(0, 10) : new Date(slip.createdAt).toISOString().slice(0, 10),
      notes: "",
    })
    setDupWarn(null)
  }

  const openEdit = (slip: Slip) => {
    const r = slip.linkedReceipt
    const amount = r?.amount ?? slip.claimedAmount
    setReview(slip)
    setMode("edit")
    setForm({
      bankId: r?.bank.id ?? "",
      reference: r?.reference ?? "",
      amount: amount != null ? String(amount) : "",
      valueDate: new Date(r?.valueDate ?? slip.claimedValueDate ?? slip.createdAt).toISOString().slice(0, 10),
      notes: r?.notes ?? "",
    })
    setDupWarn(null)
  }

  const handleEditSave = async () => {
    if (!review) return
    if (!form.amount || !form.valueDate) {
      return toast.error("Amount and value date are required")
    }
    setSavingEdit(true)
    try {
      const body: Record<string, string> = { amount: form.amount, valueDate: form.valueDate }
      if (review.linkedReceipt) {
        body.bankId = form.bankId
        body.reference = form.reference
        body.notes = form.notes
      }
      const res = await fetch(`/api/payment-slips/${review.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        toast.success("Slip updated")
        closeReview()
        refetch()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || "Failed to update slip")
      }
    } finally {
      setSavingEdit(false)
    }
  }

  const closeReview = () => {
    setReview(null)
    setMode("review")
    setForm(emptyForm)
    setDupWarn(null)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/payment-slips/${deleteTarget.id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success(deleteTarget.linkedReceipt ? "Slip deleted — collection removed from ledger" : "Slip deleted")
        setDeleteTarget(null)
        refetch()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || "Failed to delete slip")
      }
    } finally {
      setDeleting(false)
    }
  }

  const handleVerify = async (confirmDuplicate = false) => {
    if (!review) return
    if (!form.bankId || !form.amount || !form.valueDate) {
      return toast.error("Bank, amount, and value date are required")
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/payment-slips/${review.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankId: form.bankId, amount: parseFloat(form.amount), reference: form.reference || null, valueDate: form.valueDate, notes: form.notes || null, confirmDuplicate }),
      })
      if (res.ok) {
        toast.success("Slip approved — collection recorded")
        closeReview()
        refetch()
      } else if (res.status === 409) {
        const data = await res.json()
        if (data.duplicateWarning) setDupWarn(data.duplicateWarning as DuplicateResult)
        else toast.error(data.error || "Failed to approve slip")
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to approve slip")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleAlreadyReceived = async () => {
    if (!review || !dupWarn) return
    setSaving(true)
    try {
      const match = dupWarn.matches[0]
      const res = await fetch(`/api/payment-slips/${review.id}/already-received`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptNo: match?.receiptNo || null }),
      })
      if (res.ok) {
        toast.success("Marked as already received — not added to collection")
        setDupWarn(null)
        closeReview()
        refetch()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to update slip")
      }
    } finally {
      setSaving(false)
    }
  }

  const rowActions = (r: Slip): RowAction[] => {
    const actions: RowAction[] =
      r.status === "PENDING" && canWrite
        ? [{ label: "Validate", icon: <CheckCircle2 size={15} />, onClick: () => openReview(r) }]
        : [{ label: "Review", icon: <Eye size={15} />, onClick: () => openReview(r) }]
    if (canWrite) actions.push({ label: "Edit", icon: <Pencil size={15} />, onClick: () => openEdit(r) })
    if (canWrite) actions.push({ label: "Delete", icon: <Trash2 size={15} />, danger: true, onClick: () => setDeleteTarget(r) })
    return actions
  }

  const columns: Column<Slip>[] = [
    { key: "valueDate", header: "Date", sortable: true, value: (r) => dValueDate(r), render: (r) => <span className="whitespace-nowrap">{formatDate(dValueDate(r))}</span> },
    { key: "party", header: "Party Name", value: (r) => r.customer.name, render: (r) => <span className="font-medium text-foreground">{r.customer.name}</span> },
    { key: "reference", header: "Reference", value: (r) => dRef(r), render: (r) => dRef(r) },
    { key: "bank", header: "Bank", value: (r) => dBank(r), render: (r) => dBank(r) },
    { key: "title", header: "Title", value: (r) => dTitle(r), render: (r) => dTitle(r) },
    { key: "amount", header: "Amount", numeric: true, sortable: true, value: (r) => dAmount(r) ?? 0, render: (r) => (dAmount(r) != null ? formatCurrency(dAmount(r)!) : "—") },
    {
      key: "receipt",
      header: "Receipt #",
      value: (r) => r.linkedReceipt?.receiptNo ?? "",
      render: (r) => (r.linkedReceipt ? <span className="text-xs text-tertiary">{r.linkedReceipt.receiptNo}</span> : <span className="text-tertiary">—</span>),
    },
    {
      key: "status",
      header: "Status",
      value: (r) => r.status,
      render: (r) => statusBadge(r.status),
    },
    { key: "actions", header: "Actions", render: (r) => <RowActionsMenu actions={rowActions(r)} /> },
  ]

  return (
    <div className="space-y-5">
      <Header title="Payment Slips" />

      {loading ? (
        <TableSkeleton />
      ) : (
        <div className="rounded-xl border border-line bg-surface shadow-card">
          <Table
            columns={columns}
            data={slips || []}
            searchable
            searchPlaceholder="Search by party, bank or reference…"
            onRowClick={(row) => openReview(row)}
            rowClassName={rowTint}
            filters={[
              { key: "status", label: "Status", value: (r: Slip) => statusText(r.status) },
              { key: "bank", label: "Bank", value: (r: Slip) => dBank(r) },
              { key: "valueDate", label: "Date", type: "date", value: (r: Slip) => dValueDate(r) },
            ]}
            emptyMessage="No payment slips"
          />
        </div>
      )}

      {/* Review / validate / edit drawer */}
      <Drawer isOpen={review !== null} onClose={closeReview} title={mode === "edit" ? "Edit Payment Slip" : review?.status === "PENDING" ? "Validate Payment Slip" : "Review Payment Slip"}>
        {review && (
          <div className="space-y-5">
            <div className="rounded-lg border border-line bg-muted p-2">
              <SlipImage slip={review} />
            </div>

            {/* All fields */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-lg bg-muted px-3 py-3 text-sm">
              <Field label="Uploaded by" value={review.submittedBy?.name || "Staff"} />
              <Field label="Party" value={review.customer.name} />
              <Field label="Status" value={statusBadge(review.status)} />
              {review.status === "VERIFIED" && review.linkedReceipt ? (
                <>
                  <Field label="Receipt No" value={review.linkedReceipt.receiptNo} />
                  <Field label="Bank" value={review.linkedReceipt.bank.name} />
                  <Field label="Reference" value={review.linkedReceipt.reference || "—"} />
                  <Field label="Title / Notes" value={review.linkedReceipt.notes || "—"} />
                  <Field label="Amount" value={formatCurrency(review.linkedReceipt.amount)} />
                  <Field label="Value Date" value={formatDate(review.linkedReceipt.valueDate)} />
                </>
              ) : (
                <>
                  <Field label="Claimed amount" value={review.claimedAmount != null ? formatCurrency(review.claimedAmount) : "—"} />
                  <Field label="Claimed date" value={formatDate(review.claimedValueDate || review.createdAt)} />
                  {review.status === "REJECTED" && <Field label="Reason" value={review.rejectionReason || "—"} />}
                </>
              )}
            </div>

            {/* Staff data entry — validate a pending slip, or edit any slip.
                For edit, bank/reference/notes only persist on approved slips
                (they update the linked receipt), so they're hidden otherwise. */}
            {canWrite && (mode === "edit" || review.status === "PENDING") && (() => {
              const showReceiptFields = mode === "review" || Boolean(review.linkedReceipt)
              return (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-foreground">{mode === "edit" ? "Edit details" : "Confirm receipt details"}</h4>
                  {showReceiptFields && (
                    <>
                      <Select label="Bank *" required={mode === "review"} value={form.bankId} onChange={(e) => setForm((p) => ({ ...p, bankId: e.target.value }))}>
                        <option value="">Select bank…</option>
                        {(banks || []).map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </Select>
                      <Input label="Reference / Slip No" placeholder="Leave blank if the slip has no number" value={form.reference} onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))} />
                    </>
                  )}
                  <Input label="Amount *" type="number" required value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
                  <Input label="Value Date *" type="date" required value={form.valueDate} onChange={(e) => setForm((p) => ({ ...p, valueDate: e.target.value }))} />
                  {showReceiptFields && (
                    <Input label="Title / Notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
                  )}
                  {mode === "edit" && review.linkedReceipt && (
                    <p className="rounded-lg border border-line bg-muted px-3 py-2 text-[12px] text-secondary">
                      This slip is approved — changes update its receipt <span className="font-medium text-foreground">{review.linkedReceipt.receiptNo}</span> and the party&rsquo;s ledger.
                    </p>
                  )}
                  <div className="flex justify-end pt-1">
                    {mode === "edit" ? (
                      <Button onClick={handleEditSave} loading={savingEdit}>Save Changes</Button>
                    ) : (
                      <Button onClick={() => handleVerify()} loading={saving}>Validate &amp; Record</Button>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </Drawer>

      {/* Duplicate — this payment may already be recorded */}
      <Modal isOpen={dupWarn !== null} onClose={() => setDupWarn(null)} title="This payment may already exist" size="lg">
        {dupWarn && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="shrink-0 rounded-full bg-amber-50 p-2.5 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle size={20} />
              </span>
              <p className="pt-1.5 text-sm text-secondary">
                {dupWarn.strong ? "Matching collection(s) with the same bank, reference and amount already exist:" : "Matching collection(s) with the same bank and reference already exist:"}
              </p>
            </div>

            {/* Matching collection records — preview table */}
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted text-[10px] font-semibold uppercase tracking-wide text-tertiary">
                  <tr>
                    <th className="px-3 py-2">Receipt</th>
                    <th className="px-3 py-2">Party</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Bank</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {dupWarn.matches.map((m) => (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap px-3 py-2 font-semibold text-foreground">{m.receiptNo}</td>
                      <td className="px-3 py-2">{m.customerName}</td>
                      <td className="px-3 py-2">{m.reference || "—"}</td>
                      <td className="px-3 py-2">{m.bankName}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatCurrency(m.amount)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{formatDate(m.valueDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2">
              <Button className="w-full" loading={saving} onClick={handleAlreadyReceived}>Mark as Already Received</Button>
              <p className="text-center text-xs text-tertiary">Marks this slip as already received — it won&apos;t be added to the party&apos;s collection.</p>
              <div className="flex items-center justify-between gap-2 pt-1">
                <Button variant="secondary" onClick={() => setDupWarn(null)} disabled={saving}>Cancel</Button>
                <Button variant="ghost" onClick={() => handleVerify(true)} disabled={saving}>Record anyway</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Delete Payment Slip"
        message={
          deleteTarget?.linkedReceipt ? (
            <>
              Delete this approved slip for <span className="font-semibold text-foreground">{deleteTarget.customer.name}</span>? Its collection{" "}
              <span className="font-semibold text-foreground">{deleteTarget.linkedReceipt.receiptNo}</span> ({formatCurrency(deleteTarget.linkedReceipt.amount)}) will be removed from the party&rsquo;s ledger.
            </>
          ) : (
            <>Delete this payment slip for <span className="font-semibold text-foreground">{deleteTarget?.customer.name}</span>? This cannot be undone.</>
          )
        }
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />

    </div>
  )
}
