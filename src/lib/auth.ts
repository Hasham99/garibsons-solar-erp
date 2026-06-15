import { getIronSession } from "iron-session"
import { cookies } from "next/headers"
import bcrypt from "bcryptjs"
import type { Access, PermMap } from "@/lib/permissions/modules"
import { SESSION_COOKIE_NAME, SESSION_PASSWORD } from "@/lib/session-config"

export interface SessionData {
  userId: string
  name: string
  email: string
  /** Role title (for display). Access control derives from fullAccess + perms. */
  role: string
  /** Unrestricted access — ignores per-module perms. */
  fullAccess?: boolean
  /** Resolved module permissions, cached on the cookie for optimistic checks. */
  perms?: PermMap
  /** When access was last verified against the DB (ms epoch) — throttles re-checks. */
  permsCheckedAt?: number
  isLoggedIn: boolean
}

export { SESSION_COOKIE_NAME, SESSION_PASSWORD }

export const SESSION_OPTIONS = {
  password: SESSION_PASSWORD,
  cookieName: SESSION_COOKIE_NAME,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
  },
}

export async function getSession() {
  const cookieStore = await cookies()
  const session = await getIronSession<SessionData>(cookieStore, SESSION_OPTIONS)
  return session
}

/** Build an Access object from session data (optimistic, cookie-based). */
export function sessionAccess(session: Pick<SessionData, "fullAccess" | "perms">): Access {
  return { fullAccess: Boolean(session.fullAccess), perms: session.perms ?? {} }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
