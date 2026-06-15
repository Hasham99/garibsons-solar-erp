import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/permissions/guard"

/**
 * One call for all shared master-data lists used to populate dropdowns across
 * the app (products, customers, suppliers, warehouses, banks, exchange rates,
 * tax configs, expense categories). Fetched once per session by LookupsProvider
 * and reused everywhere, instead of each page re-fetching 4–6 endpoints.
 *
 * Shapes mirror the individual `/api/<resource>` endpoints so consumers are
 * drop-in compatible.
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth

  try {
    const [products, customers, suppliers, warehouses, banks, exchangeRates, taxConfigs, expenseCategories] =
      await Promise.all([
        prisma.product.findMany({
          orderBy: { name: "asc" },
          include: { defaultSupplier: { select: { id: true, name: true } } },
        }),
        prisma.customer.findMany({
          orderBy: { name: "asc" },
          include: { contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } },
        }),
        prisma.supplier.findMany({ orderBy: { name: "asc" } }),
        prisma.warehouse.findMany({
          orderBy: { name: "asc" },
          include: { contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } },
        }),
        prisma.bank.findMany({ orderBy: { name: "asc" } }),
        prisma.exchangeRate.findMany({ orderBy: { date: "desc" } }),
        prisma.taxConfig.findMany({ orderBy: { createdAt: "desc" } }),
        prisma.expenseCategoryDef.findMany({ where: { active: true }, orderBy: [{ isSystem: "desc" }, { name: "asc" }] }),
      ])

    return Response.json({ products, customers, suppliers, warehouses, banks, exchangeRates, taxConfigs, expenseCategories })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch lookups" }, { status: 500 })
  }
}
