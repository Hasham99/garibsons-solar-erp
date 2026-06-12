"use client"

import { ReactNode, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { MoreVertical } from "lucide-react"

export interface RowAction {
  label: string
  icon?: ReactNode
  onClick: () => void
  /** Render in red — destructive actions (delete, cancel). */
  danger?: boolean
  disabled?: boolean
}

/**
 * Standard table row-actions kebab (⋮) menu. The dropdown is rendered in a
 * portal with fixed positioning so it never clips inside scrollable tables.
 * Pass only the actions valid for this row — an empty list hides the trigger.
 */
export function RowActionsMenu({ actions, label = "Row actions" }: { actions: RowAction[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onClick = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close()
    document.addEventListener("mousedown", onClick)
    document.addEventListener("keydown", onKey)
    window.addEventListener("scroll", close, true)
    window.addEventListener("resize", close)
    return () => {
      document.removeEventListener("mousedown", onClick)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("resize", close)
    }
  }, [open])

  if (actions.length === 0) return <span className="text-gray-300">—</span>

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    setOpen((o) => !o)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        onClick={(e) => { e.stopPropagation(); toggle() }}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
          open ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        }`}
      >
        <MoreVertical size={15} />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, right: pos.right }}
          className="z-50 min-w-44 rounded-xl border border-gray-200 bg-white py-1.5 shadow-lg"
        >
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              disabled={a.disabled}
              onClick={(e) => { e.stopPropagation(); setOpen(false); a.onClick() }}
              className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                a.danger ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {a.icon && <span className={a.danger ? "text-red-500" : "text-gray-400"}>{a.icon}</span>}
              {a.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}
