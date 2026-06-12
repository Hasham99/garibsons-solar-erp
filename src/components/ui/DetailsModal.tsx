"use client"

import { ReactNode } from "react"
import { Modal } from "@/components/ui/Modal"
import { Button } from "@/components/ui/Button"

export interface DetailField {
  label: string
  value: ReactNode
  /** Span both columns (long text like notes / addresses). */
  wide?: boolean
}

/**
 * Generic row-details dialog opened by clicking a table row (same pattern as
 * the PO table). Renders label/value pairs in a two-column grid, an optional
 * free-form section underneath (e.g. line items), and a Close footer.
 */
export function DetailsModal({
  isOpen,
  onClose,
  title,
  fields,
  children,
  footer,
}: {
  isOpen: boolean
  onClose: () => void
  title: string
  fields: DetailField[]
  children?: ReactNode
  footer?: ReactNode
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fields.map((f) => (
            <div key={f.label} className={`rounded-lg bg-gray-50 px-3 py-2.5 min-w-0 ${f.wide ? "sm:col-span-2" : ""}`}>
              <p className="text-xs text-gray-500">{f.label}</p>
              <div className="mt-0.5 text-sm font-medium text-gray-900 break-words">{f.value ?? "—"}</div>
            </div>
          ))}
        </div>
        {children}
        <div className="flex justify-end gap-3">
          {footer}
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  )
}
