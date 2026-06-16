"use client"

import { useEffect, useState } from "react"
import { Sun, Moon } from "lucide-react"
import { useTheme } from "@/hooks/useTheme"

/**
 * Sun/moon switch in the (always-dark) top bar chrome. Renders a neutral
 * placeholder until mounted so the server HTML and first client render match —
 * the real theme is only known on the client (set by the head init script).
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isDark = mounted && theme === "dark"

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
      className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
    >
      {/* Keep a fixed icon pre-mount to avoid a hydration flash */}
      {mounted ? (
        isDark ? <Sun size={18} /> : <Moon size={18} />
      ) : (
        <Moon size={18} />
      )}
    </button>
  )
}
