import { requirePortal } from "@/lib/portal-session"
import { computeLedger } from "@/lib/ledger"

export async function GET(request: Request) {
  const auth = await requirePortal()
  if (auth instanceof Response) return auth

  const { searchParams } = new URL(request.url)
  const result = await computeLedger({
    customerId: auth.session.customerId, // forced — a party only ever sees its own ledger
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  })
  return Response.json(result)
}
