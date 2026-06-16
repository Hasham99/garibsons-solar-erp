"use client"

import { useSyncExternalStore } from "react"
import { currentTheme, setTheme, toggleTheme, subscribeTheme, type Theme } from "@/lib/theme"

/**
 * Read the active theme and flip it. Hydration-safe: the server snapshot is
 * always "light" (the inline head script applies the real theme before React
 * hydrates, and <html suppressHydrationWarning> absorbs the class mismatch).
 */
export function useTheme(): { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void } {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => "light" as Theme)
  return { theme, toggle: toggleTheme, setTheme }
}
