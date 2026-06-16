/*
 * Dark-mode store. The current theme lives on the <html> element's `dark`
 * class (set pre-paint by an inline script in the root layout, so there's no
 * flash). This module is the single place that reads/flips it and notifies
 * subscribers, mirroring the sidebar-collapse pattern in the dashboard layout.
 */
export type Theme = "light" | "dark"

const STORAGE_KEY = "gbs-theme"
const listeners = new Set<() => void>()

/** The theme as it's actually applied right now (source of truth = <html>). */
export function currentTheme(): Theme {
  if (typeof document === "undefined") return "light"
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark")
}

/** Set an explicit theme, persist the choice, and notify subscribers. */
export function setTheme(theme: Theme) {
  apply(theme)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* storage unavailable (private mode) — theme still applies for this session */
  }
  listeners.forEach((l) => l())
}

export function toggleTheme() {
  setTheme(currentTheme() === "dark" ? "light" : "dark")
}

export function subscribeTheme(callback: () => void) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

/**
 * Inline script source, stringified into the document <head> so it runs before
 * first paint: applies the stored choice, or the OS preference when unset.
 * Kept terse and dependency-free since it executes raw.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY
)});var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark");}catch(e){}})();`
