import { requirePortal } from "@/lib/portal-session"
import { computeLedger } from "@/lib/ledger"

export async function GET() {
  const auth = await requirePortal()
  if (auth instanceof Response) return auth

  const { totalDebits, totalCredits, opening } = await computeLedger({ customerId: auth.session.customerId })
  // Opening balance is folded into `outstanding` but shown separately from the
  // pure sales/collection totals (matches the staff views).
  const openingDebit = opening?.direction === "RECEIVABLE" ? opening.amount : 0
  const openingCredit = opening?.direction === "ADVANCE" ? opening.amount : 0
  // Mirrors the staff balance: outstanding = sales billed − collected (+ opening).
  return Response.json({
    totalSales: totalDebits - openingDebit,
    totalCollected: totalCredits - openingCredit,
    outstanding: totalDebits - totalCredits,
    opening,
  })
}
