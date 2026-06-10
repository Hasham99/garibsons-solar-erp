import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { cleanStr, norm, parseNum, pick, type Row } from "@/lib/import"

function mapType(v: string): "DISTRIBUTOR" | "INSTALLER" | "DIRECT" {
  const n = norm(v)
  if (n.includes("distrib")) return "DISTRIBUTOR"
  if (n.includes("install")) return "INSTALLER"
  return "DIRECT"
}

function mapTerms(v: string): "FULL_PAYMENT" | "DEPOSIT_BALANCE" | "CREDIT" {
  const n = norm(v)
  if (n.includes("deposit")) return "DEPOSIT_BALANCE"
  if (n.includes("credit")) return "CREDIT"
  return "FULL_PAYMENT"
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { rows } = (await request.json()) as { rows: Row[] }
    if (!Array.isArray(rows)) return Response.json({ error: "Invalid payload" }, { status: 400 })

    const existing = await prisma.customer.findMany({ select: { name: true } })
    const known = new Set(existing.map((c) => norm(c.name)))

    const errors: { row: number; message: string }[] = []
    const toCreate: {
      name: string
      type: "DISTRIBUTOR" | "INSTALLER" | "DIRECT"
      ntn: string | null
      strn: string | null
      address: string | null
      contactPerson: string | null
      contactPhone: string | null
      contactEmail: string | null
      creditLimit: number | null
      paymentTerms: "FULL_PAYMENT" | "DEPOSIT_BALANCE" | "CREDIT"
    }[] = []
    let skipped = 0

    rows.forEach((row, i) => {
      const line = i + 2
      const name = cleanStr(pick(row, "Name", "Customer Name", "Party Name", "Party"))
      if (!name) {
        errors.push({ row: line, message: "Missing customer name" })
        return
      }
      const key = norm(name)
      if (known.has(key)) {
        skipped++
        return
      }
      known.add(key)
      toCreate.push({
        name,
        type: mapType(cleanStr(pick(row, "Type", "Customer Type"))),
        ntn: cleanStr(pick(row, "NTN")) || null,
        strn: cleanStr(pick(row, "STRN")) || null,
        address: cleanStr(pick(row, "Address")) || null,
        contactPerson: cleanStr(pick(row, "Contact Person", "Contact")) || null,
        contactPhone: cleanStr(pick(row, "Phone", "Contact Phone", "WhatsApp")) || null,
        contactEmail: cleanStr(pick(row, "Email", "Contact Email")) || null,
        creditLimit: parseNum(pick(row, "Credit Limit")),
        paymentTerms: mapTerms(cleanStr(pick(row, "Payment Terms"))),
      })
    })

    if (toCreate.length > 0) {
      await prisma.customer.createMany({ data: toCreate })
    }

    await writeAuditLog({
      userId: session.userId,
      action: "IMPORT",
      entity: "Customer",
      entityId: "bulk",
      changes: { inserted: toCreate.length, skipped, errors: errors.length },
    })

    return Response.json({ inserted: toCreate.length, skipped, errors })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to import customers" }, { status: 500 })
  }
}
