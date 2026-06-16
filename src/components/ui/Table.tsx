"use client"

import { ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, SlidersHorizontal, X, Inbox, SearchX } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Column<T = any> {
  key: string
  header: string
  render?: (row: T) => ReactNode
  sortable?: boolean
  className?: string
  /**
   * Marks this as a numeric column — renders its cells in the tabular mono
   * figure font (Space Mono) so amounts/quantities line up cleanly.
   */
  numeric?: boolean
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
  /** Reports the rows currently visible after search + filters + sort (all pages).
   *  Lets pages export exactly what the user is looking at. */
  onFilteredChange?: (rows: T[]) => void
  /** Initial sort column (use with defaultSortDir, e.g. newest dates first). */
  defaultSortKey?: string
  defaultSortDir?: "asc" | "desc"
}

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc == null ? acc : (acc as Record<string, unknown>)[k]), obj)
}

interface PersistedTableState {
  pageSize?: number
  filterState?: Record<string, string | { from?: string; to?: string }>
}

function readTableState(key: string | null): PersistedTableState | null {
  if (!key) return null
  try {
    return JSON.parse(localStorage.getItem(key) || "null")
  } catch {
    return null
  }
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
  onFilteredChange,
  defaultSortKey,
  defaultSortDir = "desc",
}: TableProps<T>) {
  // Filters and page size persist per table (keyed by URL + column set) so
  // every page reopens the way the user left it. Tables only mount client-side
  // (pages render skeletons while data loads), so reading localStorage in the
  // lazy initializers is hydration-safe.
  const persistKey =
    typeof window === "undefined"
      ? null
      : `gbs-table:${window.location.pathname}${window.location.search}:${columns.map((c) => c.key).join("|")}`

  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortKey ? defaultSortDir : "asc")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => readTableState(persistKey)?.pageSize ?? initialPageSize)
  const [query, setQuery] = useState("")
  // select filters: key -> value ; date filters: key -> { from, to }
  const [filterState, setFilterState] = useState<Record<string, string | { from?: string; to?: string }>>(
    () => readTableState(persistKey)?.filterState ?? {}
  )
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!persistKey) return
    localStorage.setItem(persistKey, JSON.stringify({ pageSize, filterState }))
  }, [persistKey, pageSize, filterState])

  // "/" focuses the table search from anywhere on the page
  useEffect(() => {
    if (!searchable) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return
      const t = e.target as HTMLElement
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [searchable])

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

  // Report the filtered+sorted view to the parent (for filter-aware exports).
  useEffect(() => {
    onFilteredChange?.(sortedData)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedData])

  // Reset to first page whenever the result set shrinks below the current page
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize))
  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [page, totalPages])

  const pageData = sortedData.slice((page - 1) * pageSize, page * pageSize)

  // Stable, guaranteed-unique row keys. Some datasets key by a non-unique field
  // (e.g. a report grouped by product name where missing names all read "—"),
  // which would otherwise trigger React "duplicate key" warnings.
  const rowKeys = (() => {
    const seen = new Map<string, number>()
    return pageData.map((row, idx) => {
      const raw = row[keyField]
      const base = raw != null && raw !== "" ? String(raw) : `row-${idx}`
      const count = seen.get(base) ?? 0
      seen.set(base, count + 1)
      return count === 0 ? base : `${base}__${count}`
    })
  })()

  const thClass = compact
    ? `px-2 py-2 text-left text-xs font-medium text-secondary uppercase tracking-wider`
    : `px-3 py-2 text-left text-[10px] font-semibold text-secondary uppercase tracking-wide whitespace-nowrap`
  const tdClass = compact ? `px-2 py-1.5 text-xs text-foreground` : `px-3 py-2 text-[12px] text-foreground`

  const showToolbar = searchable || resolvedFilters.length > 0

  const clearFilters = () => setFilterState({})

  return (
    <div>
      {showToolbar && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
          {searchable && (
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary pointer-events-none" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(1)
                }}
                placeholder={searchPlaceholder}
                className="block w-full rounded-lg border border-line-strong bg-surface pl-9 pr-8 py-1.5 text-[13px] shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-tertiary hover:text-secondary"
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
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] shadow-sm transition-colors ${
                  activeFilterCount > 0
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                    : "border-line-strong bg-surface text-secondary hover:bg-muted"
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

              <AnimatePresence>
              {filterOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className="absolute right-0 z-20 mt-2 w-72 origin-top-right rounded-xl border border-line bg-elevated p-4 shadow-pop">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">Filters</span>
                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-300"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {resolvedFilters.map((f) => (
                      <div key={f.key}>
                        <label className="mb-1 block text-xs font-medium text-secondary">{f.label}</label>
                        {f.type === "date" ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="w-10 shrink-0 text-xs text-tertiary">From</span>
                              <input
                                type="date"
                                value={(filterState[f.key] as { from?: string })?.from || ""}
                                onChange={(e) =>
                                  setFilterState((s) => ({
                                    ...s,
                                    [f.key]: { ...(s[f.key] as object), from: e.target.value },
                                  }))
                                }
                                className="block w-full min-w-0 rounded-md border border-line-strong px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-10 shrink-0 text-xs text-tertiary">To</span>
                              <input
                                type="date"
                                value={(filterState[f.key] as { to?: string })?.to || ""}
                                onChange={(e) =>
                                  setFilterState((s) => ({
                                    ...s,
                                    [f.key]: { ...(s[f.key] as object), to: e.target.value },
                                  }))
                                }
                                className="block w-full min-w-0 rounded-md border border-line-strong px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                        ) : (
                          <select
                            value={(filterState[f.key] as string) || ""}
                            onChange={(e) => setFilterState((s) => ({ ...s, [f.key]: e.target.value }))}
                            className="block w-full rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                </motion.div>
              )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* Mobile: rows render as stacked label/value cards — squeezed tables are unreadable on phones */}
      {!compact && pageData.length > 0 && (
        <div className="md:hidden divide-y divide-line">
          {pageData.map((row, idx) => (
            <div
              key={rowKeys[idx]}
              className={`px-4 py-3 space-y-2 ${onRowClick ? "cursor-pointer active:bg-muted" : ""} ${rowClassName?.(row) || ""}`}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <div key={col.key} className="flex items-start justify-between gap-3">
                  <span className="shrink-0 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-tertiary">
                    {col.header}
                  </span>
                  <div className={`min-w-0 text-right text-[13px] text-foreground ${col.numeric ? "tabular-nums" : ""}`}>
                    {col.render ? col.render(row) : String(row[col.key] ?? "")}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className={`${compact ? "w-full" : "overflow-x-auto"} ${!compact && pageData.length > 0 ? "hidden md:block" : ""}`}>
        <table className="w-full divide-y divide-line">
          <thead className="bg-muted">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${thClass} ${col.sortable ? "cursor-pointer hover:bg-muted select-none" : ""} ${col.className || ""}`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      <span className="text-tertiary">
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
          <tbody
            key={`${page}-${pageSize}-${query}-${sortKey}-${sortDir}`}
            className="bg-surface divide-y divide-line animate-fade-in"
          >
            {pageData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-14">
                  <div className="flex flex-col items-center gap-2.5 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-tertiary">
                      {query || activeFilterCount > 0 ? <SearchX size={22} /> : <Inbox size={22} />}
                    </span>
                    <p className="text-sm font-medium text-secondary">
                      {query || activeFilterCount > 0 ? "No matching records" : emptyMessage}
                    </p>
                    {(query || activeFilterCount > 0) && (
                      <p className="text-xs text-tertiary">Try adjusting your search or clearing the filters.</p>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              pageData.map((row, idx) => (
                <tr
                  key={rowKeys[idx]}
                  className={`hover:bg-blue-50/40 dark:hover:bg-blue-500/10 transition-colors duration-150 ${onRowClick ? "cursor-pointer" : ""} ${rowClassName?.(row) || "bg-surface"}`}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`${tdClass} ${col.numeric ? "tabular-nums" : ""} ${col.className || ""}`}>
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
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-line">
          <div className="flex items-center gap-3">
            <p className="text-sm text-secondary">
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
                className="rounded-md border border-line-strong bg-surface px-2 py-1 text-xs text-secondary focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-line rounded-lg bg-surface shadow-sm hover:bg-muted hover:border-line-strong active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-muted disabled:text-tertiary disabled:hover:border-line disabled:active:scale-100 transition-all"
            >
              <ChevronUp size={14} className="-rotate-90" />
              Previous
            </button>
            <span className="text-sm text-secondary tabular-nums">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-line rounded-lg bg-surface shadow-sm hover:bg-muted hover:border-line-strong active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-muted disabled:text-tertiary disabled:hover:border-line disabled:active:scale-100 transition-all"
            >
              Next
              <ChevronUp size={14} className="rotate-90" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
