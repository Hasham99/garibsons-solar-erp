"use client"

import { clsx } from "clsx"
import { MODULES, modulesBySection, SECTIONS, type ModuleKey, type PermMap } from "@/lib/permissions/modules"

interface PermissionMatrixProps {
  value: PermMap
  fullAccess: boolean
  onChange: (value: PermMap) => void
  onFullAccessChange: (fullAccess: boolean) => void
  disabled?: boolean
}

/**
 * Section-grouped grid of module Read/Write checkboxes plus a master
 * "Full Access" toggle. Shared by the user and role forms.
 *
 * Rules enforced in the UI:
 *  - Write implies Read (checking Write checks Read; unchecking Read unchecks Write).
 *  - Full Access supersedes everything; the grid is dimmed while it is on.
 */
export function PermissionMatrix({ value, fullAccess, onChange, onFullAccessChange, disabled }: PermissionMatrixProps) {
  const grouped = modulesBySection()

  const get = (key: ModuleKey) => value[key] ?? { read: false, write: false }

  const setPerm = (key: ModuleKey, next: { read: boolean; write: boolean }) => {
    const updated: PermMap = { ...value }
    if (!next.read && !next.write) delete updated[key]
    else updated[key] = next
    onChange(updated)
  }

  const toggleRead = (key: ModuleKey, read: boolean) => {
    const cur = get(key)
    // Unchecking read also clears write (write implies read).
    setPerm(key, { read, write: read ? cur.write : false })
  }

  const toggleWrite = (key: ModuleKey, write: boolean) => {
    const cur = get(key)
    // Checking write implies read.
    setPerm(key, { read: write ? true : cur.read, write })
  }

  const sectionState = (keys: ModuleKey[], action: "read" | "write") => {
    const on = keys.filter((k) => get(k)[action]).length
    return { all: on === keys.length && keys.length > 0, some: on > 0 && on < keys.length }
  }

  const toggleSection = (keys: ModuleKey[], action: "read" | "write", on: boolean) => {
    const updated: PermMap = { ...value }
    for (const k of keys) {
      const cur = updated[k] ?? { read: false, write: false }
      let next: { read: boolean; write: boolean }
      if (action === "read") next = { read: on, write: on ? cur.write : false }
      else next = { read: on ? true : cur.read, write: on }
      if (!next.read && !next.write) delete updated[k]
      else updated[k] = next
    }
    onChange(updated)
  }

  const gridDisabled = disabled || fullAccess

  return (
    <div className="space-y-3">
      {/* Full access master toggle */}
      <label
        className={clsx(
          "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
          fullAccess ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50 hover:bg-slate-100",
          disabled && "opacity-60 pointer-events-none"
        )}
      >
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={fullAccess}
          onChange={(e) => onFullAccessChange(e.target.checked)}
          disabled={disabled}
        />
        <span>
          <span className="block text-sm font-semibold text-slate-900">Full Access (all modules)</span>
          <span className="block text-xs text-slate-500">
            Unrestricted access to every module and all data. When enabled, the permissions below are ignored.
          </span>
        </span>
      </label>

      <div
        className={clsx(
          "rounded-lg border border-slate-200 overflow-hidden transition-opacity",
          gridDisabled && "opacity-50 pointer-events-none select-none"
        )}
        aria-disabled={gridDisabled}
      >
        {/* Column header */}
        <div className="grid grid-cols-[1fr_64px_64px] items-center bg-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <span>Module</span>
          <span className="text-center">Read</span>
          <span className="text-center">Write</span>
        </div>

        {SECTIONS.map((section) => {
          const mods = grouped[section]
          if (!mods?.length) return null
          const keys = mods.map((m) => m.key)
          const readState = sectionState(keys, "read")
          const writeState = sectionState(keys, "write")
          return (
            <div key={section} className="border-t border-slate-100 first:border-t-0">
              {/* Section header with bulk toggles */}
              <div className="grid grid-cols-[1fr_64px_64px] items-center bg-slate-50/70 px-3 py-1.5">
                <span className="text-xs font-semibold text-slate-600">{section}</span>
                <span className="flex justify-center">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    aria-label={`All ${section} read`}
                    checked={readState.all}
                    ref={(el) => { if (el) el.indeterminate = readState.some }}
                    onChange={(e) => toggleSection(keys, "read", e.target.checked)}
                  />
                </span>
                <span className="flex justify-center">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    aria-label={`All ${section} write`}
                    checked={writeState.all}
                    ref={(el) => { if (el) el.indeterminate = writeState.some }}
                    onChange={(e) => toggleSection(keys, "write", e.target.checked)}
                  />
                </span>
              </div>
              {mods.map((m) => {
                const p = get(m.key)
                return (
                  <div
                    key={m.key}
                    className="grid grid-cols-[1fr_64px_64px] items-center px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <span className="pl-2">{m.label}</span>
                    <span className="flex justify-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        aria-label={`${m.label} read`}
                        checked={p.read}
                        onChange={(e) => toggleRead(m.key, e.target.checked)}
                      />
                    </span>
                    <span className="flex justify-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        aria-label={`${m.label} write`}
                        checked={p.write}
                        onChange={(e) => toggleWrite(m.key, e.target.checked)}
                      />
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {!fullAccess && (
        <p className="text-xs text-slate-400">
          {MODULES.length} modules · Write implies Read. Leave a module unchecked to deny access.
        </p>
      )}
    </div>
  )
}
