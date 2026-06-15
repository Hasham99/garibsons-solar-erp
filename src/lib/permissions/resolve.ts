import { cache } from "react"
import { prisma } from "@/lib/prisma"
import { isModuleKey, type Access, type PermMap } from "./modules"

/**
 * Resolve a user's effective access from the database.
 *
 * Effective access = the assigned role's default permissions, overridden
 * per-module by any UserPermission rows. `fullAccess` on either the user or
 * the role short-circuits to unrestricted access.
 *
 * Memoised per request via React `cache` so multiple guards in one request
 * hit the DB once.
 */
export const resolveAccess = cache(async (userId: string): Promise<Access> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      fullAccess: true,
      roleRef: {
        select: {
          fullAccess: true,
          permissions: { select: { module: true, canRead: true, canWrite: true } },
        },
      },
      permissions: { select: { module: true, canRead: true, canWrite: true } },
    },
  })

  if (!user) return { fullAccess: false, perms: {} }
  if (user.fullAccess || user.roleRef?.fullAccess) return { fullAccess: true, perms: {} }

  const perms: PermMap = {}

  // Role defaults first…
  for (const p of user.roleRef?.permissions ?? []) {
    if (!isModuleKey(p.module)) continue
    if (p.canRead || p.canWrite) perms[p.module] = { read: p.canRead, write: p.canWrite }
  }

  // …then per-user overrides replace the role default for that module.
  for (const p of user.permissions) {
    if (!isModuleKey(p.module)) continue
    if (p.canRead || p.canWrite) perms[p.module] = { read: p.canRead, write: p.canWrite }
    else delete perms[p.module] // explicit deny override
  }

  return { fullAccess: false, perms }
})
