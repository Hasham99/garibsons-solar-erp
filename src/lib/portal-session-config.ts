/**
 * Portal (party) session cookie constants — NO server-only imports, so they can
 * be used from `proxy.ts` (which must not import `next/headers`) as well as the
 * server portal-session helpers. Kept fully separate from the staff session so a
 * party login can never reach the internal admin app and vice-versa.
 */
export const PORTAL_COOKIE_NAME = "garibsons-portal-session"
export const PORTAL_SESSION_PASSWORD =
  process.env.PORTAL_SESSION_SECRET ||
  process.env.SESSION_SECRET ||
  "garibsons-portal-secret-key-min-32-chars-long"
