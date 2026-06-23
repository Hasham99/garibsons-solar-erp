import { prisma } from "@/lib/prisma"
import { requireModule } from "@/lib/permissions/guard"
import type { PaymentSlipStatus, Prisma } from "@/generated/prisma/client"

const VALID_STATUSES = ["PENDING", "VERIFIED", "REJECTED", "ALREADY_RECEIVED"] as const

export async function GET(request: Request) {
  const auth = await requireModule("payments.slips", "read")
  if (auth instanceof Response) return auth

  const { searchParams } = new URL(request.url)
  const statusParam = searchParams.get("status") || "PENDING"

  const where: Prisma.PaymentSlipWhereInput = {}
  if (statusParam !== "ALL" && (VALID_STATUSES as readonly string[]).includes(statusParam)) {
    where.status = statusParam as PaymentSlipStatus
  }

  const slips = await prisma.paymentSlip.findMany({
    where,
    select: {
      id: true,
      status: true,
      fileType: true,
      imageUrl: true,
      imagePurgedAt: true,
      claimedAmount: true,
      claimedValueDate: true,
      reviewedAt: true,
      rejectionReason: true,
      createdAt: true,
      customer: { select: { id: true, name: true } },
      submittedBy: { select: { name: true, email: true } },
      linkedReceipt: {
        select: {
          id: true,
          receiptNo: true,
          reference: true,
          amount: true,
          valueDate: true,
          notes: true,
          bank: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 300,
  })

  return Response.json(slips)
}
