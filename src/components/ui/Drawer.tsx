"use client"

import { ReactNode, useEffect, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

interface DrawerProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: "md" | "lg" | "xl"
}

/** Right-side slide-over panel — keeps the list visible behind it. */
export function Drawer({ isOpen, onClose, title, children, size = "lg" }: DrawerProps) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, onClose])

  if (!mounted) return null

  const sizes = {
    md: "max-w-md",
    lg: "max-w-xl",
    xl: "max-w-2xl",
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.1 }}
            className={`absolute inset-y-0 right-0 flex w-full ${sizes[size]} flex-col bg-white shadow-pop sm:rounded-l-2xl`}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
