"use client"

import type { Access, PermMap } from "@/lib/permissions/modules"
import { useAuthContext, type User } from "@/components/auth/AuthProvider"

export type { User }

/** Build an Access object from the auth user, for client-side `can()` checks. */
export function accessOf(user: { fullAccess?: boolean; perms?: PermMap } | null | undefined): Access {
  return { fullAccess: Boolean(user?.fullAccess), perms: user?.perms ?? {} }
}

/**
 * Returns the shared auth state. The actual fetch happens once in AuthProvider;
 * every consumer reads the same context (no duplicate `/api/auth/me` calls).
 */
export function useAuth() {
  return useAuthContext()
}
