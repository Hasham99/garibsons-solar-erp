/**
 * Shared helpers for bulk CSV imports.
 * Pure functions (no DB) used by the /api/import/* endpoints to parse and
 * resolve human-entered values against master data.
 */

export type Row = Record<string, unknown>

/** Normalise a name for matching: lowercase, strip everything but a–z0–9. */
export function norm(s: unknown): string {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
}

export function cleanStr(v: unknown): string {
  return String(v ?? "").trim()
}

/** Parse a number, tolerating thousands separators, spaces and currency text. */
export function parseNum(v: unknown): number | null {
  if (v == null || v === "") return null
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  const n = parseFloat(String(v).replace(/[, ]/g, "").replace(/[^0-9.\-]/g, ""))
  return Number.isFinite(n) ? n : null
}

/** Parse a date from ISO, dd/mm/yyyy, dd-mm-yyyy, or an Excel serial number. */
export function parseDate(v: unknown): Date | null {
  if (v == null || v === "") return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86400000)
    return null
  }
  const s = String(v).trim()
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    const n = parseFloat(s)
    return new Date(Date.UTC(1899, 11, 30) + n * 86400000)
  }
  // dd/mm/yyyy or dd-mm-yyyy (Pakistan convention: day first)
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (m) {
    const d = parseInt(m[1], 10)
    const mo = parseInt(m[2], 10)
    const y = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)
    const dt = new Date(Date.UTC(y, mo - 1, d))
    return Number.isNaN(dt.getTime()) ? null : dt
  }
  const MONTHS: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  }
  // "1/May/26", "1-May-2026", "1 May 26"
  const mn = s.match(/^(\d{1,2})[/\-.\s]+([A-Za-z]{3,9})[/\-.\s]+(\d{2,4})$/)
  if (mn) {
    const mo = MONTHS[mn[2].slice(0, 3).toLowerCase()]
    if (mo != null) {
      const y = mn[3].length <= 2 ? 2000 + parseInt(mn[3], 10) : parseInt(mn[3], 10)
      const dt = new Date(Date.UTC(y, mo, parseInt(mn[1], 10)))
      if (!Number.isNaN(dt.getTime())) return dt
    }
  }
  // "May 1, 2026" / "May 1 26"
  const mn2 = s.match(/^([A-Za-z]{3,9})[\s\-/.]+(\d{1,2}),?[\s\-/.]+(\d{2,4})$/)
  if (mn2) {
    const mo = MONTHS[mn2[1].slice(0, 3).toLowerCase()]
    if (mo != null) {
      const y = mn2[3].length <= 2 ? 2000 + parseInt(mn2[3], 10) : parseInt(mn2[3], 10)
      const dt = new Date(Date.UTC(y, mo, parseInt(mn2[2], 10)))
      if (!Number.isNaN(dt.getTime())) return dt
    }
  }
  const dt = new Date(s)
  return Number.isNaN(dt.getTime()) ? null : dt
}

/** Pick the first non-empty value among several possible column headers. */
export function pick(row: Row, ...keys: string[]): unknown {
  // case/space-insensitive header lookup
  const map: Record<string, unknown> = {}
  for (const k of Object.keys(row)) map[norm(k)] = row[k]
  for (const k of keys) {
    const v = map[norm(k)]
    if (v != null && String(v).trim() !== "") return v
  }
  return ""
}

/** Common Pakistani bank abbreviations → a substring of the canonical name. */
const BANK_ALIASES: Record<string, string> = {
  hbl: "habibbank",
  ubl: "unitedbank",
  bafl: "bankalfalah",
  mbl: "meezan",
  fbl: "faysal",
  scb: "standardchartered",
  mcb: "mcb",
  albarka: "albaraka",
  hmbl: "habibmetropolitan",
  hmb: "habibmetropolitan",
  abl: "allied",
  soneri: "soneri",
  bah: "bankalhabib",
  bahl: "bankalhabib",
  gsho: "cashdeposit",
  dib: "dubaiislamic",
  bankislami: "bankislami",
  nbp: "nationalbank",
}

export interface Named {
  id: string
  name: string
}

/** Resolve a bank by exact normalised name, then by known abbreviation. */
export function resolveBankId(value: unknown, banks: Named[]): string | null {
  const v = norm(value)
  if (!v) return null
  const exact = banks.find((b) => norm(b.name) === v)
  if (exact) return exact.id
  const alias = BANK_ALIASES[v]
  if (alias) {
    const hit = banks.find((b) => norm(b.name).includes(alias))
    if (hit) return hit.id
  }
  // last resort: bank name contains the value or vice-versa
  const fuzzy = banks.find((b) => norm(b.name).includes(v) || v.includes(norm(b.name)))
  return fuzzy?.id ?? null
}

/** Resolve a customer by exact normalised name. */
export function resolveCustomerId(value: unknown, byNorm: Map<string, string>): string | null {
  return byNorm.get(norm(value)) ?? null
}

// Spelling-variant synonyms seen in the admin's data (typos of the same party).
const NAME_SYNONYMS: Record<string, string> = {
  kayzee: "kyzee", meeskay: "meskay", feemtee: "femtee", noorani: "norani",
  mukhtiar: "mukhtar", hussein: "hussain", shizel: "shizal", younus: "yunus",
  akhter: "akhtar", suffiyan: "sufyan",
}
// Suffix / filler words that don't distinguish a party ("Royal" == "Royal Solar").
const NAME_NOISE = new Set([
  "solar", "energy", "enterprises", "enterprise", "ent", "engineering", "engg", "eng",
  "traders", "trader", "co", "company", "the", "and", "new", "js", "pvt", "ltd", "shop", "misc",
])

/**
 * Canonical key for collapsing typo / suffix variants of the same customer
 * (e.g. "Kyzee", "Kayzee Solar", "Kyzee Solar" → "kyzee"). Used to de-duplicate
 * the customers imported from the file.
 */
export function canonicalCustomerKey(name: unknown): string {
  const tokens = String(name ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t && !NAME_NOISE.has(t))
    .map((t) => NAME_SYNONYMS[t] || t)
  return tokens.join(" ") || norm(name)
}

export interface ProductLike {
  id: string
  name: string
  brand: string
  wattage: number
}

/**
 * Resolve a product from a free-text item label such as "Aiko - 665 BF" or
 * "Jinko - 585 Bificial". Tries an exact normalised-name match first, then a
 * unique (brand-first-token + wattage) match to absorb spelling differences.
 */
export function resolveProductId(value: unknown, products: ProductLike[]): string | null {
  const label = cleanStr(value)
  if (!label) return null
  const n = norm(label)
  const exact = products.find((p) => norm(p.name) === n)
  if (exact) return exact.id

  const wattMatch = label.match(/\b(\d{3})\b/)
  const wattage = wattMatch ? parseInt(wattMatch[1], 10) : null
  const firstToken = norm(label.split(/[\s\-–]+/)[0] || "")
  if (wattage && firstToken) {
    const candidates = products.filter(
      (p) => p.wattage === wattage && norm(p.brand).startsWith(firstToken.slice(0, 3))
    )
    if (candidates.length === 1) return candidates[0].id
  }
  return null
}
