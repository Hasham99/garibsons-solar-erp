import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getIronSession } from "iron-session"
import { SESSION_COOKIE_NAME, SESSION_PASSWORD } from "@/lib/session-config"
import {
  can,
  hasAnyReportAccess,
  moduleForPath,
  reportModuleForView,
  type Access,
  type PermMap,
} from "@/lib/permissions/modules"

const SESSION_OPTIONS = {
  password: SESSION_PASSWORD,
  cookieName: SESSION_COOKIE_NAME,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
  },
}

interface ProxySession {
  userId?: string
  isLoggedIn?: boolean
  fullAccess?: boolean
  perms?: PermMap
}

const publicPaths = ["/login", "/api/auth/login"]

/**
 * Optimistic auth + module-boundary gating (Next.js 16 Proxy, Node runtime).
 *
 * Reads only the sealed session cookie (no DB) so it stays fast on every
 * navigation. The authoritative permission checks live in the API route
 * guards and `/api/auth/me`.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Allow static files and Next.js internals
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.includes(".")) {
    return NextResponse.next()
  }

  const response = NextResponse.next()

  try {
    const session = await getIronSession<ProxySession>(request, response, SESSION_OPTIONS)

    if (!session.isLoggedIn || !session.userId) {
      if (pathname.startsWith("/api/")) {
        return Response.json({ error: "Unauthorized" }, { status: 401 })
      }
      return NextResponse.redirect(new URL("/login", request.url))
    }

    // Module-level boundary for page routes. API routes enforce their own
    // (secure, DB-backed) checks, so we don't gate them here.
    if (!pathname.startsWith("/api/")) {
      const access: Access = { fullAccess: Boolean(session.fullAccess), perms: session.perms ?? {} }
      const deny = (key: string) => {
        const url = new URL("/", request.url)
        url.searchParams.set("denied", key)
        return NextResponse.redirect(url)
      }

      if (pathname === "/reports" || pathname.startsWith("/reports/")) {
        // Each report view is its own module; a bare /reports needs any report.
        const view = request.nextUrl.searchParams.get("view")
        if (view) {
          const mod = reportModuleForView(view)
          if (mod && !can(access, mod, "read")) return deny(mod)
        } else if (!hasAnyReportAccess(access)) {
          return deny("reports")
        }
      } else {
        const moduleKey = moduleForPath(pathname)
        if (moduleKey && !can(access, moduleKey, "read")) return deny(moduleKey)
      }
    }
  } catch {
    if (pathname.startsWith("/api/")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
