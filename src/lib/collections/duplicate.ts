import { prisma } from "@/lib/prisma"
import { normalizeReferenceKey } from "./reference"

export interface DuplicateMatch {
  id: string
  receiptNo: string
  customerId: string
  customerName: string
  bankName: string
  amount: number
  reference: string | null
  valueDate: string // ISO
  /** Always true here — every match shares the same bank + reference + amount. */
  amountMatches: boolean
}

export interface DuplicateResult {
  referenceKey: string | null
  matches: DuplicateMatch[]
  /** Whether any duplicate was found (bank + reference + amount all match). */
  strong: boolean
}

/**
 * Find existing receipts that duplicate an incoming one, keyed on
 * **bank + normalized reference + amount** — all three must match. Reference
 * numbers are not unique in this system (staff use labels like "IBFT"/"RAAST"),
 * so the amount is required to distinguish a real duplicate (the same slip sent
 * twice) from two different payments that happen to share a reference.
 *
 * Warn-and-confirm signal, never a hard block. Returns no matches when the
 * reference is blank (nothing to match on).
 */
export async function findDuplicateReceipts(
  bankId: string,
  reference: string | null | undefined,
  amount: number,
  opts?: { excludeReceiptId?: string }
): Promise<DuplicateResult> {
  const referenceKey = normalizeReferenceKey(reference)
  if (!bankId || !referenceKey) return { referenceKey: null, matches: [], strong: false }

  const rows = await prisma.customerReceipt.findMany({
    where: {
      bankId,
      referenceKey,
      // Same amount (small tolerance for float storage).
      amount: { gte: amount - 0.01, lte: amount + 0.01 },
      ...(opts?.excludeReceiptId ? { id: { not: opts.excludeReceiptId } } : {}),
    },
    include: {
      customer: { select: { name: true } },
      bank: { select: { name: true } },
    },
    orderBy: { valueDate: "desc" },
    take: 20,
  })

  const matches: DuplicateMatch[] = rows.map((r) => ({
    id: r.id,
    receiptNo: r.receiptNo,
    customerId: r.customerId,
    customerName: r.customer.name,
    bankName: r.bank.name,
    amount: r.amount,
    reference: r.reference,
    valueDate: r.valueDate.toISOString(),
    amountMatches: true,
  }))

  return { referenceKey, matches, strong: matches.length > 0 }
}
