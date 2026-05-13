import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const cat = await prisma.expenseCategoryDef.findUnique({ where: { id } })
    if (!cat) return Response.json({ error: "Not found" }, { status: 404 })
    if (cat.isSystem) return Response.json({ error: "Cannot delete system categories" }, { status: 403 })

    await prisma.expenseCategoryDef.update({ where: { id }, data: { active: false } })
    return Response.json({ ok: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to delete category" }, { status: 500 })
  }
}
