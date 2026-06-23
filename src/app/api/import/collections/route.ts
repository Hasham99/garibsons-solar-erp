import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { canonicalCustomerKey, cleanStr, norm, parseDate, parseNum, pick, resolveBankId, type Row } from "@/lib/import"
import { normalizeReferenceKey } from "@/lib/collections/reference"

/**
 * Bulk-import party collections from the admin's "Collection Bank" sheet.
 * Each row becomes a CustomerReceipt. Party names are linked to customers by
 * canonical key (so typo variants map to the single de-duplicated customer);
 * bank codes (HBL, UBL, THAL, GS HO, …) are auto-mapped; blank-party rows
 * default to "Bilal Riaz", and the stray "42"/"BAH" bank values map to BAHL.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { rows } = (await request.json()) as { rows: Row[] }
    if (!Array.isArray(rows)) return Response.json({ error: "Invalid payload" }, { status: 400 })

    const [customers, banks] = await Promise.all([
      prisma.customer.findMany({ select: { id: true, name: true } }),
      prisma.bank.findMany({ select: { id: true, name: true } }),
    ])
    const custByNorm = new Map(customers.map((c) => [norm(c.name), c.id]))
    const keeperByKey = new Map<string, string>()
    for (const c of customers) {
      const k = canonicalCustomerKey(c.name)
      if (!keeperByKey.has(k)) keeperByKey.set(k, c.id)
    }
    const resolveCust = (name: string) => custByNorm.get(norm(name)) ?? keeperByKey.get(canonicalCustomerKey(name)) ?? null

    const errors: { row: number; message: string }[] = []
    const valid: {
      line: number
      customerId: string
      bankId: string
      amount: number
      reference: string | null
      referenceKey: string | null
      valueDate: Date
      notes: string | null
    }[] = []

    rows.forEach((row, i) => {
      const line = i + 2
      const partyName = cleanStr(pick(row, "Party Name", "Party", "Customer", "Customer Name")) || "Bilal Riaz Misc"
      const customerId = resolveCust(partyName)
      if (!customerId) {
        errors.push({ row: line, message: `Customer "${partyName}" not found — add it first` })
        return
      }
      let bankVal = cleanStr(pick(row, "Bank", "Bank Name"))
      const bn = norm(bankVal)
      if (bn === "42" || bn === "bah") bankVal = "BAHL" // known bad/abbreviated values
      const bankId = resolveBankId(bankVal, banks)
      if (!bankId) {
        errors.push({ row: line, message: `Bank "${bankVal || "(blank)"}" not found — add it first` })
        return
      }
      const amount = parseNum(pick(row, "Amount", "Value"))
      if (amount == null || amount <= 0) {
        errors.push({ row: line, message: "Amount must be a positive number" })
        return
      }
      const valueDate = parseDate(pick(row, "Date", "Value Date", "Bank Value Date"))
      if (!valueDate) {
        errors.push({ row: line, message: "Invalid or missing date" })
        return
      }
      // Collections are received payments — a future date means the date format
      // is wrong (e.g. month/day swapped). Reject instead of silently storing.
      if (valueDate.getTime() > Date.now() + 86_400_000) {
        errors.push({ row: line, message: `Date "${cleanStr(pick(row, "Date"))}" is in the future — use DD-MM-YYYY (e.g. 09-06-2026 = 9 June)` })
        return
      }
      const ref = cleanStr(pick(row, "Bank Ref #", "Bank Ref", "Reference", "Ref"))
      const sno = cleanStr(pick(row, "S.NO", "SNO", "Serial No", "Serial"))
      valid.push({
        line,
        customerId,
        bankId,
        amount,
        reference: ref || null,
        referenceKey: normalizeReferenceKey(ref),
        valueDate,
        notes: sno ? `S.NO ${sno}` : null,
      })
    })

    // Non-blocking duplicate warnings: flag rows whose (bank + reference + amount)
    // already exists in the system. The import still proceeds (it's a backfill
    // tool); staff review the warnings afterward.
    const warnings: { row: number; message: string }[] = []
    const keyed = valid.filter((v) => v.referenceKey)
    if (keyed.length > 0) {
      const existing = await prisma.customerReceipt.findMany({
        where: { OR: keyed.map((v) => ({ bankId: v.bankId, referenceKey: v.referenceKey })) },
        select: { bankId: true, referenceKey: true, amount: true, receiptNo: true },
      })
      const existKey = (b: string, r: string | null, a: number) => `${b}|${r}|${a.toFixed(2)}`
      const existSet = new Map(existing.map((e) => [existKey(e.bankId, e.referenceKey, e.amount), e.receiptNo]))
      for (const v of keyed) {
        const hit = existSet.get(existKey(v.bankId, v.referenceKey, v.amount))
        if (hit) {
          warnings.push({ row: v.line, message: `Possible duplicate of ${hit} — same bank, reference "${v.reference}" and amount` })
        }
      }
    }

    let inserted = 0
    if (valid.length > 0) {
      const year = new Date().getFullYear()
      const counter = await prisma.counter.upsert({
        where: { id: `RCP-${year}` },
        update: { value: { increment: valid.length } },
        create: { id: `RCP-${year}`, value: valid.length },
      })
      const startSerial = counter.value - valid.length + 1
      const data = valid.map((v, idx) => ({
        customerId: v.customerId,
        bankId: v.bankId,
        amount: v.amount,
        reference: v.reference,
        referenceKey: v.referenceKey,
        valueDate: v.valueDate,
        notes: v.notes,
        receiptNo: `RCP-${year}-${String(startSerial + idx).padStart(4, "0")}`,
        createdById: session.userId || null,
      }))
      const res = await prisma.customerReceipt.createMany({ data })
      inserted = res.count
    }

    await writeAuditLog({
      userId: session.userId,
      action: "IMPORT",
      entity: "CustomerReceipt",
      entityId: "bulk",
      changes: { inserted, errors: errors.length, warnings: warnings.length },
    })

    return Response.json({ inserted, skipped: 0, errors, warnings })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Failed to import collections" }, { status: 500 })
  }
}
