import { prisma } from "@/lib/prisma"

export type LedgerRow = {
  id: string
  date: string
  type: "SO" | "DO" | "PARTIAL" | "RECEIPT"
  reference: string
  soNumber?: string
  doNumber?: string
  description: string
  qtyTotal: number
  qtyDelivered: number
  qtyRemaining: number
  debit: number
  credit: number
  customerId: string
  customerName: string
  soId?: string
  doId?: string
  receipt?: {
    id: string
    receiptNo: string
    bankId: string
    bankName: string
    amount: number
    reference: string | null
    valueDate: string
    whatsappDate: string | null
    notes: string | null
  }
  runningBalance?: number
}

export interface LedgerResult {
  rows: (LedgerRow & { runningBalance: number })[]
  totalDebits: number
  totalCredits: number
  balance: number
}

/**
 * Build a party (or all-parties) ledger from Sales Orders, Delivery Orders and
 * Customer Receipts. Running balance is computed over the full history before
 * any date filter, so a filtered window still shows true balances.
 *
 * Shared by the staff `/api/ledger` route and the party portal (which forces
 * `customerId` to the logged-in party).
 */
export async function computeLedger(opts: {
  customerId?: string | null
  from?: string | null
  to?: string | null
}): Promise<LedgerResult> {
  const { customerId, from, to } = opts

  const salesOrders = await prisma.salesOrder.findMany({
    where: { ...(customerId ? { customerId } : {}), status: { not: "CANCELLED" } },
    include: {
      customer: { select: { id: true, name: true } },
      lines: { include: { product: { select: { name: true } } } },
      deliveryOrders: {
        where: { status: { not: "CANCELLED" } },
        include: { lines: { include: { product: { select: { name: true } } } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  })

  const receipts = await prisma.customerReceipt.findMany({
    where: customerId ? { customerId } : {},
    include: { customer: { select: { id: true, name: true } }, bank: { select: { name: true } } },
    orderBy: { valueDate: "asc" },
  })

  const rows: LedgerRow[] = []

  const compactName = (name: string) => name.replace(/\s*-\s*/g, "-")
  const lineDesc = (name: string, qty: number, rate: number) =>
    `${compactName(name)} ${qty.toLocaleString()} pcs${rate > 0 ? ` @${rate.toFixed(2)}` : ""}`

  for (const so of salesOrders) {
    const soQty = so.lines.reduce((s, l) => s + l.quantity, 0)
    const doQty = so.deliveryOrders.reduce((s, d) => s + d.quantity, 0)
    const remaining = soQty - doQty

    const soDesc =
      so.lines.map((l) => lineDesc(l.product.name, l.quantity, l.ratePerWatt)).join(" · ") ||
      `Sales Order · ${soQty} panels`
    const rateBySoLine = new Map(so.lines.map((l) => [l.id, l.ratePerWatt]))
    const fallbackRate = so.lines[0]?.ratePerWatt ?? 0
    const doDesc = (doItem: (typeof so.deliveryOrders)[number]) =>
      doItem.lines
        .map((l) => lineDesc(l.product.name, l.quantity, (l.soLineId ? rateBySoLine.get(l.soLineId) : undefined) ?? fallbackRate))
        .join(" · ") || `${doItem.quantity} panels`

    const party = { customerId: so.customer.id, customerName: so.customer.name }

    if (doQty === 0) {
      rows.push({
        id: so.id,
        date: so.createdAt.toISOString(),
        type: "SO",
        reference: so.soNumber,
        soNumber: so.soNumber,
        description: soDesc,
        qtyTotal: soQty,
        qtyDelivered: 0,
        qtyRemaining: soQty,
        debit: so.grandTotal,
        credit: 0,
        ...party,
        soId: so.id,
      })
    } else if (remaining > 0) {
      for (const doItem of so.deliveryOrders) {
        rows.push({
          id: doItem.id,
          date: doItem.createdAt.toISOString(),
          type: "DO",
          reference: doItem.doNumber,
          soNumber: so.soNumber,
          doNumber: doItem.doNumber,
          description: doDesc(doItem),
          qtyTotal: soQty,
          qtyDelivered: doItem.quantity,
          qtyRemaining: 0,
          debit: 0,
          credit: 0,
          ...party,
          soId: so.id,
          doId: doItem.id,
        })
      }
      rows.push({
        id: `${so.id}-remaining`,
        date: so.createdAt.toISOString(),
        type: "PARTIAL",
        reference: so.soNumber,
        soNumber: so.soNumber,
        description: `${soDesc} · ${remaining} pcs remaining`,
        qtyTotal: soQty,
        qtyDelivered: doQty,
        qtyRemaining: remaining,
        debit: so.grandTotal,
        credit: 0,
        ...party,
        soId: so.id,
      })
    } else {
      so.deliveryOrders.forEach((doItem, idx) => {
        rows.push({
          id: doItem.id,
          date: doItem.createdAt.toISOString(),
          type: "DO",
          reference: doItem.doNumber,
          soNumber: so.soNumber,
          doNumber: doItem.doNumber,
          description: doDesc(doItem),
          qtyTotal: soQty,
          qtyDelivered: doItem.quantity,
          qtyRemaining: 0,
          debit: idx === 0 ? so.grandTotal : 0,
          credit: 0,
          ...party,
          soId: so.id,
          doId: doItem.id,
        })
      })
    }
  }

  for (const r of receipts) {
    rows.push({
      id: r.id,
      date: r.valueDate.toISOString(),
      type: "RECEIPT",
      reference: r.receiptNo,
      description: `Collection — ${r.bank.name}${r.reference ? ` · Ref: ${r.reference}` : ""}`,
      qtyTotal: 0,
      qtyDelivered: 0,
      qtyRemaining: 0,
      debit: 0,
      credit: r.amount,
      customerId: r.customer.id,
      customerName: r.customer.name,
      receipt: {
        id: r.id,
        receiptNo: r.receiptNo,
        bankId: r.bankId,
        bankName: r.bank.name,
        amount: r.amount,
        reference: r.reference,
        valueDate: r.valueDate.toISOString(),
        whatsappDate: r.whatsappDate ? r.whatsappDate.toISOString() : null,
        notes: r.notes,
      },
    })
  }

  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  let runningBalance = 0
  let ledger = rows.map((row) => {
    runningBalance += row.debit - row.credit
    return { ...row, runningBalance }
  })

  if (from || to) {
    const fromT = from ? new Date(from).getTime() : -Infinity
    const toT = to ? new Date(to).getTime() + 86_399_999 : Infinity
    ledger = ledger.filter((r) => {
      const t = new Date(r.date).getTime()
      return t >= fromT && t <= toT
    })
  }

  const totalDebits = ledger.reduce((s, r) => s + r.debit, 0)
  const totalCredits = ledger.reduce((s, r) => s + r.credit, 0)

  return { rows: ledger, totalDebits, totalCredits, balance: totalDebits - totalCredits }
}
