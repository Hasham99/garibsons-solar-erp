"use client"

import { ReactNode } from "react"
import { Drawer } from "@/components/ui/Drawer"
import { Button } from "@/components/ui/Button"
import type { RowAction } from "@/components/ui/RowActionsMenu"

export interface DetailField {
  label: string
  value: ReactNode
  /** Span both columns (long text like notes / addresses). */
  wide?: boolean
  /** Force (or suppress) the mono numeric font. If omitted, it's auto-detected. */
  numeric?: boolean
}

/**
 * True when a value reads as a number/amount/date/quantity — money ("Rs 1,234"),
 * dates ("13-Jun-2026"), quantities ("720 pcs"), percentages, etc. — but NOT
 * names, statuses, or identifier codes (e.g. "SO-2026-381" keeps letters).
 * Used to apply the tabular mono font only to numeric detail values.
 */
function looksNumeric(v: ReactNode): boolean {
  if (typeof v === "number") return true
  if (typeof v !== "string") return false
  if (!/\d/.test(v)) return false
  const stripped = v
    .replace(/\b(Rs|PKR|USD|pcs|panels?|watts?|days?|months?|years?|yrs?|GST|today|each)\b/gi, "")
    .replace(/[\d.,%\s/:()+@×x·•—–-]/g, "")
  return stripped.trim().length === 0
}

/**
 * Generic row-details view opened by clicking a table row. Renders as a
 * right-side slide-over (the list stays visible behind it) with label/value
 * pairs in a two-column grid, an optional free-form section underneath
 * (e.g. line items), and a footer carrying the row's actions.
 *
 * Pass the SAME RowAction[] used by the row's 3-dot menu via `actions` —
 * the panel closes itself before running an action (most open another dialog).
 */
export function DetailsModal({
  isOpen,
  onClose,
  title,
  fields,
  actions = [],
  children,
  footer,
}: {
  isOpen: boolean
  onClose: () => void
  title: string
  fields: DetailField[]
  actions?: RowAction[]
  children?: ReactNode
  footer?: ReactNode
}) {
  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fields.map((f) => {
            const mono = f.numeric ?? looksNumeric(f.value)
            return (
              <div key={f.label} className={`rounded-lg bg-slate-50 px-3 py-2.5 min-w-0 ${f.wide ? "sm:col-span-2" : ""}`}>
                <p className="text-xs text-slate-500">{f.label}</p>
                <div className={`mt-0.5 text-sm font-medium text-slate-900 break-words ${mono ? "tabular-nums" : ""}`}>
                  {f.value ?? "—"}
                </div>
              </div>
            )
          })}
        </div>
        {children}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
          {actions.map((a) => (
            <Button
              key={a.label}
              size="sm"
              variant={a.danger ? "danger" : "secondary"}
              disabled={a.disabled}
              onClick={() => {
                onClose()
                a.onClick()
              }}
            >
              {a.icon && <span className="mr-1.5">{a.icon}</span>}
              {a.label}
            </Button>
          ))}
          {footer}
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Drawer>
  )
}
