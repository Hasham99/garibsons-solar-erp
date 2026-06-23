import { prisma } from "@/lib/prisma"
import { requirePortal } from "@/lib/portal-session"
import { verifyPassword, hashPassword } from "@/lib/auth"

export async function POST(request: Request) {
  const auth = await requirePortal()
  if (auth instanceof Response) return auth

  try {
    const { currentPassword, newPassword } = await request.json()
    if (!currentPassword || !newPassword) {
      return Response.json({ error: "Current and new password are required" }, { status: 400 })
    }
    if (String(newPassword).length < 6) {
      return Response.json({ error: "New password must be at least 6 characters" }, { status: 400 })
    }

    const user = await prisma.customerUser.findUnique({ where: { id: auth.session.customerUserId } })
    if (!user) return Response.json({ error: "Account not found" }, { status: 404 })

    const ok = await verifyPassword(currentPassword, user.password)
    if (!ok) return Response.json({ error: "Current password is incorrect" }, { status: 400 })

    await prisma.customerUser.update({
      where: { id: user.id },
      data: { password: await hashPassword(newPassword) },
    })

    return Response.json({ ok: true })
  } catch (error) {
    console.error("Portal password change error:", error)
    return Response.json({ error: "Failed to change password" }, { status: 500 })
  }
}
