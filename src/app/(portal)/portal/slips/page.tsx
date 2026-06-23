"use client"

import { useRef, useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { Header } from "@/components/layout/Header"
import { Table, Column } from "@/components/ui/Table"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Modal } from "@/components/ui/Modal"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { DetailsModal } from "@/components/ui/DetailsModal"
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Eye, Pencil, Trash2, Camera, X } from "lucide-react"
import toast from "react-hot-toast"

interface LinkedReceipt {
  receiptNo: string
  amount: number
  reference: string | null
  valueDate: string
  notes: string | null
  bank: { name: string }
}

interface Slip {
  id: string
  status: "PENDING" | "VERIFIED" | "REJECTED" | "ALREADY_RECEIVED"
  fileType: string
  hasImage: boolean
  claimedAmount: number | null
  claimedValueDate: string | null
  rejectionReason: string | null
  createdAt: string
  linkedReceipt: LinkedReceipt | null
}

// Colored row tint + left border per status — mirrors the admin Payment Slips table.
const rowTint = (s: Slip) => {
  switch (s.status) {
    case "PENDING": return "bg-amber-50/60 dark:bg-amber-500/10 border-l-4 border-l-amber-400"
    case "VERIFIED": return "bg-emerald-50/60 dark:bg-emerald-500/10 border-l-4 border-l-emerald-400"
    case "ALREADY_RECEIVED": return "bg-sky-50/60 dark:bg-sky-500/10 border-l-4 border-l-sky-400"
    case "REJECTED": return "bg-rose-50/60 dark:bg-rose-500/10 border-l-4 border-l-rose-300 dark:border-l-rose-500"
    default: return ""
  }
}

