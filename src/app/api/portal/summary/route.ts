import { requirePortal } from "@/lib/portal-session"
import { computeLedger } from "@/lib/ledger"

export async function GET() {
  const auth = await requirePortal()
  if (auth instanceof Response) return auth

  const { totalDebits, totalCredits } = await computeLedger({ customerId: auth.session.customerId })
  // Mirrors the staff balance: outstanding = sales billed − collected.
  return Response.json({
    totalSales: totalDebits,
    totalCollected: totalCredits,
    outstanding: totalDebits - totalCredits,
  })
}
