import type { CSSProperties } from "react"

/*
 * Dark "app chrome" backgrounds (sidebar, top bar) as inline styles.
 *
 * Why inline and not a Tailwind class: this project is on Tailwind v4, whose
 * gradient utilities (`bg-gradient-to-*`) compile to CSS that relies on
 * `@property`-registered custom properties. Browsers without `@property`
 * support fail to render the gradient and fall back to a white background.
 * Inline styles with a solid `backgroundColor` fallback are immune to that
 * (and to CSS layering / purge / HMR ordering issues), so the chrome is never
 * white.
 */
export const SIDEBAR_SURFACE: CSSProperties = {
  backgroundColor: "#0e1526",
  backgroundImage: "linear-gradient(180deg, #0e1526 0%, #141d33 100%)",
}

export const TOPBAR_SURFACE: CSSProperties = {
  backgroundColor: "#0e1526",
  backgroundImage: "linear-gradient(90deg, #0e1526 0%, #141d33 100%)",
}
