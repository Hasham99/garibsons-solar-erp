import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const docs = await prisma.pODocument.findMany({
      where: { poId: id },
      orderBy: { uploadedAt: "desc" },
    })
    return Response.json(docs)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch documents" }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const data = await request.json()

    const doc = await prisma.pODocument.create({
      data: {
        poId: id,
        docType: data.docType,
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        uploadedBy: session.name || "Unknown",
      },
    })

    await writeAuditLog({
      userId: session.userId,
      action: "CREATE",
      entity: "PODocument",
      entityId: doc.id,
      changes: { poId: id, docType: data.docType },
    })

    return Response.json(doc, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to save document" }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { id: poId } = await params
    const { searchParams } = new URL(request.url)
    const docId = searchParams.get("docId")
    if (!docId) return Response.json({ error: "docId required" }, { status: 400 })

    await prisma.pODocument.delete({ where: { id: docId } })

    await writeAuditLog({
      userId: session.userId,
      action: "DELETE",
      entity: "PODocument",
      entityId: docId,
      changes: { poId },
    })

    return Response.json({ success: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to delete document" }, { status: 500 })
  }
}
