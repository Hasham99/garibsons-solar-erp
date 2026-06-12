"use client"

import { ReactNode } from "react"
import { AlertTriangle } from "lucide-react"
import { Modal } from "@/components/ui/Modal"
import { Button } from "@/components/ui/Button"

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Visual tone of the confirm button. Default "danger" — most confirms here are deletes. */
  variant?: "danger" | "primary"
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}

/** Modal confirmation used for destructive actions (delete collection, cancel SO…). */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  variant = "danger",
  loading,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className={`shrink-0 rounded-full p-2.5 ${variant === "danger" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"}`}>
            <AlertTriangle size={20} />
          </div>
          <div className="text-sm text-gray-600 pt-1.5">{message}</div>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={loading}>{cancelLabel}</Button>
          <Button variant={variant === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
