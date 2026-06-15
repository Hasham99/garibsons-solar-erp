"use client"

import { ButtonHTMLAttributes, ReactNode } from "react"
import { clsx } from "clsx"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "success"
  size?: "sm" | "md" | "lg"
  loading?: boolean
  children: ReactNode
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const base = "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"

  const variants = {
    primary: "bg-blue-600 text-white shadow-sm shadow-blue-600/25 hover:bg-blue-700 hover:shadow-md hover:shadow-blue-600/20 hover:-translate-y-px focus-visible:ring-blue-500",
    secondary: "bg-surface text-foreground border border-line-strong shadow-sm hover:bg-muted hover:border-line-strong focus-visible:ring-slate-400",
    danger: "bg-rose-600 text-white shadow-sm shadow-rose-600/25 hover:bg-rose-700 hover:shadow-md hover:shadow-rose-600/20 hover:-translate-y-px focus-visible:ring-rose-500",
    ghost: "bg-surface text-secondary border border-line hover:bg-muted hover:border-line-strong hover:text-foreground focus-visible:ring-slate-400",
    success: "bg-emerald-600 text-white shadow-sm shadow-emerald-600/25 hover:bg-emerald-700 hover:shadow-md hover:shadow-emerald-600/20 hover:-translate-y-px focus-visible:ring-emerald-500",
  }

  const sizes = {
    sm: "px-3 py-1 text-xs",
    md: "px-3.5 py-1.5 text-[13px]",
    lg: "px-5 py-2.5 text-sm",
  }

  return (
    <button
      className={clsx(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {children}
    </button>
  )
}