// Status chip — same labels/colors as the admin Payment Slips table.
function statusBadge(status: Slip["status"]) {
  const map: Record<Slip["status"], { label: string; cls: string }> = {
    VERIFIED: { label: "Approved", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300" },
    REJECTED: { label: "Rejected", cls: "bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300" },
    PENDING: { label: "Pending", cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300" },
    ALREADY_RECEIVED: { label: "Already Received", cls: "bg-sky-100 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300" },
  }
  const s = map[status]
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
}

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "")

export default function PortalSlipsPage() {
  const { data: slips, loading, refetch } = useFetch<Slip[]>("/api/portal/slips")

  const [detailRow, setDetailRow] = useState<Slip | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Slip | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Edit modal state
  const [editTarget, setEditTarget] = useState<Slip | null>(null)
  const [editFile, setEditFile] = useState<File | null>(null)
  const [editPreview, setEditPreview] = useState<string | null>(null)
  const [editDate, setEditDate] = useState("")
  const [editAmount, setEditAmount] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const openEdit = (s: Slip) => {
    setEditTarget(s)
    setEditFile(null)
    setEditPreview(null)
    setEditDate(toDateInput(s.claimedValueDate || s.createdAt))
    setEditAmount(s.claimedAmount != null ? String(s.claimedAmount) : "")
  }

  const onPickEdit = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setEditFile(f)
    setEditPreview(f.type === "application/pdf" ? null : URL.createObjectURL(f))
  }

  const handleEditSave = async () => {
    if (!editTarget) return
    setSavingEdit(true)
    try {
      const fd = new FormData()
      if (editFile) fd.append("file", editFile)
      if (editAmount) fd.append("amount", editAmount)
      if (editDate) fd.append("valueDate", editDate)
      const res = await fetch(`/api/portal/slips/${editTarget.id}`, { method: "PATCH", body: fd })
      if (res.ok) {
        toast.success("Slip updated")
        setEditTarget(null)
        refetch()
      } else {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error || "Failed to update slip")
      }
    } catch {
      toast.error("Network error — please try again")
    } finally {
      setSavingEdit(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/portal/slips/${deleteTarget.id}`, { method: "DELETE" })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success("Slip deleted")
        setDeleteTarget(null)
        refetch()
      } else {
        toast.error(d.error || "Failed to delete slip")
      }
    } finally {
      setDeleting(false)
    }
  }

  // View is always available; Edit / Delete only while the slip is still pending.
  const rowActions = (s: Slip): RowAction[] => {
    const actions: RowAction[] = [{ label: "View", icon: <Eye size={15} />, onClick: () => setDetailRow(s) }]
    if (s.status === "PENDING") {
      actions.push({ label: "Edit", icon: <Pencil size={15} />, onClick: () => openEdit(s) })
      actions.push({ label: "Delete", icon: <Trash2 size={15} />, danger: true, onClick: () => setDeleteTarget(s) })
    }
    return actions
  }

  const detailActions = (s: Slip): RowAction[] => rowActions(s).filter((a) => a.label !== "View")

  const detailFields = (s: Slip) => {
    const r = s.linkedReceipt
    return [
      { label: "Status", value: statusBadge(s.status) },
      { label: "Amount", value: s.claimedAmount != null ? formatCurrency(s.claimedAmount) : "—" },
      { label: "Payment Date", value: formatDate(s.claimedValueDate || s.createdAt) },
      { label: "Submitted", value: formatDate(s.createdAt) },
      ...(r
        ? [
            { label: "Receipt #", value: r.receiptNo },
            { label: "Bank", value: r.bank?.name || "—" },
            { label: "Receipt Amount", value: formatCurrency(r.amount) },
            { label: "Value Date", value: formatDate(r.valueDate) },
            { label: "Reference", value: r.reference || "—" },
            ...(r.notes ? [{ label: "Notes", value: r.notes, wide: true }] : []),
          ]
        : []),
      ...(s.status === "REJECTED" && s.rejectionReason
        ? [{ label: "Rejection Reason", value: s.rejectionReason, wide: true }]
        : []),
    ]
  }

  const columns: Column<Slip>[] = [
    {
      key: "thumb",
      header: "Slip",
      render: (s) =>
        s.hasImage ? (
          s.fileType === "application/pdf" ? (
            <a href={`/api/portal/slips/${s.id}/image`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs font-medium text-blue-600">PDF</a>
          ) : (
            <a href={`/api/portal/slips/${s.id}/image`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/portal/slips/${s.id}/image`} alt="Slip" loading="lazy" className="h-10 w-10 rounded object-cover" />
            </a>
          )
        ) : (
          <span className="text-xs text-tertiary">—</span>
        ),
    },
    {
      key: "claimedValueDate",
      header: "Date",
      sortable: true,
      value: (s) => s.claimedValueDate || s.createdAt,
      render: (s) => <span className="whitespace-nowrap">{formatDate(s.claimedValueDate || s.createdAt)}</span>,
    },
    {
      key: "claimedAmount",
      header: "Amount",
      numeric: true,
      sortable: true,
      value: (s) => s.claimedAmount ?? 0,
      render: (s) => (s.claimedAmount != null ? formatCurrency(s.claimedAmount) : "—"),
    },
    {
      key: "receipt",
      header: "Receipt #",
      value: (s) => s.linkedReceipt?.receiptNo ?? "",
      render: (s) => {
        if (s.linkedReceipt) return <span className="text-xs text-tertiary">{s.linkedReceipt.receiptNo}</span>
        if (s.status === "ALREADY_RECEIVED" && s.rejectionReason) return <span className="text-xs text-sky-600">{s.rejectionReason}</span>
        if (s.status === "REJECTED" && s.rejectionReason) return <span className="text-xs text-rose-600">{s.rejectionReason}</span>
        return <span className="text-tertiary">—</span>
      },
    },
    {
      key: "status",
      header: "Status",
      value: (s) => s.status,
      render: (s) => statusBadge(s.status),
    },
    {
      key: "actions",
      header: "Actions",
      render: (s) => <RowActionsMenu actions={rowActions(s)} />,
    },
  ]

  return (
    <div className="space-y-5 animate-fade-in-up">
      <Header title="My Slips" />

      {loading ? (
        <TableSkeleton />
      ) : (
        <Table
          columns={columns}
          data={slips || []}
          onRowClick={(s) => setDetailRow(s)}
          rowClassName={rowTint}
          searchPlaceholder="Search amount or receipt #…"
          searchKeys={["linkedReceipt.receiptNo"]}
          filters={[
            {
              key: "status",
              label: "Status",
              value: (s) => s.status,
              options: [
                { value: "PENDING", label: "Pending" },
                { value: "VERIFIED", label: "Verified" },
                { value: "REJECTED", label: "Rejected" },
                { value: "ALREADY_RECEIVED", label: "Already Received" },
              ],
            },
            { key: "date", label: "Date", type: "date", value: (s) => s.claimedValueDate || s.createdAt },
          ]}
          emptyMessage="You haven't uploaded any slips yet."
          defaultSortKey="claimedValueDate"
          defaultSortDir="desc"
        />
      )}

      {/* Row details — side slide-over panel */}
      <DetailsModal
        isOpen={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title="Payment Slip"
        fields={detailRow ? detailFields(detailRow) : []}
        actions={detailRow ? detailActions(detailRow) : []}
      >
        {detailRow?.hasImage && (
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-tertiary">Slip Image</p>
            {detailRow.fileType === "application/pdf" ? (
              <a href={`/api/portal/slips/${detailRow.id}/image`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-line bg-muted px-3 py-2 text-sm font-medium text-blue-600">Open PDF</a>
            ) : (
              <a href={`/api/portal/slips/${detailRow.id}/image`} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-line bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/portal/slips/${detailRow.id}/image`} alt="Payment slip" className="max-h-80 w-full object-contain" />
              </a>
            )}
          </div>
        )}
      </DetailsModal>

      {/* Edit modal (pending slips only) */}
      <Modal isOpen={Boolean(editTarget)} onClose={() => setEditTarget(null)} title="Edit Payment Slip" size="md">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-secondary">Payment slip</label>
            {!editFile ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-40 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed border-line bg-canvas text-secondary active:scale-[0.99]"
              >
                {editTarget?.hasImage && editTarget.fileType !== "application/pdf" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/portal/slips/${editTarget.id}/image`} alt="Current slip" className="max-h-36 w-full object-contain" />
                ) : (
                  <>
                    <Camera size={28} className="text-blue-600" />
                    <span className="text-sm font-medium">Tap to replace the slip</span>
                    <span className="text-xs text-tertiary">JPG, PNG or PDF · up to 10 MB</span>
                  </>
                )}
              </button>
            ) : (
              <div className="relative overflow-hidden rounded-xl border border-line bg-canvas">
                <button type="button" onClick={() => { setEditFile(null); setEditPreview(null); if (fileRef.current) fileRef.current.value = "" }} className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white">
                  <X size={16} />
                </button>
                {editPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={editPreview} alt="New slip" className="max-h-64 w-full object-contain" />
                ) : (
                  <div className="flex h-28 items-center justify-center text-sm font-medium text-secondary">{editFile.name}</div>
                )}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" onChange={onPickEdit} className="hidden" />
            {editTarget?.hasImage && <p className="mt-1.5 text-[12px] text-tertiary">Leave as-is to keep the current image.</p>}
          </div>

          <Input label="Payment date" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
          <Input label="Amount (PKR)" type="number" inputMode="decimal" placeholder="e.g. 50000" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleEditSave} loading={savingEdit}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Payment Slip"
        message={<>Delete this payment slip{deleteTarget?.claimedAmount != null ? <> for <span className="font-semibold text-foreground">{formatCurrency(deleteTarget.claimedAmount)}</span></> : ""}? This can&rsquo;t be undone.</>}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
