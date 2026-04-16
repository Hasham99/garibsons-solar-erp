import { prisma } from "@/lib/prisma"

export async function getNextRef(
  type: string,
  prefix: string,
  options?: {
    includeYear?: boolean
    padStart?: number
    resetByYear?: boolean
  }
): Promise<string> {
  const year = new Date().getFullYear()
  const includeYear = options?.includeYear ?? true
  const padStart = options?.padStart ?? 3
  const resetByYear = options?.resetByYear ?? true
  const key = resetByYear ? `${type}-${year}` : type
  const counter = await prisma.counter.upsert({
    where: { id: key },
    update: { value: { increment: 1 } },
    create: { id: key, value: 1 },
  })
  const serial = String(counter.value).padStart(padStart, "0")

  if (includeYear) {
    return `${prefix}-${year}-${serial}`
  }

  return `${prefix}-${serial}`
}
