"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Mail, Lock, Eye, EyeOff, AlertCircle, Upload, BookOpen, Truck } from "lucide-react"

const HIGHLIGHTS = [
  { icon: <Upload size={18} />, title: "Upload payment slips", text: "Send us your bank slips in seconds — no more WhatsApp back-and-forth." },
  { icon: <BookOpen size={18} />, title: "Your ledger & balance", text: "See what you've been billed, paid, and what's outstanding." },
  { icon: <Truck size={18} />, title: "Orders & deliveries", text: "Track your sales orders, deliveries and invoices." },
]

export default function PortalLoginPage() {
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
      const res = await fetch("/api/portal/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (res.ok) {
        router.replace("/portal")
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
    <div className="min-h-dvh flex">
      {/* Brand panel — Garibsons solar hero photo under a navy wash, same as admin login */}
      <div className="hidden lg:flex lg:w-[45%] relative flex-col justify-between overflow-hidden bg-[#1e2533] p-12 text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/login-hero.png" alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
        {/* Navy wash so the logo, copy and footer stay readable over the photo */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#1e2533]/85 via-[#1e2533]/80 to-[#1e2533]/92" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.14) 1px, transparent 1px)," +
              "linear-gradient(to bottom, rgba(255,255,255,0.14) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.10]"
          style={{ backgroundImage: "repeating-linear-gradient(to right, transparent 0 132px, rgba(246,160,64,0.9) 132px 133px)" }}
        />
        <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-[#f6a040]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-[#e61b23]/10 blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-white flex items-center justify-center shadow-lg shadow-black/30 p-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/garibsons-logo.png" alt="Garibsons" className="h-full w-full object-contain" />
            </div>
            <div className="leading-none">
              <p className="text-white text-lg font-bold tracking-tight">Garibsons</p>
              <p className="text-[#f6a040] text-[11px] mt-1.5 tracking-[0.2em] font-semibold">CUSTOMER PORTAL</p>
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-snug">Your account, in one place.</h2>
          <p className="mt-3 text-slate-300/90 text-[15px] leading-relaxed">
            Upload payment slips and keep track of your orders, deliveries and balance.
          </p>
          <div className="mt-8 space-y-5">
            {HIGHLIGHTS.map((h) => (
              <div key={h.title} className="flex items-start gap-3.5">
                <span className="mt-0.5 p-2 rounded-lg bg-white/10 text-[#f6a040]">{h.icon}</span>
                <div>
                  <p className="font-medium text-sm">{h.title}</p>
                  <p className="text-[13px] text-slate-400 mt-0.5">{h.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-slate-400">
          Garibsons (Pvt) Ltd &copy; {new Date().getFullYear()}
        </p>
      </div>

      {/* Form panel */}
      <div className="relative flex-1 flex items-center justify-center px-4 py-10 bg-canvas">
        <div className="relative w-full max-w-md animate-fade-in-up">
          {/* Mobile-only logo */}
          <div className="text-center mb-8 lg:hidden">
            <div className="inline-flex h-14 w-14 rounded-2xl bg-surface border border-line items-center justify-center shadow-lg shadow-slate-200 mb-4 p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/garibsons-logo.png" alt="Garibsons" className="h-full w-full object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Garibsons (Pvt) Ltd</h1>
            <p className="text-secondary mt-1 text-sm">Customer Portal</p>
          </div>

          <div className="mb-7 hidden lg:block">
            <h1 className="text-2xl font-bold text-foreground">Welcome</h1>
            <p className="text-secondary mt-1.5 text-[15px]">Sign in to your customer portal.</p>
          </div>

          <div className="bg-elevated rounded-xl shadow-pop border border-line p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-secondary mb-1.5">Email address</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-tertiary pointer-events-none" />
                  <input
                    id="email"
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="username"
                    placeholder="you@company.com"
                    className="block w-full rounded-md border border-line-strong bg-surface pl-10 pr-3 py-2.5 text-sm text-foreground placeholder-tertiary transition-shadow focus:outline-none focus:ring-[3px] focus:ring-blue-100 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-secondary mb-1.5">Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-tertiary pointer-events-none" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="block w-full rounded-md border border-line-strong bg-surface pl-10 pr-11 py-2.5 text-sm text-foreground placeholder-tertiary transition-shadow focus:outline-none focus:ring-[3px] focus:ring-blue-100 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-tertiary hover:text-secondary transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-3 text-sm text-red-600 dark:text-red-300 animate-fade-in">
                  <AlertCircle size={16} className="shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-medium py-2.5 px-4 rounded-lg shadow-md shadow-blue-600/25 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/25 hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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

          <p className="text-center text-sm text-secondary mt-6">
            Need access? Contact Garibsons Solar.
          </p>
        </div>
      </div>
    </div>
  )
}
