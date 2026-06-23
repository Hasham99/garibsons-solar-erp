"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"

interface PortalUser {
  name: string
  email: string
}
interface PortalCustomer {
  id: string
  name: string
  type?: string
}
interface PortalAuthValue {
  user: PortalUser | null
  customer: PortalCustomer | null
  loading: boolean
  refresh: () => void
}

const PortalAuthContext = createContext<PortalAuthValue>({
  user: null,
  customer: null,
  loading: true,
  refresh: () => {},
})

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PortalUser | null>(null)
  const [customer, setCustomer] = useState<PortalCustomer | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    fetch("/api/portal/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setUser(d.user || null)
        setCustomer(d.customer || null)
      })
      .catch(() => {
        setUser(null)
        setCustomer(null)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <PortalAuthContext.Provider value={{ user, customer, loading, refresh }}>
      {children}
    </PortalAuthContext.Provider>
  )
}

export function usePortalAuth() {
  return useContext(PortalAuthContext)
}
