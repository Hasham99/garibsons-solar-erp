import { MODULE_KEYS, type PermMap } from "./modules"

export interface PermRow {
  module: string
  canRead: boolean
  canWrite: boolean
}

/**
 * Diff the admin-chosen effective permissions for a user against the assigned
 * role's defaults, producing the minimal set of UserPermission override rows.
 *
 * - A module whose effective access equals the role default → no row (inherits).
 * - A module that differs → a row (granting extra access, or an explicit deny
 *   row `{false,false}` when the role grants but the user shouldn't have it).
 *
 * `resolveAccess` interprets a `{false,false}` row as an explicit deny.
 */
export function computeUserOverrides(
  roleRows: PermRow[],
  clientPerms: PermMap | undefined,
  fullAccess: boolean
): PermRow[] {
  if (fullAccess) return [] // full access ignores per-module perms entirely

  const roleMap: Record<string, { read: boolean; write: boolean }> = {}
  for (const r of roleRows) roleMap[r.module] = { read: r.canRead || r.canWrite, write: r.canWrite }

  const perms = clientPerms ?? {}
  const out: PermRow[] = []
  for (const key of MODULE_KEYS) {
    const rd = roleMap[key] ?? { read: false, write: false }
    const eff = perms[key] ?? { read: false, write: false }
    const effRead = Boolean(eff.read || eff.write) // write implies read
    const effWrite = Boolean(eff.write)
    if (effRead !== rd.read || effWrite !== rd.write) {
      out.push({ module: key, canRead: effRead, canWrite: effWrite })
    }
  }
  return out
}
