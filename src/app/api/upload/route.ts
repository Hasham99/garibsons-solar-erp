import { writeFile, mkdir } from "fs/promises"
import { join } from "path"
import { getSession } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
    if (!allowedTypes.includes(file.type)) {
      return Response.json({ error: "Invalid file type. Allowed: JPG, PNG, WEBP, PDF" }, { status: 400 })
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      return Response.json({ error: "File too large. Max 10MB" }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Build unique filename
    const ext = file.name.split(".").pop()
    const timestamp = Date.now()
    const random = Math.random().toString(36).slice(2, 8)
    const filename = `${timestamp}-${random}.${ext}`

    const uploadsDir = join(process.cwd(), "public", "uploads")
    await mkdir(uploadsDir, { recursive: true })
    await writeFile(join(uploadsDir, filename), buffer)

    const url = `/uploads/${filename}`
    return Response.json({ url, filename, size: file.size, type: file.type })
  } catch (error) {
    console.error("Upload error:", error)
    return Response.json({ error: "Upload failed" }, { status: 500 })
  }
}
