"use client"

import { useTheme } from "@/hooks/useTheme"

/**
 * Recharts takes colors as inline props (hex strings / style objects), not
 * Tailwind classes, so the semantic tokens can't reach them. This hook returns
 * theme-matched chart chrome colors (grid, axis text, tooltip) that flip with
 * the app theme. Data-series colors (blue/emerald/…) stay as-is — they read
 * fine on both backgrounds.
 */
export function useChartTheme() {
  const { theme } = useTheme()
  const dark = theme === "dark"
  return {
    grid: dark ? "#1f2a40" : "#f1f5f9",
    axis: dark ? "#94a3b8" : "#64748b",
    axisLine: dark ? "#283449" : "#e2e8f0",
    cursor: dark ? "rgba(148,163,184,0.10)" : "#f8fafc",
    /** Spread into a Recharts <Tooltip contentStyle={...}> */
    tooltipStyle: {
      borderRadius: 12,
      border: `1px solid ${dark ? "#283449" : "#e2e8f0"}`,
      background: dark ? "#1a2438" : "#ffffff",
      color: dark ? "#e8edf5" : "#0f172a",
      boxShadow: dark
        ? "0 8px 24px rgba(0,0,0,0.45)"
        : "0 8px 24px rgba(15,23,42,0.1)",
      fontSize: 13,
    } as const,
  }
}
