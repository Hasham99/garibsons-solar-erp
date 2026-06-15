# GS Energy Solar ERP — Design System Adoption

_Date: 2026-06-15 · Branch: `design/gs-energy-design-system`_

## Goal

Adopt the **GS Energy Solar ERP design system** (handoff bundle from claude.ai/design,
reverse-engineered from this codebase) into the live app. Full adoption: foundations,
component alignment, brand rebrand, and branded print letterhead.

## Decisions (locked with user)

1. **Scope:** Full adoption — foundations + components + print letterhead/docs.
2. **Canvas:** Flatten — remove ambient radial gradients, solid gray-50 `#f9fafb`.
3. **Brand:** Rebrand "Garibsons (Pvt) Ltd" → **"GS Energy Systems (Private) Limited"**;
   wire in the real GS Energy logo assets and red/orange brand accents.
4. **Flourishes:** Keep existing motion polish (animated count-up numbers, sparklines,
   hover-lift, spring-bounce modal). Only flatten canvas, align colors/fonts/radii/badges,
   and remove the spec-conflicting **gradient fills**.
5. **Login brand panel:** Flatten (drop `login-hero.png` photo) and replace with a cooler,
   **solar-panel-motif** flat brand panel (CSS panel-grid lattice + emblem, brand colors over navy).
6. **Print/letterhead data:** Keep whatever company data already exists in code (address, any
   tax numbers). Do **not** fabricate or alter data values — only the brand *name* and *visual*
   treatment change. User will redesign data later.

## Approach

Token-first translation into the existing **Tailwind v4** system. The bundle's prototype
HTML/CSS (`.gs-*` classes) is the target *visual output*, not code to import. Port the spec's
**values** into the `@theme` block and component classNames, keeping the codebase's idioms
(Tailwind utilities + `clsx`). Rejected: importing the bundle's `components.css` wholesale —
it fights the utility-driven component layer and maximizes conflict risk.

## Reference values (from the bundle tokens)

- **Primary:** blue-600 `#2563eb`, hover blue-700 `#1d4ed8`, focus ring blue-500 `#3b82f6`.
- **Brand:** red `#e61b23` (panel), orange `#f6a040` (sunburst), ink `#1d1d1b`. Identity/print
  only — **functional red still means negative/overdue in data**, primary action stays blue.
- **Chrome:** navy `#1e2533` (sidebar), white text, `rgba(255,255,255,.05–.10)` overlays.
- **Canvas:** gray-50 `#f9fafb`; cards white; borders gray-200 `#e5e7eb`.
- **Radii:** inputs 6px, buttons 8px, cards & modals 12px, badges/avatars full-round.
- **Status badges:** soft 100-level bg + 800-level text (green/red/amber/orange/purple/teal/indigo).
- **Type:** Geist Sans (UI) + Geist Mono (figures/money). Page title 24/700, section 16/600,
  body 14, table header 12 uppercase `.05em`.
- **Modal scrim:** `rgba(17,24,39,.5)` + 2px backdrop blur; modal radius 12px.

## Implementation plan (file-level)

### 1. Foundations
- `src/app/layout.tsx`: `Figtree` → `Geist`, `Space_Mono` → `Geist_Mono` (next/font/google);
  repoint mono var; update metadata title/description to GS Energy.
- `src/app/globals.css`: remove the 3 body radial gradients → solid `#f9fafb`; repoint
  `.tabular-nums` to the Geist Mono var; add brand red/orange/ink + navy `#1e2533` + status
  ramp tokens to `@theme`. Keep keyframes, reduced-motion, print blocks, `shadow-card/-pop`.

### 2. Brand assets
- Copy `logo-emblem.png`, `logo-full.png`, `logo-gs-energy.png` from the bundle into `public/`.
- `src/lib/logo.ts`: regenerate `GS_LOGO` base64 data-URI from the new full logo (used by `pdf.ts`).

### 3. Brand name swap → "GS Energy Systems (Private) Limited"
Files: `Sidebar.tsx` (short "GS Energy" wordmark + "Solar ERP" sub-label, emblem),
`login/page.tsx`, `components/print/Letterhead.tsx` (`COMPANY.name`), the 4 print routes
(`costing|invoices|delivery|quotations/[id]/print/page.tsx`), `TopBar.tsx`, `lib/excel.ts`,
`lib/pdf.ts`, `api/reports/gst-export/route.ts`, `(dashboard)/page.tsx`, `layout.tsx`.
Keep existing address/tax data values intact.

### 4. Component alignment (values only; flourishes preserved)
- `Sidebar.tsx`: solid `#1e2533` (drop gradient); active nav → solid blue fill (drop gradient).
- `ui/Badge.tsx`: retune tones to 100-bg / 800-text; keep dot + capitalize.
- `ui/Input.tsx`: radius lg→md (8→6px); focus → 3px blue-100 halo + blue-500 border; keep shake.
- `ui/Modal.tsx`: radius 2xl→xl (16→12px); scrim `/45`→`/50` @ 2px blur; keep spring entrance.
- `ui/Button.tsx`, `ui/Card.tsx` (Card+StatCard): confirm radii on-spec; keep hover-lift/sparklines/count-up.
- `Letterhead.tsx`: emblem + typeset wordmark over brand **red top-rule**.

### 5. Login brand panel (solar-panel motif)
- `login/page.tsx`: remove `login-hero.png`; build flat navy `#1e2533` panel with a CSS
  isometric/solar panel-grid lattice in brand red/orange, the emblem, and recolored accents.

## Out of scope
- No data/logic/schema changes. No new dependencies. No changes to calculations, exports'
  data content, or DB. Pure design pass.

## Verification
- `npx next build` (or `tsc --noEmit` + `eslint`) passes.
- Spot-check: dashboard, login, a list screen, a modal, a print route render with new brand.

## Safety
- All work on `design/gs-energy-design-system`. No commits to `main`, no pushes.
