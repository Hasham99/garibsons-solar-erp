"use client"

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react"

type Refresher = () => void

interface RefreshValue {
  /** Register a refetch fn (returns an unregister cleanup). Used by useFetch. */
  register: (fn: Refresher) => () => void
  /** Invoke every registered refetch — wired to the TopBar refresh button. */
  refreshAll: () => void
  /** True briefly after refreshAll so the button can spin. */
  refreshing: boolean
}

const RefreshContext = createContext<RefreshValue | null>(null)

/**
 * A page-wide refresh registry. Every `useFetch` on the current page registers
 * its `refetch` here, so the single refresh button in the TopBar can re-pull
 * whatever the page loaded — list pages and detail/form pages alike — without
 * any per-page wiring.
 */
export function RefreshProvider({ children }: { children: ReactNode }) {
  const refreshers = useRef<Set<Refresher>>(new Set())
  const [refreshing, setRefreshing] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const register = useCallback((fn: Refresher) => {
    refreshers.current.add(fn)
    return () => {
      refreshers.current.delete(fn)
    }
  }, [])

  const refreshAll = useCallback(() => {
    refreshers.current.forEach((fn) => {
      try {
        fn()
      } catch {
        /* one page's refetch failing shouldn't block the rest */
      }
    })
    // The refetches are fire-and-forget, so spin briefly for visible feedback.
    setRefreshing(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setRefreshing(false), 600)
  }, [])

  return (
    <RefreshContext.Provider value={{ register, refreshAll, refreshing }}>{children}</RefreshContext.Provider>
  )
}

/** Safe outside the provider: register/refreshAll become no-ops. */
export function useRefreshRegistry(): RefreshValue {
  return useContext(RefreshContext) ?? { register: () => () => {}, refreshAll: () => {}, refreshing: false }
}
