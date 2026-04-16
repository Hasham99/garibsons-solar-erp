import { getIronSession } from "iron-session"
import { cookies } from "next/headers"
import bcrypt from "bcryptjs"

export interface SessionData {
  userId: string
  name: string
  email: string
  role: string
  isLoggedIn: boolean
}

const SESSION_OPTIONS = {
  password: process.env.SESSION_SECRET || "garibsons-erp-secret-key-min-32-chars-long",
  cookieName: "garibsons-erp-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
  },
}

export async function getSession() {
  const cookieStore = await cookies()
  const session = await getIronSession<SessionData>(cookieStore, SESSION_OPTIONS)
  return session
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
