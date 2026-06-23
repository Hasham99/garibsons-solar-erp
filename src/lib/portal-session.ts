import { getIronSession } from "iron-session"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { PORTAL_COOKIE_NAME, PORTAL_SESSION_PASSWORD } from "@/lib/portal-session-config"

export interface PortalSessionData {
  customerUserId: string
  customerId: string
  name: string
  email: string
  isLoggedIn: boolean
}

export const PORTAL_SESSION_OPTIONS = {
  password: PORTAL_SESSION_PASSWORD,
  cookieName: PORTAL_COOKIE_NAME,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
  },
}

export async function getPortalSession() {
  const cookieStore = await cookies()
  return getIronSession<PortalSessionData>(cookieStore, PORTAL_SESSION_OPTIONS)
}

export interface PortalContext {
  session: PortalSessionData
}

/**
 * Authorize a portal (party) request. Verifies the sealed cookie AND that the
 * CustomerUser is still active (so deactivation takes effect immediately).
 * Returns a ready-to-return 401 `Response` or a `PortalContext`.
 */
export async function requirePortal(): Promise<PortalContext | Response> {
  const session = await getPortalSession()
  if (!session.isLoggedIn || !session.customerUserId) {
    return Response.json({ error: "Not authenticated" }, { status: 401 })
  }
  const user = await prisma.customerUser.findUnique({
    where: { id: session.customerUserId },
    select: { active: true, customerId: true },
  })
  if (!user || !user.active) {
    return Response.json({ error: "Account disabled" }, { status: 401 })
  }
  // Trust the customerId from the DB (not the cookie) as the source of truth.
  return { session: { ...session, customerId: user.customerId } }
}
