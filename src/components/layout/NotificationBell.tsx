"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "motion/react"
import { Bell, Truck, PackageMinus, CheckCircle2 } from "lucide-react"
import { clsx } from "clsx"
import { useFetch } from "@/hooks/useFetch"

interface AlertsData {
  agingDeliveryOrders: Array<{
    id: string
    doNumber: string
    soNumber: string
    customerName: string
    quantity: number
    ageDays: number
  }>
  lowStock: Array<{ name: string; code: string; threshold: number; available: number }>
}

export function NotificationBell() {
  const { data } = useFetch<AlertsData>("/api/alerts")
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const aging = data?.agingDeliveryOrders ?? []
  const lowStock = data?.lowStock ?? []
  const count = aging.length + lowStock.length

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        className={clsx(
          "relative rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white",
          open && "bg-white/10 text-white"
        )}
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 z-40 mt-2 w-80 origin-top-right overflow-hidden rounded-xl border border-line bg-elevated shadow-pop"
          >
            <div className="border-b border-line bg-muted px-4 py-3">
              <p className="text-sm font-semibold text-foreground">Notifications</p>
            </div>

            <div className="max-h-[50vh] overflow-y-auto">
              {count === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <CheckCircle2 size={22} className="text-emerald-500 dark:text-emerald-400" />
                  <p className="text-sm text-secondary">All clear — no alerts right now</p>
                </div>
              ) : (
                <>
                  {aging.length > 0 && (
                    <div className="py-1.5">
                      <p className="px-4 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-tertiary">
                        Aging delivery orders
                      </p>
                      {aging.map((d) => (
                        <Link
                          key={d.id}
                          href="/delivery"
                          onClick={() => setOpen(false)}
                          className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-amber-50/60 dark:hover:bg-amber-500/10"
                        >
                          <span className="mt-0.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 p-1.5 text-amber-600 dark:text-amber-300 ring-1 ring-inset ring-amber-100 dark:ring-amber-500/25">
                            <Truck size={14} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[13px] font-medium text-foreground">
                              {d.doNumber} · {d.customerName}
                            </span>
                            <span className="block text-xs text-secondary">
                              {d.ageDays} days old · {d.quantity.toLocaleString()} panels · {d.soNumber}
                            </span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}

                  {lowStock.length > 0 && (
                    <div className="border-t border-line py-1.5">
                      <p className="px-4 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-tertiary">
                        Low stock
                      </p>
                      {lowStock.map((p) => (
                        <Link
                          key={p.code}
                          href="/stock"
                          onClick={() => setOpen(false)}
                          className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-rose-50/50 dark:hover:bg-rose-500/10"
                        >
                          <span className="mt-0.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 p-1.5 text-rose-600 dark:text-rose-300 ring-1 ring-inset ring-rose-100 dark:ring-rose-500/25">
                            <PackageMinus size={14} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[13px] font-medium text-foreground">{p.name}</span>
                            <span className="block text-xs text-secondary">
                              {p.code} · {p.available.toLocaleString()} left (threshold {p.threshold})
                            </span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
