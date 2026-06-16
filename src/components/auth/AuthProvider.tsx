"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import type { PermMap } from "@/lib/permissions/modules"

export interface User {
  id: string
  name: string
  email: string
  role: string
  fullAccess: boolean
  perms: PermMap
}

interface AuthValue {
  user: User | null
  loading: boolean
  /** Re-fetch the current user (e.g. after editing your own profile). */
  refresh: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

/**
 * Fetches the current user ONCE and shares it with every `useAuth()` consumer
 * via context. Previously each component fired its own `/api/auth/me`, causing
 * many redundant (and slow) auth requests per page and per navigation.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) setUser(d.user)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return <AuthContext.Provider value={{ user, loading, refresh }}>{children}</AuthContext.Provider>
}

export function useAuthContext(): AuthValue {
  const ctx = useContext(AuthContext)
  // Fallback when rendered outside the provider (e.g. print pages).
  return ctx ?? { user: null, loading: false, refresh: () => {} }
}
