# UI/UX Guidelines

Visual system: see `DESIGN_SYSTEM.md` (tokens, typography, spacing, components). This document covers behavior standards.

## Navigation & routing
- Public/auth/legal routes are path-based (`/auth/login`, `/auth/forgot-password`, `/auth/reset-password`, `/privacy-policy`).
- In-app views sync to the URL (`/app/<tab>?ticket=<id>`) via the History API — deep links and the browser back button work without remounting the SPA (`src/context/UiContext.tsx`).
- Every tab is lazily loaded (`React.lazy`) with a route-level loading fallback; interactions never trigger full-page reloads (logout and admin data-import are the only deliberate exceptions).

## Interaction standards
- Modals/dropdowns: local state, focus-trapped, close on outside click/Escape.
- Lists: server filters + pagination for growing domains; in-memory filtering only for bounded sets.
- Live updates: SSE patches context in place; a 5s local-write guard prevents echo flicker; the connection auto-reconnects with backoff.
- Destructive actions require confirmation (`ConfirmModal`) and surface consequences.
- Empty, loading (skeletons), and error states are mandatory for every data view.

## Status & priority presentation
`ProgressWizard` renders the 5-step progress track (Receipt → Assigned → In Review → Resolved → Closed); WAITING_* statuses display on the "In Review" step with their own badges and customer-facing labels ("Waiting on You", "With Payment Partner").

## Permission-aware UI
Buttons/tabs render from the same permission set the server enforces (`can(permission)` + `useHasPermission`); hiding UI is never the enforcement — the server re-checks everything.

## Accessibility
Skip-to-content link, ARIA labels on icon-only controls, keyboard-navigable tabs, tables with aria-labels, `prefers-reduced-motion` respected, 4.5:1 text contrast; axe-core runs in e2e CI.

## Responsiveness
Mobile < 640px single-column with drawer nav; tablet two-column; desktop full sidebar; wide screens cap content width.
