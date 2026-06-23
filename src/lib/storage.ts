import { put, del, get } from "@vercel/blob"
import { randomUUID } from "crypto"
import sharp from "sharp"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export interface StoredFile {
  url: string
  contentType: string
  size: number
}

/**
 * Process and upload a payment-slip file to Vercel Blob (private store).
 *
 * Images are auto-rotated (from EXIF), resized to max 1600px, and re-encoded as
 * WebP q80 with metadata stripped — turning a multi-MB phone photo into ~100 KB.
 * PDFs are stored as-is. Throws on invalid type / oversize.
 *
 * Returns the blob URL to persist; the raw URL is never exposed to the browser —
 * slips are streamed back through authenticated routes via {@link streamBlob}.
 */
export async function uploadSlip(file: File, opts?: { prefix?: string }): Promise<StoredFile> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Invalid file type. Allowed: JPG, PNG, WEBP, PDF")
  }
  if (file.size > MAX_BYTES) {
    throw new Error("File too large. Max 10MB")
  }

  const input = Buffer.from(await file.arrayBuffer())
  let body: Buffer
  let contentType: string
  let ext: string

  if (file.type === "application/pdf") {
    body = input
    contentType = "application/pdf"
    ext = "pdf"
  } else {
    body = await sharp(input)
      .rotate() // honor EXIF orientation, then strip metadata
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
    contentType = "image/webp"
    ext = "webp"
  }

  const prefix = opts?.prefix ?? "slips"
  const key = `${prefix}/${Date.now()}-${randomUUID()}.${ext}`
  const result = await put(key, body, { access: "private", contentType })
  return { url: result.url, contentType, size: body.length }
}

/** Stream a private blob for an authenticated route. Returns null if missing. */
export async function streamBlob(
  url: string
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null> {
  const res = await get(url, { access: "private" })
  if (!res || res.statusCode !== 200) return null
  return { stream: res.stream, contentType: res.blob.contentType }
}

/** Delete a blob (used by the retention purge). Tolerates already-deleted blobs. */
export async function deleteBlob(url: string): Promise<void> {
  try {
    await del(url)
  } catch (err) {
    console.error("deleteBlob failed for", url, err)
  }
}
