"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Camera, X } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { Card } from "@/components/ui/Card"
import toast from "react-hot-toast"

function todayISO() {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

export default function PortalUploadPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [date, setDate] = useState(todayISO())
  const [amount, setAmount] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(f.type === "application/pdf" ? null : URL.createObjectURL(f))
  }

  const clearFile = () => {
    setFile(null)
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return toast.error("Please attach your payment slip")
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      if (amount) fd.append("amount", amount)
      if (date) fd.append("valueDate", date)
      const res = await fetch("/api/portal/slips", { method: "POST", body: fd })
      if (res.ok) {
        toast.success("Slip submitted — we'll review it shortly")
        router.replace("/portal/slips")
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to submit slip")
      }
    } catch {
      toast.error("Network error — please try again")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-5 animate-fade-in-up">
      <Header title="Upload Payment Slip" />

      <Card title="">
        <div className="space-y-4">
          {/* Image picker */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-secondary">Payment slip <span className="text-rose-500">*</span></label>
            {!file ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-44 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-canvas text-secondary active:scale-[0.99]"
              >
                <Camera size={32} className="text-blue-600" />
                <span className="text-sm font-medium">Tap to take a photo or choose a file</span>
                <span className="text-xs text-tertiary">JPG, PNG or PDF · up to 10 MB</span>
              </button>
            ) : (
              <div className="relative overflow-hidden rounded-xl border border-line bg-canvas">
                <button
                  type="button"
                  onClick={clearFile}
                  className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <X size={16} />
                </button>
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Selected slip" className="max-h-72 w-full object-contain" />
                ) : (
                  <div className="flex h-32 items-center justify-center text-sm font-medium text-secondary">{file.name}</div>
                )}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              onChange={onPick}
              className="hidden"
            />
          </div>

          <Input
            label="Payment date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Input
            label="Amount (PKR)"
            type="number"
            inputMode="decimal"
            placeholder="e.g. 50000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </Card>

      <Button type="submit" loading={submitting} size="lg" className="w-full">Submit Slip</Button>
    </form>
  )
}
