"use client"

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Mail, Lock, Eye, EyeOff, AlertCircle, TimerOff, BarChart3, Boxes, Banknote } from "lucide-react"

function IdleNotice() {
  const searchParams = useSearchParams()
  if (searchParams.get("reason") !== "idle") return null
  return (
    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 mb-5 animate-fade-in">
      <TimerOff size={16} className="shrink-0" />
      You were signed out after 30 minutes of inactivity.
    </div>
  )
}

const HIGHLIGHTS = [
  { icon: <Boxes size={18} />, title: "Stock & deliveries", text: "Live warehouse position, DOs and dispatch status." },
  { icon: <Banknote size={18} />, title: "Collections & party ledgers", text: "Outstanding balances and receipts, always up to date." },
  { icon: <BarChart3 size={18} />, title: "Reports", text: "Sales, stock position and aging — ready to share." },
]

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (res.ok) {
        router.push("/")
        router.refresh()
      } else {
        setError(data.error || "Login failed")
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Brand panel */}
      <div className="hidden lg:flex lg:w-[45%] relative flex-col justify-between overflow-hidden bg-[#0e1526] p-12 text-white">
        {/* brand imagery + legibility overlay */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/login-hero.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0e1526]/85 via-[#0e1526]/55 to-[#0e1526]/90" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-white flex items-center justify-center shadow-lg shadow-black/30 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.png" alt="Garibsons" className="h-full w-full object-contain" />
            </div>
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/gbs-logo-inverted.png" alt="Garibsons (Pvt) Ltd" className="h-5 w-auto object-contain" />
              <p className="text-blue-300/80 text-[11px] mt-1 tracking-[0.2em] font-medium">SOLAR ERP</p>
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-snug">
            Garibsons Solar ERP.
          </h2>
          <p className="mt-3 text-slate-300/90 text-[15px] leading-relaxed">
            Purchases, stock, sales orders, deliveries and collections — all in one system.
          </p>
          <div className="mt-8 space-y-5">
            {HIGHLIGHTS.map((h) => (
              <div key={h.title} className="flex items-start gap-3.5">
                <span className="mt-0.5 p-2 rounded-lg bg-white/10 text-amber-300">{h.icon}</span>
                <div>
                  <p className="font-medium text-sm">{h.title}</p>
                  <p className="text-[13px] text-slate-400 mt-0.5">{h.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-slate-400">
          Garibsons Private Limited &copy; {new Date().getFullYear()}
        </p>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md animate-fade-in-up">
          {/* Mobile-only logo */}
          <div className="text-center mb-8 lg:hidden">
            <div className="inline-flex h-14 w-14 rounded-2xl bg-white border border-slate-200 items-center justify-center shadow-lg shadow-slate-200 mb-4 p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.png" alt="Garibsons" className="h-full w-full object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Garibsons (Pvt) Ltd</h1>
            <p className="text-slate-500 mt-1 text-sm">Solar ERP</p>
          </div>

          <div className="mb-7 hidden lg:block">
            <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
            <p className="text-slate-500 mt-1.5 text-[15px]">Sign in to continue.</p>
          </div>

          <Suspense fallback={null}>
            <IdleNotice />
          </Suspense>

          <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200 p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@garibsons.com"
                    className="block w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="block w-full rounded-lg border border-slate-300 bg-white pl-10 pr-11 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 animate-fade-in">
                  <AlertCircle size={16} className="shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-medium py-2.5 px-4 rounded-lg shadow-md shadow-blue-200 hover:from-blue-700 hover:to-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-sm text-slate-500 mt-6 lg:hidden">
            Garibsons Private Limited &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  )
}
