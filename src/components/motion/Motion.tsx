"use client"

import { ReactNode, useEffect, useRef, useState } from "react"
import { motion, animate, useReducedMotion } from "motion/react"

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

/** Container that cascades its StaggerItem children into view one after another. */
export function Stagger({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.05, delayChildren: delay } },
      }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 14 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT_EXPO } },
      }}
    >
      {children}
    </motion.div>
  )
}

/**
 * Counts the numeric part of an already-formatted value up from zero
 * (e.g. "Rs 1,234,567" or "850 panels"), preserving prefix, suffix,
 * decimals and digit grouping. Non-numeric values render as-is.
 */
export function AnimatedNumber({ value, duration = 0.9 }: { value: string | number; duration?: number }) {
  const str = typeof value === "number" ? value.toLocaleString("en-PK") : String(value)
  const reduceMotion = useReducedMotion()
  const match = str.match(/-?\d[\d,]*(?:\.\d+)?/)
  const target = match ? parseFloat(match[0].replace(/,/g, "")) : 0
  const decimals = match?.[0].includes(".") ? match[0].split(".")[1].length : 0
  const grouped = match?.[0].includes(",") ?? false
  const from = useRef(0)
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (reduceMotion) {
      from.current = target
      return
    }
    const controls = animate(from.current, target, {
      duration,
      ease: EASE_OUT_EXPO,
      onUpdate: (v) => setDisplay(v),
    })
    from.current = target
    return () => controls.stop()
  }, [target, duration, reduceMotion])

  if (!match) return <>{str}</>

  const formatted = (reduceMotion ? target : display).toLocaleString("en-PK", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: grouped,
  })
  return (
    <>
      {str.slice(0, match.index)}
      {formatted}
      {str.slice((match.index ?? 0) + match[0].length)}
    </>
  )
}
