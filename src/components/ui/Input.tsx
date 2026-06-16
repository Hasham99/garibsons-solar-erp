"use client"

import { InputHTMLAttributes, forwardRef } from "react"
import { clsx } from "clsx"

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-[13px] font-medium text-secondary mb-1">
            {label}
            {props.required && <span className="text-rose-500 ml-1">*</span>}
          </label>
        )}
        <input
          ref={ref}
          className={clsx(
            "block w-full rounded-md border px-3 py-1.5 text-[13px] shadow-sm transition-[border-color,box-shadow,background-color] duration-200",
            "focus:outline-none focus:ring-[3px]",
            error
              ? "animate-shake border-rose-300 bg-rose-50/60 text-rose-900 placeholder-rose-300 focus:ring-rose-100 focus:border-rose-400 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-200 dark:placeholder-rose-400/60"
              : "border-line-strong bg-surface text-foreground placeholder-tertiary hover:border-line-strong focus:ring-blue-100 focus:border-blue-500",
            className
          )}
          {...props}
        />
        {error && <p className="mt-1.5 text-[13px] text-rose-600 dark:text-rose-400 animate-slide-down">{error}</p>}
        {helperText && !error && <p className="mt-1.5 text-[13px] text-secondary">{helperText}</p>}
      </div>
    )
  }
)

Input.displayName = "Input"
