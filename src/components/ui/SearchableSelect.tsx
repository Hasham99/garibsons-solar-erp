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
        <label className="block text-[13px] font-medium text-slate-700 mb-1">
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
              ? "animate-shake border-rose-300 bg-rose-50/60 focus:ring-rose-400/50 focus:border-rose-400"
              : "border-slate-300 bg-white hover:border-slate-400 focus:ring-blue-500/50 focus:border-blue-500"
          )}
        >
          <span className={clsx("truncate", selected ? "text-slate-900" : error ? "text-rose-300" : "text-slate-400")}>
            {selected ? selected.label : placeholder}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {clearable && selected && (
              <X
                size={14}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                onClick={(e) => { e.stopPropagation(); onChange(""); setQuery("") }}
              />
            )}
            <ChevronDown size={15} className={`text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          </span>
        </button>

        {open && (
          <div className="absolute z-30 mt-1.5 w-full origin-top rounded-xl border border-slate-200 bg-white shadow-pop animate-slide-down">
            <div className="relative border-b border-slate-100 p-2">
              <Search size={14} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-lg border border-slate-200 pl-8 pr-2 py-1.5 text-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
              />
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-center text-sm text-slate-400">No match found</p>
              ) : (
                filtered.slice(0, 100).map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => { onChange(o.value); setOpen(false); setQuery("") }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-blue-50 cursor-pointer ${
                      o.value === value ? "bg-blue-50 font-medium text-blue-700" : "text-slate-800"
                    }`}
                  >
                    <span>{o.label}</span>
                    {o.sublabel && <span className="text-xs text-slate-400">{o.sublabel}</span>}
                  </button>
                ))
              )}
              {filtered.length > 100 && (
                <p className="px-3 py-2 text-center text-xs text-slate-400">…{filtered.length - 100} more — keep typing to narrow</p>
              )}
            </div>
          </div>
        )}
      </div>
      {error && <p className="mt-1.5 text-[13px] text-rose-600 animate-slide-down">{error}</p>}
    </div>
  )
}
