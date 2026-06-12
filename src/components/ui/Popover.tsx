"use client"

import { ReactNode, useEffect, useRef, useState } from "react"

interface PopoverProps {
  button: ReactNode
  /** Active-state counter rendered as a blue pill on the trigger. */
  badge?: number
  children: ReactNode
  /** Panel width class. Default w-80. */
  width?: string
  align?: "left" | "right"
}

/** Toolbar popover with outside-click / Escape close (filters, sections, columns…). */
export function Popover({ button, badge, children, width = "w-80", align = "right" }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onClick)
    document.addEventListener("keydown", onKey)
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey) }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors cursor-pointer ${
          (badge || 0) > 0 ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
        }`}
      >
        {button}
        {(badge || 0) > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-medium text-white">{badge}</span>
        )}
      </button>
      {open && (
        <div className={`absolute ${align === "right" ? "right-0" : "left-0"} z-30 mt-2 ${width} rounded-xl border border-gray-200 bg-white p-4 shadow-lg`}>
          {children}
        </div>
      )}
    </div>
  )
}
