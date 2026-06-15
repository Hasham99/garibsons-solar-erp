"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"

/* Lists are intentionally loosely typed here; each consuming page casts to its
   own option interface when it reads them. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Lookups {
  products: any[]
  customers: any[]
  suppliers: any[]
  warehouses: any[]
  banks: any[]
  exchangeRates: any[]
  taxConfigs: any[]
  expenseCategories: any[]
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const EMPTY: Lookups = {
  products: [],
  customers: [],
  suppliers: [],
  warehouses: [],
  banks: [],
  exchangeRates: [],
  taxConfigs: [],
  expenseCategories: [],
}

interface LookupsValue extends Lookups {
  loading: boolean
  refresh: () => void
}

const LookupsContext = createContext<LookupsValue | null>(null)

/**
 * Fetches all shared master-data lists ONCE per session and shares them with
 * every page, instead of each page re-fetching products/customers/suppliers/
 * warehouses/banks/etc. on mount. Refreshes when the tab regains focus (after
 * 30s) to pick up edits, and exposes `refresh()` for explicit invalidation.
 */
export function LookupsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Lookups>(EMPTY)
  const [loading, setLoading] = useState(true)
  const fetchedAt = useRef(0)

  const refresh = useCallback(() => {
    fetch("/api/lookups")
      .then((r) => r.json())
      .then((d) => {
        if (d && !d.error) {
          setData(d)
          fetchedAt.current = Date.now()
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - fetchedAt.current > 30_000) refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [refresh])

  return <LookupsContext.Provider value={{ ...data, loading, refresh }}>{children}</LookupsContext.Provider>
}

export function useLookups(): LookupsValue {
  return useContext(LookupsContext) ?? { ...EMPTY, loading: false, refresh: () => {} }
}
