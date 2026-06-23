import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"
import { streamBlob } from "@/lib/storage"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModule("payments.slips", "read")
  if (auth instanceof Response) return auth

  const { id } = await params
  const slip = await prisma.paymentSlip.findUnique({
    where: { id },
    select: { imageUrl: true },
  })
  if (!slip || !slip.imageUrl) {
    return Response.json({ error: "Image not available" }, { status: 404 })
  }

  const blob = await streamBlob(slip.imageUrl)
  if (!blob) return Response.json({ error: "Image not found" }, { status: 404 })

  return new Response(blob.stream, {
    headers: {
      "Content-Type": blob.contentType,
      "Cache-Control": "private, max-age=300",
    },
  })
}
