import { getSession, type SessionData } from "@/lib/auth"
import { resolveAccess } from "./resolve"
import { can, type Access, type ModuleKey, type PermAction } from "./modules"

export interface AuthContext {
  session: SessionData
  access: Access
}

/**
 * Secure authorization for Route Handlers. Resolves the caller's access from
 * the DB (not the cookie) so reduced permissions take effect immediately.
 *
 * Returns either a ready-to-return `Response` (401/403) or an `AuthContext`.
 * Usage:
 *   const auth = await requireModule("delivery", "write")
 *   if (auth instanceof Response) return auth
 *   // ...use auth.session / auth.access
 */
export async function requireModule(
  module: ModuleKey,
  action: PermAction
): Promise<AuthContext | Response> {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) {
    return Response.json({ error: "Not authenticated" }, { status: 401 })
  }
  const access = await resolveAccess(session.userId)
  if (!can(access, module, action)) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  return { session: session as SessionData, access }
}

/** Require an authenticated session with no specific module. */
export async function requireAuth(): Promise<AuthContext | Response> {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) {
    return Response.json({ error: "Not authenticated" }, { status: 401 })
  }
  const access = await resolveAccess(session.userId)
  return { session: session as SessionData, access }
}

/** Require unrestricted (admin) access. */
export async function requireFullAccess(): Promise<AuthContext | Response> {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) {
    return Response.json({ error: "Not authenticated" }, { status: 401 })
  }
  const access = await resolveAccess(session.userId)
  if (!access.fullAccess) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  return { session: session as SessionData, access }
}
