/**
 * Branded letterhead for printable documents (DO, Invoice, Quotation, Costing).
 * Renders the Garibsons logo + company identity & address on the left and the
 * document title / number / date on the right — matching the PDF export masthead.
 */
export const COMPANY = {
  name: "GARIBSONS (PVT) LTD",
  tagline: "Solar Division",
  address: "C-69/71, 12th Commercial Street II Extension, D.H.A. Karachi - 75500, Pakistan",
}

/**
 * Faint brand watermark behind printable documents. Absolutely positioned, so
 * the report container that renders the Letterhead must be `relative` — the
 * watermark then stays centered on the report itself instead of the viewport.
 */
export function Watermark() {
  return (
    <div aria-hidden data-watermark="true" className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/garibsons-logo.png" alt="" className="w-[420px] max-w-[80%] opacity-[0.05] select-none" />
    </div>
  )
}

export function Letterhead({
  docTitle,
  docNumber,
  docDate,
}: {
  docTitle: string
  docNumber?: string
  docDate?: string
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-gray-200 pb-5 mb-8">
      <Watermark />
      <div className="flex items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/garibsons-logo.png" alt="Garibsons (Pvt) Ltd" className="h-14 w-auto object-contain shrink-0" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">{COMPANY.name}</h1>
          <p className="text-sm text-gray-500">{COMPANY.tagline}</p>
          <p className="text-xs text-gray-500 mt-1 max-w-xs leading-snug">{COMPANY.address}</p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-blue-700 font-bold text-lg">{docTitle}</div>
        {docNumber && <p className="text-sm font-medium mt-1">{docNumber}</p>}
        {docDate && <p className="text-xs text-gray-500">{docDate}</p>}
      </div>
    </div>
  )
}
