"use client"

import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { Modal } from "@/components/ui/Modal"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { formatCurrency } from "@/lib/utils"

export interface OpeningBalance {
  id: string
  amount: number
  direction: "RECEIVABLE" | "ADVANCE"
  date: string
  notes: string | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
  customerId: string
  customerName: string
  /** Existing record to edit, or null to create a new one. */
  existing: OpeningBalance | null
  onSaved: () => void
}

const today = () => new Date().toISOString().split("T")[0]

export function OpeningBalanceModal({ isOpen, onClose, customerId, customerName, existing, onSaved }: Props) {
  const [direction, setDirection] = useState<"RECEIVABLE" | "ADVANCE">("RECEIVABLE")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(today())
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing, setRemoving] = useState(false)

  // Re-seed the form whenever the modal opens (edit → prefill, create → blank).
  useEffect(() => {
    if (!isOpen) return
    setDirection(existing?.direction ?? "RECEIVABLE")
    setAmount(existing ? String(existing.amount) : "")
    setDate(existing ? existing.date.split("T")[0] : today())
    setNotes(existing?.notes ?? "")
  }, [isOpen, existing])

  const handleSave = async () => {
    if (!amount || !date) return toast.error("Amount and date are required")
    const parsed = parseFloat(amount)
    if (isNaN(parsed) || parsed <= 0) return toast.error("Amount must be a positive number")
    setSaving(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/opening-balance`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parsed, direction, date, notes: notes || null }),
      })
      if (res.ok) {
        toast.success("Opening balance saved")
        onSaved()
        onClose()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || "Failed to save opening balance")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    setRemoving(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/opening-balance`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Opening balance removed")
        onSaved()
        setConfirmRemove(false)
        onClose()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || "Failed to remove opening balance")
      }
    } finally {
      setRemoving(false)
    }
  }

  const parsedPreview = parseFloat(amount)
  const showPreview = !isNaN(parsedPreview) && parsedPreview > 0

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Opening Balance" size="md">
        <div className="space-y-4">
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="font-medium text-foreground">{customerName}</p>
            <p className="text-xs text-secondary mt-0.5">
              Seeds the ledger with a starting figure as of the chosen date. All sales orders,
              deliveries and collections stack on top of it.
            </p>
          </div>

          {/* Direction */}
          <div>
            <label className="block text-sm font-medium text-secondary mb-1.5">Type *</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: "RECEIVABLE" as const, title: "Balance owed", sub: "Party owed us money" },
                { key: "ADVANCE" as const, title: "Advance received", sub: "Party paid us ahead" },
              ]).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setDirection(opt.key)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    direction === opt.key
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/40"
                      : "border-line hover:bg-muted"
                  }`}
                >
                  <p className={`text-sm font-medium ${direction === opt.key ? "text-blue-700 dark:text-blue-300" : "text-foreground"}`}>
                    {opt.title}
                  </p>
                  <p className="text-xs text-tertiary mt-0.5">{opt.sub}</p>
                </button>
              ))}
            </div>
          </div>

          <Input
            label="Amount (PKR) *"
            type="number"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 500000"
          />

          <Input
            label="As-of Date *"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

          <Input
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional — e.g. carried over from previous system"
          />

          {showPreview && (
            <div className={`rounded-lg p-3 text-sm border ${
              direction === "RECEIVABLE"
                ? "bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/30 text-orange-800 dark:text-orange-300"
                : "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30 text-green-800 dark:text-green-300"
            }`}>
              {direction === "RECEIVABLE"
                ? <>Opening receivable of <strong>{formatCurrency(parsedPreview)}</strong> — added to what the party owes.</>
                : <>Opening advance of <strong>{formatCurrency(parsedPreview)}</strong> — credited to the party.</>}
            </div>
          )}

          <div className="flex justify-between gap-3 pt-1">
            {existing ? (
              <Button variant="danger" onClick={() => setConfirmRemove(true)} disabled={saving}>
                Remove
              </Button>
            ) : <span />}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button onClick={handleSave} loading={saving}>
                {existing ? "Save Changes" : "Set Opening Balance"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={handleRemove}
        loading={removing}
        title="Remove Opening Balance"
        confirmLabel="Remove"
        message={
          <span>
            Remove the opening balance for <strong>{customerName}</strong>?
            <br />The party&apos;s balance will update immediately.
          </span>
        }
      />
    </>
  )
}
