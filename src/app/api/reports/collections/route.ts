import { prisma } from "@/lib/prisma"
import { parseFilters, dateRange, monthKey } from "@/lib/report-filters"

export async function GET(request: Request) {
  try {
    const f = parseFilters(request)
    const receipts = await prisma.customerReceipt.findMany({
      where: {
        ...(f.customerId ? { customerId: f.customerId } : {}),
        ...(f.bankId ? { bankId: f.bankId } : {}),
        ...(dateRange(f) ? { valueDate: dateRange(f) } : {}),
      },
      include: { customer: { select: { name: true } }, bank: { select: { name: true } } },
      orderBy: { valueDate: "desc" },
    })

    const byBank = new Map<string, { bank: string; total: number; count: number }>()
    const byMonth = new Map<string, { month: string; total: number; count: number }>()
    const byParty = new Map<string, { customer: string; total: number; count: number }>()
    for (const r of receipts) {
      const bk = r.bank?.name || "—"
      const b = byBank.get(bk) || { bank: bk, total: 0, count: 0 }; b.total += r.amount; b.count++; byBank.set(bk, b)
      const mk = monthKey(r.valueDate)
      const m = byMonth.get(mk) || { month: mk, total: 0, count: 0 }; m.total += r.amount; m.count++; byMonth.set(mk, m)
      const cn = r.customer?.name || "—"
      const p = byParty.get(cn) || { customer: cn, total: 0, count: 0 }; p.total += r.amount; p.count++; byParty.set(cn, p)
    }

    const rows = receipts.map((r) => ({
      id: r.id, receiptNo: r.receiptNo, date: r.valueDate, customer: r.customer?.name || "—",
      bank: r.bank?.name || "—", reference: r.reference, amount: r.amount,
    }))

    return Response.json({
      rows,
      summary: { count: receipts.length, total: receipts.reduce((s, r) => s + r.amount, 0) },
      byBank: [...byBank.values()].sort((a, b) => b.total - a.total),
      byParty: [...byParty.values()].sort((a, b) => b.total - a.total),
      byMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    })
  } catch (e) {
    console.error(e)
    return Response.json({ error: "Failed to build collections report" }, { status: 500 })
  }
}
