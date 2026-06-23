import { prisma } from "@/lib/prisma"
import { requirePortal } from "@/lib/portal-session"
import { streamBlob } from "@/lib/storage"

export const runtime = "nodejs"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortal()
  if (auth instanceof Response) return auth

  const { id } = await params
  const slip = await prisma.paymentSlip.findUnique({
    where: { id },
    select: { customerId: true, imageUrl: true },
  })
  // Only the owning party may view their slip.
  if (!slip || slip.customerId !== auth.session.customerId || !slip.imageUrl) {
    return Response.json({ error: "Image not available" }, { status: 404 })
  }

  const blob = await streamBlob(slip.imageUrl)
  if (!blob) return Response.json({ error: "Image not found" }, { status: 404 })

  return new Response(blob.stream, {
    headers: { "Content-Type": blob.contentType, "Cache-Control": "private, max-age=300" },
  })
}
