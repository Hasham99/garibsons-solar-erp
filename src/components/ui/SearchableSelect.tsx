"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Search, X } from "lucide-react"

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
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => { setOpen((o) => !o); setQuery("") }}
          className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <span className={selected ? "text-gray-900" : "text-gray-400"}>
            {selected ? selected.label : placeholder}
          </span>
          <span className="flex items-center gap-1">
            {clearable && selected && (
              <X
                size={14}
                className="text-gray-400 hover:text-gray-600"
                onClick={(e) => { e.stopPropagation(); onChange(""); setQuery("") }}
              />
            )}
            <ChevronDown size={15} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        </button>

        {open && (
          <div className="absolute z-30 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="relative border-b border-gray-100 p-2">
              <Search size={14} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-md border border-gray-200 pl-8 pr-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-center text-sm text-gray-400">No match found</p>
              ) : (
                filtered.slice(0, 100).map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => { onChange(o.value); setOpen(false); setQuery("") }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-blue-50 cursor-pointer ${
                      o.value === value ? "bg-blue-50 font-medium text-blue-700" : "text-gray-800"
                    }`}
                  >
                    <span>{o.label}</span>
                    {o.sublabel && <span className="text-xs text-gray-400">{o.sublabel}</span>}
                  </button>
                ))
              )}
              {filtered.length > 100 && (
                <p className="px-3 py-2 text-center text-xs text-gray-400">…{filtered.length - 100} more — keep typing to narrow</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
