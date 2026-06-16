"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Search, X } from "lucide-react"
import { clsx } from "clsx"

export interface SearchableOption {
  value: string
  label: string
  sublabel?: string
}

interface SearchableSelectProps {
  options: SearchableOption[]
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  required?: boolean
  error?: string
  /** Show a clear (×) button when a value is selected. Default true. */
  clearable?: boolean
}

/** Combobox: type to filter a long list (e.g. 200+ parties), click to select. */
export function SearchableSelect({
  options,
  value,
  onChange,
  label,
  placeholder = "Type to search…",
  required,
  error,
  clearable = true,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value) || null

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => `${o.label} ${o.sublabel || ""}`.toLowerCase().includes(q))
  }, [options, query])

  return (
    <div className="w-full" ref={ref}>
      {label && (
        <label className="block text-[13px] font-medium text-secondary mb-1">
          {label}
          {required && <span className="text-rose-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => { setOpen((o) => !o); setQuery("") }}
          className={clsx(
            "flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-[13px] shadow-sm cursor-pointer",
            "transition-[border-color,box-shadow,background-color] duration-200 focus:outline-none focus:ring-2",
            error
              ? "animate-shake border-rose-300 bg-rose-50/60 focus:ring-rose-400/50 focus:border-rose-400 dark:border-rose-500/50 dark:bg-rose-500/10"
              : "border-line-strong bg-surface hover:border-line-strong focus:ring-blue-500/50 focus:border-blue-500"
          )}
        >
          <span className={clsx("truncate", selected ? "text-foreground" : error ? "text-rose-300 dark:text-rose-400" : "text-tertiary")}>
            {selected ? selected.label : placeholder}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {clearable && selected && (
              <X
                size={14}
                className="text-tertiary hover:text-secondary transition-colors"
                onClick={(e) => { e.stopPropagation(); onChange(""); setQuery("") }}
              />
            )}
            <ChevronDown size={15} className={`text-tertiary transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          </span>
        </button>

        {open && (
          <div className="absolute z-30 mt-1.5 w-full origin-top rounded-xl border border-line bg-elevated shadow-pop animate-slide-down">
            <div className="relative border-b border-line p-2">
              <Search size={14} className="absolute left-5 top-1/2 -translate-y-1/2 text-tertiary pointer-events-none" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-lg border border-line pl-8 pr-2 py-1.5 text-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
              />
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-center text-sm text-tertiary">No match found</p>
              ) : (
                filtered.slice(0, 100).map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => { onChange(o.value); setOpen(false); setQuery("") }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-blue-50 dark:hover:bg-blue-500/10 cursor-pointer ${
                      o.value === value ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300" : "text-foreground"
                    }`}
                  >
                    <span>{o.label}</span>
                    {o.sublabel && <span className="text-xs text-tertiary">{o.sublabel}</span>}
                  </button>
                ))
              )}
              {filtered.length > 100 && (
                <p className="px-3 py-2 text-center text-xs text-tertiary">…{filtered.length - 100} more — keep typing to narrow</p>
              )}
            </div>
          </div>
        )}
      </div>
      {error && <p className="mt-1.5 text-[13px] text-rose-600 dark:text-rose-400 animate-slide-down">{error}</p>}
    </div>
  )
}
