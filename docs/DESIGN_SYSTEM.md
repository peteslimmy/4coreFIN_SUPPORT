# 4CoreFinSupport Design System

## Brand Identity

**Organization:** 4CoreFinSupport
**Primary Color:** Dark Red (#dc2626)
**Secondary Color:** White / Slate grays
**Typography:** Inter (sans) + Montserrat (headings), loaded from Google Fonts with `preconnect` + `display=swap` via `<link>` in `index.html`
**Personality:** Premium, minimal, enterprise-grade, calm, professional

---

## Color Palette

### Brand Colors
| Token | Hex | Use |
|-------|-----|-----|
| `brand-50` | `#fef2f2` | Light backgrounds |
| `brand-100` | `#fee2e2` | Hover states, light accents |
| `brand-200` | `#fecaca` | Borders, dividers |
| `brand-300` | `#fca5a5` | Disabled states |
| `brand-400` | `#f87171` | Interactive hover |
| `brand-500` | `#ef4444` | Active states |
| `brand-600` | `#dc2626` | **PRIMARY** — CTAs, selected nav, key actions |
| `brand-700` | `#b91c1c` | Hover on primary |
| `brand-800` | `#991b1b` | Active on primary |
| `brand-900` | `#7f1d1d` | Dark accents |

### Neutral Colors
| Token | Use |
|-------|-----|
| `slate-50` | Page backgrounds, input backgrounds |
| `slate-100` | Card hover, secondary backgrounds |
| `slate-200` | Borders, dividers |
| `slate-300` | Disabled borders |
| `slate-400` | Placeholder text, icons |
| `slate-500` | Secondary text, labels |
| `slate-600` | Body text |
| `slate-700` | Strong text |
| `slate-800` | Headings |
| `slate-900` | Primary text |

### Semantic Colors
| Token | Color | Use |
|-------|-------|-----|
| `primary` | `#dc2626` | CTAs, active nav, brand |
| `secondary` | `#64748b` | Secondary actions |
| `success` | `#059669` | Positive outcomes, resolved |
| `warning` | `#d97706` | Attention needed, at-risk |
| `error` | `#dc2626` | Destructive actions, alerts |
| `info` | `#0284c7` | Informational |

### Status Colors
| Status | BG | Text | Border |
|--------|-----|------|--------|
| Receipt | `#dbeafe` | `#1d4ed8` | `#bfdbfe` |
| In Progress | `#fef3c7` | `#b45309` | `#fde68a` |
| Investigation | `#f3e8ff` | `#7c3aed` | `#e9d5ff` |
| Resolved | `#d1fae5` | `#047857` | `#a7f3d0` |
| Closed | `#f1f5f9` | `#475569` | `#e2e8f0` |

### Priority Colors
| Priority | BG | Text | Border |
|----------|-----|------|--------|
| Critical | `#fee2e2` | `#b91c1c` | `#fca5a5` |
| High | `#ffedd5` | `#c2410c` | `#fdba74` |
| Medium | `#fef9c3` | `#a16207` | `#fde047` |
| Low | `#f1f5f9` | `#475569` | `#e2e8f0` |

---

## Typography

### Font Families
- **Sans (body/UI):** Inter (400–700)
- **Headings:** Montserrat (500–800), applied via `.font-heading`
- **Numeric:** rendered in the sans stack with tabular figures where supported

### Type Scale
| Level | Class | Size | Weight | Line Height | Use |
|-------|-------|------|--------|-------------|-----|
| Display | `.text-display` | 32px | 800 | 1.1 | Hero numbers |
| H1 | `.text-h1` | 30px | 700 | 1.2 | Page titles |
| H2 | `.text-h2` | 24px | 700 | 1.25 | Section titles |
| H3 | `.text-h3` | 20px | 600 | 1.3 | Card titles |
| H4 | `.text-h4` | 18px | 600 | 1.35 | Subsection titles |
| Body | `.text-body` | 14px | 400 | 1.5 | Default text |
| Body Small | `.text-body-sm` | 12px | 400 | 1.5 | Secondary text |
| Caption | `.text-caption` | 11px | 400 | 1.4 | Helper text |
| Overline | `.text-overline` | 10px | 600 | — | Labels, badges (uppercase, tracked) |

---

## Spacing (8-point grid)

| Token | Value | Use |
|-------|-------|-----|
| `space-1` | 4px | Inline gaps, tight |
| `space-2` | 8px | Small gaps |
| `space-3` | 12px | Default gaps |
| `space-4` | 16px | Standard padding |
| `space-5` | 20px | Card internal |
| `space-6` | 24px | Section spacing |
| `space-8` | 32px | Page padding |
| `space-10` | 40px | Large breaks |
| `space-12` | 48px | Page-level |

---

## Radius

| Token | Value | Use |
|-------|-------|-----|
| `rounded-sm` | 4px | Inline elements |
| `rounded-md` | 6px | Inputs, buttons |
| `rounded-lg` | 8px | Cards, containers |
| `rounded-xl` | 12px | Modals, dropdowns |
| `rounded-full` | 9999px | Avatars, pills |

---

## Shadows

| Token | Value | Use |
|-------|-------|-----|
| `shadow-1` | `0 1px 2px rgba(0,0,0,0.03)` | Subtle cards |
| `shadow-2` | `0 1px 3px rgba(0,0,0,0.06)` | Default cards |
| `shadow-3` | `0 4px 6px rgba(0,0,0,0.07)` | Hover |
| `shadow-4` | `0 4px 12px rgba(0,0,0,0.08)` | Dropdowns |
| `shadow-5` | `0 8px 24px rgba(0,0,0,0.1)` | Elevated |
| `shadow-6` | `0 12px 32px rgba(0,0,0,0.12)` | Modals |

---

## Chart Colors

| Token | Hex | Use |
|-------|-----|-----|
| `--chart-primary` | `#dc2626` | Primary data, alerts |
| `--chart-blue` | `#2563eb` | Data series 1 |
| `--chart-emerald` | `#059669` | Success, resolved |
| `--chart-amber` | `#d97706` | Warning, at-risk |
| `--chart-purple` | `#7c3aed` | Data series 4 |
| `--chart-slate` | `#64748b` | Neutral, muted |

---

## Component Patterns

### Buttons
- **Primary:** `bg-brand-600 text-white hover:bg-brand-700` — CTAs, submit
- **Secondary:** `bg-white border border-slate-200 text-slate-700 hover:bg-slate-50` — Cancel, back
- **Ghost:** `text-slate-600 hover:bg-slate-100` — Inline actions
- **Danger:** `bg-red-600 text-white hover:bg-red-700` — Destructive

### Cards
- `bg-white rounded-xl border border-slate-200 shadow-sm p-6`
- Hover: `shadow-md` or `shadow-2`
- Active/selected: `ring-2 ring-brand-600/20 border-brand-400`

### Inputs
- `bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm`
- Focus: `ring-2 ring-brand-500/20 border-brand-500`
- Error: `border-red-300 ring-2 ring-red-500/20`

### Tables
- Sticky header: `sticky top-0 bg-white`
- Rows: `divide-y divide-slate-100`
- Hover: `hover:bg-slate-50/50`
- Selected: `bg-brand-50`

### Navigation
- Sidebar: `bg-white border-r border-slate-200`
- Active item: `bg-slate-100 text-slate-900 font-semibold`
- Hover: `hover:bg-slate-50 hover:text-slate-900`

---

## Accessibility

- Focus rings on all interactive elements via `.focus-ring`
- ARIA labels on icon-only buttons
- Keyboard navigation on tabs (arrow keys)
- Screen reader support on tables (aria-label)
- Reduced motion: all animations disabled via `prefers-reduced-motion`
- Color contrast: 4.5:1 minimum for text, 3:1 for large text

---

## Responsive Breakpoints

| Breakpoint | Width | Behavior |
|------------|-------|----------|
| Mobile | < 640px | Single column, stacked forms, hamburger nav |
| Tablet | 640px - 1023px | Two columns, sidebar as overlay |
| Desktop | 1024px+ | Full sidebar, multi-column layouts |
| Wide | 1440px+ | Maximum content width |

---

*Design system version 1.0 — Last updated 2026-07-24*
