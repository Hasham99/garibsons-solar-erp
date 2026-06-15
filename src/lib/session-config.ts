/**
 * Session cookie constants with NO server-only imports, so they can be used
 * from `proxy.ts` (which must not import `next/headers`) as well as from the
 * server `auth.ts` helpers.
 */
export const SESSION_COOKIE_NAME = "garibsons-erp-session"
export const SESSION_PASSWORD =
  process.env.SESSION_SECRET || "garibsons-erp-secret-key-min-32-chars-long"
