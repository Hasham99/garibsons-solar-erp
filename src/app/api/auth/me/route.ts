import { getSession } from "@/lib/auth"

export async function GET() {
  try {
    const session = await getSession()

    if (!session.isLoggedIn || !session.userId) {
      return Response.json({ error: "Not authenticated" }, { status: 401 })
    }

    return Response.json({
      user: {
        id: session.userId,
        name: session.name,
        email: session.email,
        role: session.role,
      },
    })
  } catch (error) {
    console.error("Me error:", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
