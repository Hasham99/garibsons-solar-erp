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
          <label className="block text-[13px] font-medium text-slate-700 mb-1">
            {label}
            {props.required && <span className="text-rose-500 ml-1">*</span>}
          </label>
        )}
        <select
          ref={ref}
          className={clsx(
            "block w-full rounded-lg border px-3 py-1.5 text-[13px] shadow-sm bg-white transition-[border-color,box-shadow] duration-200",
            "focus:outline-none focus:ring-2",
            error
              ? "animate-shake border-rose-300 text-rose-900 focus:ring-rose-400/50 focus:border-rose-400"
              : "border-slate-300 text-slate-900 hover:border-slate-400 focus:ring-blue-500/50 focus:border-blue-500",
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
        {error && <p className="mt-1.5 text-[13px] text-rose-600 animate-slide-down">{error}</p>}
        {helperText && !error && <p className="mt-1.5 text-[13px] text-slate-500">{helperText}</p>}
      </div>
    )
  }
)

Select.displayName = "Select"
