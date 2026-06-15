/**
 * Canonical registry of ERP modules and the single source of truth for
 * access control. Consumed by the sidebar, command palette, proxy (route
 * gating) and API guards so every surface agrees on what a module is.
 *
 * This file is intentionally free of server-only imports so it can be used
 * from client components as well.
 */

export type ModuleKey =
  | "costing"
  | "procurement"
  | "stock"
  | "quotations"
  | "sales"
  | "delivery"
  | "invoices"
  | "ledger"
  | "expenses"
  | "reports.sales"
  | "reports.receivables"
  | "reports.collections"
  | "reports.profitability"
  | "reports.stockPosition"
  | "reports.stockSummary"
  | "reports.stockAging"
  | "reports.poStatus"
  | "reports.purchases"
  | "masters.products"
  | "masters.suppliers"
  | "masters.customers"
  | "masters.warehouses"
  | "settings.users"
  | "settings.roles"
  | "settings.taxConfigs"
  | "settings.exchangeRates"
  | "settings.banks"

export type PermAction = "read" | "write"

export interface ModulePerm {
  read: boolean
  write: boolean
}

/** module key -> permission. Absent key means "no access". */
export type PermMap = Record<string, ModulePerm>

/** The resolved access of a user, used everywhere we gate. */
export interface Access {
  fullAccess: boolean
  perms: PermMap
}

export interface ModuleDef {
  key: ModuleKey
  label: string
  section: string
}

/** Section display order. */
export const SECTIONS = [
  "Overview",
  "Procurement",
  "Sales",
  "Finance",
  "Reports",
  "Master Data",
  "Settings",
] as const

/**
 * Every permission-controlled module. The dashboard is intentionally NOT here:
 * it is the landing page and is always available to any authenticated user.
 */
export const MODULES: ModuleDef[] = [
  { key: "costing", label: "Costing Calculator", section: "Overview" },

  { key: "procurement", label: "Purchase Orders", section: "Procurement" },
  { key: "stock", label: "Stock Register", section: "Procurement" },

  { key: "quotations", label: "Quotations", section: "Sales" },
  { key: "sales", label: "Sales Orders", section: "Sales" },
  { key: "delivery", label: "Delivery Orders", section: "Sales" },
  { key: "invoices", label: "Invoices", section: "Sales" },

  { key: "ledger", label: "Party Ledger", section: "Finance" },
  { key: "expenses", label: "Expenses", section: "Finance" },

  { key: "reports.sales", label: "Sales Report", section: "Reports" },
  { key: "reports.receivables", label: "Receivables Report", section: "Reports" },
  { key: "reports.collections", label: "Collections Report", section: "Reports" },
  { key: "reports.profitability", label: "Profitability Report", section: "Reports" },
  { key: "reports.stockPosition", label: "Stock Position Report", section: "Reports" },
  { key: "reports.stockSummary", label: "Stock Summary Report", section: "Reports" },
  { key: "reports.stockAging", label: "Stock Aging Report", section: "Reports" },
  { key: "reports.poStatus", label: "PO Status Report", section: "Reports" },
  { key: "reports.purchases", label: "Purchases Report", section: "Reports" },

  { key: "masters.products", label: "Products", section: "Master Data" },
  { key: "masters.suppliers", label: "Suppliers", section: "Master Data" },
  { key: "masters.customers", label: "Customers", section: "Master Data" },
  { key: "masters.warehouses", label: "Warehouses", section: "Master Data" },

  { key: "settings.users", label: "Users", section: "Settings" },
  { key: "settings.roles", label: "Roles & Permissions", section: "Settings" },
  { key: "settings.taxConfigs", label: "Tax Configs", section: "Settings" },
  { key: "settings.exchangeRates", label: "Exchange Rates", section: "Settings" },
  { key: "settings.banks", label: "Banks", section: "Settings" },
]

export const MODULE_KEYS: ModuleKey[] = MODULES.map((m) => m.key)
const MODULE_KEY_SET = new Set<string>(MODULE_KEYS)

export function isModuleKey(value: string): value is ModuleKey {
  return MODULE_KEY_SET.has(value)
}

