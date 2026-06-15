/**
 * Backfills the granular permission system from the legacy hardcoded roles.
 *
 * Creates one Role per legacy UserRole enum value, mirroring exactly what each
 * role could see/do in the old sidebar, then assigns every existing user to the
 * matching role (ADMIN → Full Access). Idempotent: re-running updates role
 * permissions and only assigns users that don't yet have a role.
 *
 * Run:  DATABASE_URL=... npx tsx prisma/seed-roles.ts
 */
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// Every report view is its own module — granted read to everyone, mirroring the
// old "all reports visible" behaviour.
const REPORT_MODULES = [
  "reports.sales",
  "reports.receivables",
  "reports.collections",
  "reports.profitability",
  "reports.stockPosition",
  "reports.stockSummary",
  "reports.stockAging",
  "reports.poStatus",
  "reports.purchases",
]
// Modules everyone could see in the old UI (no write actions behind them).
const COMMON = ["costing", ...REPORT_MODULES]
const ALL_MASTER = ["masters.products", "masters.suppliers", "masters.customers", "masters.warehouses"]
// Read-only modules — never grant write (no write-guarded endpoints exist).
const READ_ONLY = new Set(["costing", ...REPORT_MODULES])

interface RoleSeed {
  enumValue: string
  title: string
  description: string
  fullAccess?: boolean
  isSystem?: boolean
  readOnly?: boolean // grant read-only (Viewer)
  modules: string[]
}

const ROLE_SEEDS: RoleSeed[] = [
  {
    enumValue: "ADMIN",
    title: "Admin",
    description: "Unrestricted access to every module and all data.",
    fullAccess: true,
    isSystem: true,
    modules: [],
  },
  {
    enumValue: "PROCUREMENT",
    title: "Procurement",
    description: "Purchase orders, stock and master data.",
    modules: [...COMMON, "procurement", "stock", ...ALL_MASTER],
  },
  {
    enumValue: "WAREHOUSE",
    title: "Warehouse",
    description: "Stock, delivery orders and master data.",
    modules: [...COMMON, "stock", "delivery", ...ALL_MASTER],
  },
  {
    enumValue: "SALES",
    title: "Sales",
    description: "Quotations, sales orders, delivery orders and master data.",
    modules: [...COMMON, "quotations", "sales", "delivery", ...ALL_MASTER],
  },
  {
    enumValue: "ACCOUNTS",
    title: "Accounts",
    description: "Sales, invoices, ledger, expenses and master data.",
    modules: [...COMMON, "sales", "invoices", "ledger", "expenses", ...ALL_MASTER],
  },
  {
    enumValue: "OPERATIONS",
    title: "Operations",
    description: "All operational modules (no master data or settings).",
    modules: [...COMMON, "procurement", "stock", "quotations", "sales", "delivery", "invoices", "ledger", "expenses"],
  },
  {
    enumValue: "CUSTOMER_MANAGER",
    title: "Customer Manager",
    description: "All operational modules plus customer master data.",
    modules: [
      ...COMMON,
      "procurement",
      "stock",
      "quotations",
      "sales",
      "delivery",
      "invoices",
      "ledger",
      "expenses",
      "masters.customers",
    ],
  },
  {
    enumValue: "VIEWER",
    title: "Viewer",
    description: "Read-only access to reports and master data.",
    readOnly: true,
    modules: [...COMMON, ...ALL_MASTER],
  },
]

function permRows(seed: RoleSeed) {
  return seed.modules.map((module) => ({
    module,
    canRead: true,
    canWrite: seed.readOnly ? false : !READ_ONLY.has(module),
  }))
}

async function main() {
  console.log("🔐 Seeding roles & permissions…")

  const byEnum: Record<string, { id: string }> = {}

  for (const seed of ROLE_SEEDS) {
    const rows = seed.fullAccess ? [] : permRows(seed)

    // Upsert the role, then replace its permissions so re-runs stay in sync.
    const role = await prisma.role.upsert({
      where: { title: seed.title },
      update: {
        description: seed.description,
        fullAccess: Boolean(seed.fullAccess),
        isSystem: Boolean(seed.isSystem),
      },
      create: {
        title: seed.title,
        description: seed.description,
        fullAccess: Boolean(seed.fullAccess),
        isSystem: Boolean(seed.isSystem),
      },
      select: { id: true },
    })

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } })
    if (rows.length) {
      await prisma.rolePermission.createMany({ data: rows.map((r) => ({ ...r, roleId: role.id })) })
    }

    byEnum[seed.enumValue] = role
    console.log(`  • ${seed.title} (${rows.length} modules${seed.fullAccess ? ", full access" : ""})`)
  }

  // Assign existing users to the role matching their legacy enum (don't clobber
  // anyone already migrated).
  const users = await prisma.user.findMany({ select: { id: true, name: true, role: true, roleId: true } })
  let assigned = 0
  for (const u of users) {
    if (u.roleId) continue
    const role = byEnum[u.role]
    if (!role) continue
    await prisma.user.update({
      where: { id: u.id },
      data: { roleId: role.id, fullAccess: u.role === "ADMIN" },
    })
    assigned++
    console.log(`  → ${u.name}: ${u.role}`)
  }

  console.log(`✅ Done. ${ROLE_SEEDS.length} roles, ${assigned} user(s) assigned.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
