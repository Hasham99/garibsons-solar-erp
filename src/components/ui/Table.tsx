"use client"

import { ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, SlidersHorizontal, X } from "lucide-react"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Column<T = any> {
  key: string
  header: string
  render?: (row: T) => ReactNode
  sortable?: boolean
  className?: string
  /**
   * Returns the primitive value used for sorting AND searching this column.
   * Provide this for columns whose data is nested or rendered (e.g. customer.name),
   * so search and sort work on the meaningful value rather than "[object Object]".
   */
  value?: (row: T) => string | number | null | undefined
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface FilterDef<T = any> {
  /** Unique key for this filter. */
  key: string
  /** Label shown in the filter panel. */
  label: string
  /** "select" (default) shows a dropdown; "date" shows a from/to range. */
  type?: "select" | "date"
  /** Extracts the value from a row used to match against the filter. */
  value: (row: T) => string | number | Date | null | undefined
  /** For "select": explicit options. If omitted, distinct values are derived from the data. */
  options?: { value: string; label: string }[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface TableProps<T = any> {
  columns: Column<T>[]
  data: T[]
  emptyMessage?: string
  keyField?: string
  onRowClick?: (row: T) => void
  compact?: boolean
  /** Optional per-row class names (e.g. status-based row tinting). */
  rowClassName?: (row: T) => string
  /** Show the search box. Default: true. */
  searchable?: boolean
  /** Placeholder for the search box. */
  searchPlaceholder?: string
  /** Extra dot-path keys to include when searching (e.g. "customer.name"). */
  searchKeys?: string[]
  /** Filter definitions surfaced behind the filter icon. */
  filters?: FilterDef<T>[]
  /** Rows per page. Default: 20. */
  pageSize?: number
  /** Show the page-size selector. Default: true when data exceeds the smallest option. */
  pageSizeOptions?: number[]
}

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc == null ? acc : (acc as Record<string, unknown>)[k]), obj)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Table<T extends Record<string, any>>({
  columns,
  data,
  emptyMessage = "No data found",
  keyField = "id",
  onRowClick,
  compact = false,
  rowClassName,
  searchable = true,
  searchPlaceholder = "Search…",
  searchKeys = [],
  filters = [],
  pageSize: initialPageSize = 20,
  pageSizeOptions = [20, 50, 100],
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [query, setQuery] = useState("")
  // select filters: key -> value ; date filters: key -> { from, to }
  const [filterState, setFilterState] = useState<Record<string, string | { from?: string; to?: string }>>({})
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

  // Close filter popover on outside click / Escape
  useEffect(() => {
    if (!filterOpen) return
    const onClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFilterOpen(false)
    document.addEventListener("mousedown", onClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [filterOpen])

  const colByKey = useMemo(() => Object.fromEntries(columns.map((c) => [c.key, c])), [columns])

  // Derive distinct options for select filters that didn't supply them
  const resolvedFilters = useMemo(
    () =>
      filters.map((f) => {
        if (f.type === "date" || f.options) return f
        const seen = new Set<string>()
        for (const row of data) {
          const v = f.value(row)
          if (v != null && v !== "") seen.add(String(v))
        }
        const options = [...seen].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }))
        return { ...f, options }
      }),
    [filters, data]
  )

  const activeFilterCount = useMemo(
    () =>
      Object.entries(filterState).filter(([, v]) =>
        typeof v === "string" ? v !== "" : Boolean(v && (v.from || v.to))
      ).length,
    [filterState]
  )

  // Build a lowercase haystack per row for searching
  const searchText = (row: T): string => {
    const parts: string[] = []
    for (const col of columns) {
      if (col.value) {
        const v = col.value(row)
        if (v != null) parts.push(String(v))
      } else {
        const v = row[col.key]
        if (v != null && typeof v !== "object") parts.push(String(v))
      }
    }
    for (const k of searchKeys) {
      const v = getPath(row, k)
      if (v != null && typeof v !== "object") parts.push(String(v))
    }
    return parts.join("  ").toLowerCase()
  }

  const filtered = useMemo(() => {
    let rows = data
    // Text search
    const q = query.trim().toLowerCase()
    if (q) rows = rows.filter((row) => searchText(row).includes(q))
    // Column filters
    for (const f of resolvedFilters) {
      const state = filterState[f.key]
      if (!state) continue
      if (f.type === "date") {
        const { from, to } = state as { from?: string; to?: string }
        if (!from && !to) continue
        rows = rows.filter((row) => {
          const raw = f.value(row)
          if (raw == null || raw === "") return false
          const t = new Date(raw as string | number | Date).getTime()
          if (Number.isNaN(t)) return false
          if (from && t < new Date(from).getTime()) return false
          if (to && t > new Date(to).getTime() + 86_399_999) return false
          return true
        })
      } else {
        const val = state as string
        if (!val) continue
        rows = rows.filter((row) => String(f.value(row) ?? "") === val)
      }
    }
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, query, filterState, resolvedFilters, columns, searchKeys])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
    setPage(1)
  }

  const getSortVal = (row: T, key: string) => {
    const col = colByKey[key]
    if (col?.value) return col.value(row)
    return row[key]
  }

  const sortedData = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      const aVal = getSortVal(a, sortKey)
      const bVal = getSortVal(b, sortKey)
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1
      const comparison =
        typeof aVal === "string" && typeof bVal === "string"
          ? aVal.localeCompare(bVal)
          : (aVal as number) > (bVal as number)
            ? 1
            : aVal === bVal
              ? 0
              : -1
      return sortDir === "asc" ? comparison : -comparison
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortDir])

  // Reset to first page whenever the result set shrinks below the current page
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize))
  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [page, totalPages])

  const pageData = sortedData.slice((page - 1) * pageSize, page * pageSize)

  const thClass = compact
    ? `px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider`
    : `px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider`
  const tdClass = compact ? `px-2 py-1.5 text-xs text-gray-900` : `px-4 py-3 text-sm text-gray-900`

  const showToolbar = searchable || resolvedFilters.length > 0

  const clearFilters = () => setFilterState({})

  return (
    <div>
      {showToolbar && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
          {searchable && (
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(1)
                }}
                placeholder={searchPlaceholder}
                className="block w-full rounded-md border border-gray-300 bg-white pl-9 pr-8 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="Clear search"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          )}

          {resolvedFilters.length > 0 && (
            <div className="relative ml-auto" ref={filterRef}>
              <button
                type="button"
                onClick={() => setFilterOpen((o) => !o)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm shadow-sm transition-colors ${
                  activeFilterCount > 0
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                <SlidersHorizontal size={15} />
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-medium text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {filterOpen && (
                <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">Filters</span>
                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="text-xs font-medium text-blue-600 hover:text-blue-800"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {resolvedFilters.map((f) => (
                      <div key={f.key}>
                        <label className="mb-1 block text-xs font-medium text-gray-600">{f.label}</label>
                        {f.type === "date" ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              value={(filterState[f.key] as { from?: string })?.from || ""}
                              onChange={(e) =>
                                setFilterState((s) => ({
                                  ...s,
                                  [f.key]: { ...(s[f.key] as object), from: e.target.value },
                                }))
                              }
                              className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-xs text-gray-400">to</span>
                            <input
                              type="date"
                              value={(filterState[f.key] as { to?: string })?.to || ""}
                              onChange={(e) =>
                                setFilterState((s) => ({
                                  ...s,
                                  [f.key]: { ...(s[f.key] as object), to: e.target.value },
                                }))
                              }
                              className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        ) : (
                          <select
                            value={(filterState[f.key] as string) || ""}
                            onChange={(e) => setFilterState((s) => ({ ...s, [f.key]: e.target.value }))}
                            className="block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">All</option>
                            {f.options?.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className={compact ? "w-full" : "overflow-x-auto"}>
        <table className="w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${thClass} ${col.sortable ? "cursor-pointer hover:bg-gray-100 select-none" : ""} ${col.className || ""}`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      <span className="text-gray-400">
                        {sortKey === col.key ? (
                          sortDir === "asc" ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )
                        ) : (
                          <ChevronsUpDown size={14} />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {pageData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-500">
                  {query || activeFilterCount > 0 ? "No matching records" : emptyMessage}
                </td>
              </tr>
            ) : (
              pageData.map((row, idx) => (
                <tr
                  key={String(row[keyField]) || idx}
                  className={`hover:bg-gray-50 transition-colors ${onRowClick ? "cursor-pointer" : ""} ${rowClassName?.(row) || ""}`}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`${tdClass} ${col.className || ""}`}>
                      {col.render ? col.render(row) : String(row[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {(sortedData.length > pageSize || totalPages > 1) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-gray-200">
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-500">
              {sortedData.length === 0
                ? "0 results"
                : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, sortedData.length)} of ${sortedData.length}`}
            </p>
            {pageSizeOptions.length > 0 && (
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(1)
                }}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Rows per page"
              >
                {pageSizeOptions.map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
