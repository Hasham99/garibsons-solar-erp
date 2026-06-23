import { prisma } from "@/lib/prisma"
import { requirePortal } from "@/lib/portal-session"
import { uploadSlip } from "@/lib/storage"

export const runtime = "nodejs"

export async function GET() {
  const auth = await requirePortal()
  if (auth instanceof Response) return auth

  const slips = await prisma.paymentSlip.findMany({
    where: { customerId: auth.session.customerId },
    select: {
      id: true,
      status: true,
      fileType: true,
      imageUrl: true,
      imagePurgedAt: true,
      claimedAmount: true,
      claimedValueDate: true,
      rejectionReason: true,
      createdAt: true,
      linkedReceipt: {
        select: {
          receiptNo: true,
          amount: true,
          reference: true,
          valueDate: true,
          notes: true,
          bank: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  })

  // Don't leak the raw blob URL — expose only whether an image is viewable.
  const safe = slips.map(({ imageUrl, ...s }) => ({ ...s, hasImage: Boolean(imageUrl) && !s.imagePurgedAt }))
  return Response.json(safe)
}

export async function POST(request: Request) {
  const auth = await requirePortal()
  if (auth instanceof Response) return auth

  try {
    const form = await request.formData()
    const file = form.get("file") as File | null
    if (!file) return Response.json({ error: "Please attach your payment slip" }, { status: 400 })

    let stored
    try {
      stored = await uploadSlip(file)
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 })
    }

    const amountRaw = form.get("amount")
    const valueDateRaw = form.get("valueDate")
    const amount = amountRaw != null && String(amountRaw) !== "" ? parseFloat(String(amountRaw)) : null
    const valueDate = valueDateRaw ? new Date(String(valueDateRaw)) : null

    const slip = await prisma.paymentSlip.create({
      data: {
        customerId: auth.session.customerId,
        submittedById: auth.session.customerUserId,
        imageUrl: stored.url,
        fileType: stored.contentType,
        status: "PENDING",
        claimedAmount: amount != null && !isNaN(amount) && amount > 0 ? amount : null,
        claimedValueDate: valueDate && !isNaN(valueDate.getTime()) ? valueDate : null,
      },
      select: { id: true, status: true, claimedAmount: true, claimedValueDate: true, createdAt: true },
    })

    return Response.json(slip, { status: 201 })
  } catch (error) {
    console.error("Portal slip upload error:", error)
    return Response.json({ error: "Failed to submit slip" }, { status: 500 })
  }
}
