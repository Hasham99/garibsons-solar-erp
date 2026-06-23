import { prisma } from "@/lib/prisma"
import { deleteBlob } from "@/lib/storage"

export const runtime = "nodejs"

const RETENTION_DAYS = Number(process.env.SLIP_RETENTION_DAYS) || 15

/**
 * Daily retention purge. Deletes the blob image for REVIEWED slips (VERIFIED or
 * REJECTED) older than SLIP_RETENTION_DAYS, keeping the PaymentSlip row (with
 * imageUrl nulled + imagePurgedAt set) and never touching the linked receipt.
 * PENDING slips are never purged.
 *
 * Invoked by Vercel Cron (which sends `Authorization: Bearer $CRON_SECRET`).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const authz = request.headers.get("authorization")
    if (authz !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000)

  const due = await prisma.paymentSlip.findMany({
    where: {
      status: { in: ["VERIFIED", "REJECTED"] },
      imageUrl: { not: null },
      reviewedAt: { lt: cutoff },
    },
    select: { id: true, imageUrl: true },
    take: 500,
  })

  let purged = 0
  for (const slip of due) {
    if (!slip.imageUrl) continue
    await deleteBlob(slip.imageUrl)
    await prisma.paymentSlip.update({
      where: { id: slip.id },
      data: { imageUrl: null, imagePurgedAt: new Date() },
    })
    purged++
  }

  return Response.json({ purged, retentionDays: RETENTION_DAYS })
}
