import { prisma } from "@/lib/prisma"
import { requirePortal } from "@/lib/portal-session"
import { uploadSlip, deleteBlob } from "@/lib/storage"

export const runtime = "nodejs"

/** Load a slip and verify the logged-in party owns it. */
async function loadOwned(id: string, customerId: string) {
  const slip = await prisma.paymentSlip.findUnique({
    where: { id },
    select: { id: true, customerId: true, status: true, imageUrl: true },
  })
  if (!slip || slip.customerId !== customerId) return null
  return slip
}

// Edit a pending slip — reupload the image and/or change amount / value date.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortal()
  if (auth instanceof Response) return auth

  const { id } = await params
  const slip = await loadOwned(id, auth.session.customerId)
  if (!slip) return Response.json({ error: "Slip not found" }, { status: 404 })
  if (slip.status !== "PENDING") {
    return Response.json({ error: "Only pending slips can be edited" }, { status: 409 })
  }

  try {
    const form = await request.formData()
    const file = form.get("file") as File | null
    const amountRaw = form.get("amount")
    const valueDateRaw = form.get("valueDate")
    const amount = amountRaw != null && String(amountRaw) !== "" ? parseFloat(String(amountRaw)) : null
    const valueDate = valueDateRaw ? new Date(String(valueDateRaw)) : null

    const data: { claimedAmount: number | null; claimedValueDate: Date | null; imageUrl?: string; fileType?: string } = {
      claimedAmount: amount != null && !isNaN(amount) && amount > 0 ? amount : null,
      claimedValueDate: valueDate && !isNaN(valueDate.getTime()) ? valueDate : null,
    }

    // A new file replaces the old blob (deleted only after the row is updated).
    let oldUrl: string | null = null
    if (file && file.size > 0) {
      let stored
      try {
        stored = await uploadSlip(file)
      } catch (err) {
        return Response.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 })
      }
      data.imageUrl = stored.url
      data.fileType = stored.contentType
      oldUrl = slip.imageUrl
    }

    await prisma.paymentSlip.update({ where: { id }, data })
    if (oldUrl) await deleteBlob(oldUrl)

    return Response.json({ ok: true })
  } catch (error) {
    console.error("Portal slip edit error:", error)
    return Response.json({ error: "Failed to update slip" }, { status: 500 })
  }
}

// Delete a pending slip (and its stored image).
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortal()
  if (auth instanceof Response) return auth

  const { id } = await params
  const slip = await loadOwned(id, auth.session.customerId)
  if (!slip) return Response.json({ error: "Slip not found" }, { status: 404 })
  if (slip.status !== "PENDING") {
    return Response.json({ error: "Only pending slips can be deleted" }, { status: 409 })
  }

  await prisma.paymentSlip.delete({ where: { id } })
  if (slip.imageUrl) await deleteBlob(slip.imageUrl)

  return Response.json({ ok: true })
}
