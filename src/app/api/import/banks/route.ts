import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { cleanStr, norm, pick, type Row } from "@/lib/import"

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { rows } = (await request.json()) as { rows: Row[] }
    if (!Array.isArray(rows)) return Response.json({ error: "Invalid payload" }, { status: 400 })

    const existing = await prisma.bank.findMany({ select: { name: true } })
    const known = new Set(existing.map((b) => norm(b.name)))

    const errors: { row: number; message: string }[] = []
    const toCreate: { name: string; branch: string | null }[] = []
    let skipped = 0

    rows.forEach((row, i) => {
      const line = i + 2
      const name = cleanStr(pick(row, "Name", "Bank Name", "Bank"))
      if (!name) {
        errors.push({ row: line, message: "Missing bank name" })
        return
      }
      const key = norm(name)
      if (known.has(key)) {
        skipped++
        return
      }
      known.add(key)
      toCreate.push({ name, branch: cleanStr(pick(row, "Branch")) || null })
    })

    if (toCreate.length > 0) {
      await prisma.bank.createMany({ data: toCreate })
    }

    await writeAuditLog({
      userId: session.userId,
      action: "IMPORT",
      entity: "Bank",
      entityId: "bulk",
      changes: { inserted: toCreate.length, skipped, errors: errors.length },
    })

    return Response.json({ inserted: toCreate.length, skipped, errors })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to import banks" }, { status: 500 })
  }
}