export function modulesBySection(): Record<string, ModuleDef[]> {
  const grouped: Record<string, ModuleDef[]> = {}
  for (const section of SECTIONS) grouped[section] = []
  for (const m of MODULES) (grouped[m.section] ||= []).push(m)
  return grouped
}

/* ------------------------------------------------------------------ */
/* Pure access helpers (no DB, no server APIs)                         */
/* ------------------------------------------------------------------ */

export function emptyPermMap(): PermMap {
  return {}
}

export function noAccess(): Access {
  return { fullAccess: false, perms: {} }
}

/** Whether `access` permits `action` on `module`. Write implies read. */
export function can(access: Access | null | undefined, module: ModuleKey, action: PermAction): boolean {
  if (!access) return false
  if (access.fullAccess) return true
  const p = access.perms[module]
  if (!p) return false
  return action === "write" ? p.write : p.read || p.write
}

export const canRead = (access: Access | null | undefined, module: ModuleKey) => can(access, module, "read")
export const canWrite = (access: Access | null | undefined, module: ModuleKey) => can(access, module, "write")

/* ------------------------------------------------------------------ */
/* Path -> module mapping (page routes), used by proxy + page guards    */
/* ------------------------------------------------------------------ */

/**
 * Ordered so the most specific prefixes win. A page path that maps to a module
 * requires READ on that module. Paths not listed here (e.g. "/", profile pages)
 * are open to any authenticated user.
 */
const PAGE_RULES: Array<{ prefix: string; module: ModuleKey }> = [
  { prefix: "/costing", module: "costing" },
  { prefix: "/procurement", module: "procurement" },
  { prefix: "/stock", module: "stock" },
  { prefix: "/quotations", module: "quotations" },
  { prefix: "/sales", module: "sales" },
  { prefix: "/delivery", module: "delivery" },
  { prefix: "/invoices", module: "invoices" },
  { prefix: "/ledger", module: "ledger" },
  { prefix: "/expenses", module: "expenses" },
  // "/reports" is handled separately (per ?view=) via reportModuleForView().
  { prefix: "/masters/products", module: "masters.products" },
  { prefix: "/masters/suppliers", module: "masters.suppliers" },
  { prefix: "/masters/customers", module: "masters.customers" },
  { prefix: "/masters/warehouses", module: "masters.warehouses" },
  { prefix: "/settings/users", module: "settings.users" },
  { prefix: "/settings/roles", module: "settings.roles" },
  { prefix: "/settings/tax-configs", module: "settings.taxConfigs" },
  { prefix: "/settings/exchange-rates", module: "settings.exchangeRates" },
  { prefix: "/settings/banks", module: "settings.banks" },
]

/** Returns the module a page path belongs to, or null if it's unrestricted. */
export function moduleForPath(pathname: string): ModuleKey | null {
  // Normalise trailing slash (except root)
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
  for (const rule of PAGE_RULES) {
    if (path === rule.prefix || path.startsWith(rule.prefix + "/")) return rule.module
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Reports — each report view is its own module                        */
/* ------------------------------------------------------------------ */

/** Report shown by /reports when no ?view= is present. */
export const DEFAULT_REPORT_VIEW = "outstanding"

/** Maps a report's ?view= key to its module. */
export const REPORT_VIEW_TO_MODULE: Record<string, ModuleKey> = {
  sales: "reports.sales",
  outstanding: "reports.receivables",
  collections: "reports.collections",
  profit: "reports.profitability",
  stockPosition: "reports.stockPosition",
  stock: "reports.stockSummary",
  stockAging: "reports.stockAging",
  poStatus: "reports.poStatus",
  purchases: "reports.purchases",
}

export const REPORT_MODULE_KEYS: ModuleKey[] = Object.values(REPORT_VIEW_TO_MODULE)

/** The module for a given report view (defaults to the landing report). */
export function reportModuleForView(view: string | null | undefined): ModuleKey | null {
  return REPORT_VIEW_TO_MODULE[view || DEFAULT_REPORT_VIEW] ?? null
}

/** Whether the user can read at least one report (used to gate bare /reports). */
export function hasAnyReportAccess(access: Access | null | undefined): boolean {
  if (!access) return false
  if (access.fullAccess) return true
  return REPORT_MODULE_KEYS.some((m) => access.perms[m]?.read || access.perms[m]?.write)
}
