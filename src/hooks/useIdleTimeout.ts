import { useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"

const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const EVENTS = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"] as const

export function useIdleTimeout() {
  const router = useRouter()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch {
      // Proceed regardless
    }
    router.push("/login?reason=idle")
  }, [router])

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(logout, IDLE_TIMEOUT_MS)
  }, [logout])

  useEffect(() => {
    resetTimer()
    EVENTS.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }))
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      EVENTS.forEach((event) => window.removeEventListener(event, resetTimer))
    }
  }, [resetTimer])
}
