/**
 * Normalize a payment reference / slip number into a comparison key used for
 * duplicate detection. Trims, removes all internal whitespace, and uppercases.
 * Returns `null` for empty/whitespace-only input (so blank references never
 * match each other).
 *
 * Kept deliberately conservative (whitespace + case only — punctuation such as
 * dashes is preserved) because the check is warn-and-confirm, not a hard block.
 * The same rule is used to backfill historical `CustomerReceipt.referenceKey`.
 */
export function normalizeReferenceKey(reference: string | null | undefined): string | null {
  if (!reference) return null
  const key = reference.replace(/\s+/g, "").toUpperCase()
  return key.length > 0 ? key : null
}
