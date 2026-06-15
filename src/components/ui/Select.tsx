"use client"

import { SelectHTMLAttributes, forwardRef } from "react"
import { clsx } from "clsx"

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  helperText?: string
  options?: { value: string; label: string }[]
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, options, children, className, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-[13px] font-medium text-secondary mb-1">
            {label}
            {props.required && <span className="text-rose-500 ml-1">*</span>}
          </label>
        )}
        <select
          ref={ref}
          className={clsx(
            "block w-full rounded-lg border px-3 py-1.5 text-[13px] shadow-sm bg-surface transition-[border-color,box-shadow] duration-200",
            "focus:outline-none focus:ring-2",
            error
              ? "animate-shake border-rose-300 text-rose-900 focus:ring-rose-400/50 focus:border-rose-400 dark:border-rose-500/50 dark:text-rose-200"
              : "border-line-strong text-foreground hover:border-line-strong focus:ring-blue-500/50 focus:border-blue-500",
            className
          )}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        {error && <p className="mt-1.5 text-[13px] text-rose-600 dark:text-rose-400 animate-slide-down">{error}</p>}
        {helperText && !error && <p className="mt-1.5 text-[13px] text-secondary">{helperText}</p>}
      </div>
    )
  }
)

Select.displayName = "Select"
