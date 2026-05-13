import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function GET() {
  try {
    const cats = await prisma.expenseCategoryDef.findMany({
      where: { active: true },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    })
    return Response.json(cats)
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to fetch categories" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { name } = await request.json()
    if (!name?.trim()) return Response.json({ error: "Name is required" }, { status: 400 })

    const existing = await prisma.expenseCategoryDef.findUnique({ where: { name: name.trim() } })
    if (existing) {
      if (!existing.active) {
        const reactivated = await prisma.expenseCategoryDef.update({
          where: { id: existing.id },
          data: { active: true },
        })
        return Response.json(reactivated, { status: 200 })
      }
      return Response.json({ error: "Category already exists" }, { status: 409 })
    }

    const cat = await prisma.expenseCategoryDef.create({
      data: { name: name.trim(), isSystem: false, active: true },
    })
    return Response.json(cat, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to create category" }, { status: 500 })
  }
}
