import { getPortalSession } from "@/lib/portal-session"

export async function POST() {
  const session = await getPortalSession()
  await session.destroy()
  return Response.json({ ok: true })
}
