"use client"

import { useState, useEffect } from "react"
import type { Access, PermMap } from "@/lib/permissions/modules"

export interface User {
  id: string
  name: string
  email: string
  role: string
  fullAccess: boolean
  perms: PermMap
}

/** Build an Access object from the auth user, for client-side `can()` checks. */
export function accessOf(user: { fullAccess?: boolean; perms?: PermMap } | null | undefined): Access {
  return { fullAccess: Boolean(user?.fullAccess), perms: user?.perms ?? {} }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) setUser(data.user)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return { user, loading }
}
