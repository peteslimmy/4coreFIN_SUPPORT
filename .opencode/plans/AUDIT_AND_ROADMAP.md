# 4CoreFinSupport — Comprehensive UI/UX Audit & Redesign Roadmap

---

## 1. CODEBASE RECONNAISSANCE

### Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Framework** | React | 19.2.8 |
| **Language** | TypeScript | ~5.8.3 |
| **Build System** | Vite | 6.4.3 |
| **Styling** | Tailwind CSS v4 (CSS-first `@theme`) | 4.3.3 |
| **Package Manager** | pnpm (evidenced by `.pnpm` in node_modules) |
| **State Management** | React Context + TanStack React Query v5 | 5.101.4 |
| **Routing** | Manual path-based routing in `App.tsx` (no router lib) |
| **Animation** | Framer Motion | 12.43.0 |
| **Charts** | Recharts | 3.10.1 |
| **Forms/Validation** | Zod v4 + custom validation | 4.4.3 |
| **Component Primitives** | Radix UI (Dialog, Tabs) | 1.1.x |
| **Icons** | Lucide React | 0.546.0 |
| **Auth** | Supabase Auth + JWT (httpOnly cookies + CSRF) |
| **Backend** | Express + TypeScript (tsx) | 4.22.2 |
| **Database** | Supabase (PostgreSQL) | 2.112.0 |
| **Realtime** | SSE (Server-Sent Events) |
| **Testing** | Vitest + Playwright + @axe-core/playwright |
| **Lint/Format** | ESLint + Prettier + TypeScript ESLint |

### Application Structure

```
src/
├── main.tsx                 # App bootstrap, providers
├── App.tsx                  # Root shell, routing, auth guards, role tabs
├── index.css                # Design system (577 lines: @theme, :root, .dark, utilities)
├── context/
│   ├── AppContext.tsx       # 568 lines — monolithic state + domain composition
│   ├── UiContext.tsx        # 110 lines — URL-synced UI state (tab, filters, density)
│   ├── ConfigContext.tsx    # Reference data (KB, templates, replies, etc.)
│   ├── AdminContext.tsx     # Admin data (users, SLA rules, holidays, roles)
│   ├── AppShellContext.tsx  # Auth, role, user, loading state
│   ├── TicketContext.tsx    # Ticket mutations, SSE, risk, watchers
├── hooks/                   # 12 custom hooks (toast, theme, settings, keyboard, etc.)
├── lib/                     # 80+ utilities (api, slaCalculator, metrics, sync, etc.)
├── pages/
│   ├── TicketWorkspacePage.tsx       # 528 lines — main 3-pane workspace
│   ├── ExecutiveDashboardPage.tsx    # 770 lines — KPIs, charts, drill-downs
│   ├── CustomerPortalPage.tsx        # 939 lines — multi-step complaint intake
│   ├── MajorIncidentsPage.tsx        # 700+ lines — MI command center
│   ├── LoginPage.tsx                 # 295 lines — split-screen auth
│   ├── AdminSettingsPage.tsx         # Admin config
│   ├── ReferenceDataPage.tsx         # Reference data management
│   └── 15+ other pages
├── pages/ticket-workspace/  # 11 components (list, detail, chat, right panel, modals)
├── components/
│   ├── ui/                  # 30+ primitives (Button, Input, Modal, Table, Card, etc.)
│   ├── layout/              # PageContainer, PageHeader, PageTransition
│   ├── auth/                # AuthLogo, AuthBackground, PasswordToggle
│   ├── forms/               # DynamicFormStep, DuplicateResolutionModal
│   ├── executive/           # RiskComplianceTab, ReportsTab
│   └── onboarding/          # OnboardingTour, CommandPalette
├── types/
│   ├── app.ts               # Core domain types (TicketRecord, CustomerRecord, etc.)
│   ├── ui.ts                # Component prop types
│   ├── admin.ts             # Admin types
│   ├── forms.ts             # Form config types
│   └── rbac.ts              # Roles, permissions
└── lib/
    ├── queryClient.ts       # React Query setup + key factory
    ├── constants.ts         # Shared constants
    ├── slaCalculator.ts     # 275 lines — business-hours-aware SLA
    ├── executiveMetrics.ts  # 500+ lines — dashboard computations
    └── sync.ts              # Server sync functions
```

### Major Routes & Layouts

| Route | Layout | Role Access | Description |
|-------|--------|-------------|-------------|
| `/` | Landing/Login | Public | Split-screen landing + login |
| `/auth/login` | Standalone | Public | Authentication |
| `/app/tickets` | 3-pane workspace | BU_SUPPORT, SUPER_ADMIN, PARTNER | Ticket list (288px) + Detail (flex) + Right panel (320px @ xl) |
| `/app/customer_portal` | PageContainer | CUSTOMER, BU_SUPPORT | Complaint intake wizard + record lookup |
| `/app/dashboard` | PageContainer | EXECUTIVE, SUPER_ADMIN | Executive KPIs, charts, partner scorecards |
| `/app/major_incidents` | PageContainer | BU_SUPPORT, EXECUTIVE, SUPER_ADMIN | MI declaration, timeline, PIR |
| `/app/payment_partner_portal` | PageContainer | PARTNER | Partner ticket view, RCA submission |
| `/app/admin_settings` | PageContainer | SUPER_ADMIN | Configuration, branding, RBAC |
| `/app/reference_data` | PageContainer | SUPER_ADMIN | Reference data CRUD |

---

## 2. ARCHITECTURE AUDIT

### Strengths

| Area | Observation |
|------|-------------|
| **Domain-driven context split** | `ConfigContext`, `AdminContext`, `AppShellContext`, `TicketContext` cleanly separate concerns |
| **React Query as server cache** | `queryClient` + `queryKeys` factory provides consistent server-state management |
| **Real-time via SSE** | `connectEvents` + `connectEvents` in AppContext handles live updates gracefully |
| **SLA engine** | `slaCalculator.ts` supports business-hours, holidays, timezone-aware deadlines |
| **Executive metrics** | `executiveMetrics.ts` computes 20+ derived metrics (FCR, RFT, health score, exposure) |
| **Role-based tab access** | `ROLE_TABS` + permission guards in `App.tsx` enforce authorization |
| **Accessibility primitives** | Focus trapping (Modal), skip links, ARIA roles, `focus-ring` utility |
| **Type safety** | Strong TypeScript types for domain models, component props, API contracts |
| **Error boundaries** | `ErrorBoundary` + `PageErrorBoundary` catch render errors |

### Weaknesses & Technical Debt

| Issue | Severity | Location | Impact |
|-------|----------|----------|--------|
| **Monolithic AppContext** | Critical | `AppContext.tsx` (568 lines) | 549-line `useMemo` dependency array; all consumers re-render on any state change; violates single-responsibility |
| **Props drilling** | High | `TicketWorkspacePage` → `TicketDetailView` (24 props) | Fragile, hard to test, couples parent to child implementation |
| **State in UI components** | High | `TicketListPane` has 15+ `useState` (filters, selection, SLA, etc.) | Business logic mixed with presentation; not portable |
| **Inline sub-components** | Medium | `TicketDetailView` defines 15+ inline functions/components | Bloats file (548 lines), prevents reuse, hurts tree-shaking |
| **Duplicate filter logic** | Medium | `TicketListPane`, `ExecutiveDashboardPage`, `MajorIncidentsPage` each implement filtering | Inconsistent UX, maintenance burden |
| **CSS variable leakage** | Medium | `index.css` defines 200+ CSS vars but utility classes use arbitrary values (`text-[12px]`, `bg-primary/5`) | Design tokens not enforced; visual drift |
| **No design token enforcement** | High | Components use `text-[11px]`, `px-2.5`, `py-1.5` instead of token refs | Spacing/typography inconsistent across 30+ components |
| **Missing component library entry** | Medium | `src/components/ui/index.tsx` exports only 8 of 30+ primitives | Consumers import from deep paths; no single source of truth |
| **Server/client type sharing** | Low | `server/database.types.ts` vs `src/types/admin.ts` | Potential drift between API contracts and client types |
| **HMR disabled** | Low | `vite.config.ts: hmr: false` | Developer experience penalty; CSS changes require full reload |

---

## 3. UX AUDIT — Prioritized Issues

| # | Severity | Location | Problem | User Impact | Recommended Solution |
|---|----------|----------|---------|-------------|----------------------|
| **UX-1** | **Critical** | Ticket List (288px) | Card background `#FFFFFF` on parent `#FFFFFF` — invisible cards, only thin border visible | Users cannot distinguish tickets; high cognitive load to parse list | Use elevation tokens: `bg-surface-card` + `shadow-card` on `bg-surface-elevated` parent; or use `bg-surface-container-low` |
| **UX-2** | **Critical** | Ticket Workspace | 3-pane layout collapses on mobile; left pane hidden behind FAB | Mobile users lose list context; cannot switch tickets efficiently | Implement responsive drawer pattern: persistent list on tablet, bottom-sheet on mobile with swipe gesture |
| **UX-3** | **High** | Ticket Detail View | 7 status-driven action branches rendered inline; no progressive disclosure | Agents see irrelevant actions; decision fatigue; 548-line file | Extract `StatusActionPanel` (already exists) + `ActionRegistry` pattern; show only valid transitions |
| **UX-4** | **High** | Customer Portal | 4-step slider form with 18+ fields; transaction step dynamically renders 10+ fields | High abandonment risk; users lose context; validation errors scattered | Split into: Identity → Transaction → Evidence → Review; show step completion; save draft automatically |
| **UX-5** | **High** | Executive Dashboard | 5 tabs, 20+ charts, drill-down modals, cross-filters; no empty-state guidance | Executives overwhelmed; cannot find actionable insights quickly | Default to "Performance" with 4 key KPIs; progressive disclosure for deep-dive; add "Insights" summary card |
| **UX-6** | **Medium** | Major Incidents | Declaration modal = 2 steps with 15+ fields; PIR form at bottom of 3rd column | High-stakes workflow buried; easy to miss required fields | Dedicated full-screen wizard with step validation; inline guidance for SEV-1 justification |
| **UX-7** | **Medium** | Ticket Chat | @mention autocomplete, reply threading, quick replies, evidence upload all in one panel | Cognitive overload; primary action (send) competes with secondary features | Split into: Message composer (primary) + Attachments drawer + Thread actions menu |
| **UX-8** | **Medium** | Sidebar | 65 nav items, collapsed/expanded, role-filtered, badge counts | Users hunt for tabs; badges blend with text; no search | Add keyboard shortcut palette (⌘K); group by workflow not section; badge contrast fix |
| **UX-9** | **Medium** | Status badges | 9 statuses + 4 priorities; inconsistent label casing (`WAITING_CUSTOMER` vs `Waiting for Customer`) | Scanning slow; inconsistent mental model | Standardize labels in `TICKET_STATUS_LABELS`; use `StatusBadge` everywhere |
| **UX-10** | **Low** | Empty states | Generic "No tickets match" without actionable next steps | Users don't know how to recover | Contextual empty states: "No tickets in **Assigned** — try clearing Status filter" |

---

## 4. INFORMATION ARCHITECTURE AUDIT

### Current Organization Problems

| Problem | Evidence | Fix |
|---------|----------|-----|
| **Tabs organized by feature, not workflow** | `tickets`, `major_incidents`, `dashboard`, `kb` all top-level | Group by user job: **Operate** (Tickets, MI), **Analyze** (Dashboard, Reports), **Knowledge** (KB, Templates), **Admin** (Settings, Reference) |
| **Customer Portal split across two views** | `file_complaint` + `customer_records` tabs in same page | Separate pages: `/complaints/new` + `/complaints/lookup` with shared header |
| **Right panel duplicates detail tabs** | Watchers, Intelligence, Files in right panel AND detail tabs | Consolidate: Watchers/Files → Detail tabs; Intelligence → separate "Insights" drawer |
| **Modal explosion** | 8+ modals in TicketWorkspace (Escalation, Merge, NewTicket, DeclareMI, etc.) | Use drawers for multi-step flows; modals only for confirmations |
| **URL state partial** | Only `tab` + `ticket` in URL; filters, selection lost on refresh | Persist all view state in URL (search, priority, status, SLA tag, selection) |

### Recommended IA

```
/app
  /operate
    /tickets              # Ticket Workspace (default)
    /major_incidents      # MI Command Center
  /analyze
    /dashboard            # Executive KPIs
    /reports              # Scheduled/exported reports
  /knowledge
    /kb                   # Knowledge Base
    /templates            # Ticket templates, RCA templates
  /complaints             # Customer-facing
    /new                  # File complaint wizard
    /lookup               # Customer record search
  /partner                # Payment Partner Portal
  /admin
    /settings             # AdminSettingsPage
    /reference            # ReferenceDataPage
    /rbac                 # Roles & permissions
```

---

## 5. USER FLOW IMPROVEMENTS

### Top 5 Workflows to Redesign

| Workflow | Current Steps | Improved Steps | Rationale |
|----------|---------------|----------------|-----------|
| **Create Ticket (Agent)** | 1. Click "New" → 2. Modal with 12 fields → 3. Submit | 1. Inline "New Ticket" row in list → 2. Inline edit → 3. Auto-save draft → 4. Submit | Reduces modal context-switch; inline creation keeps list visible |
| **File Complaint (Customer)** | 4-step slider, 18 fields, duplicate check modal | 3-step wizard: Identity (optional) → Transaction (dynamic) → Evidence → Review + Submit | Optional identity step; dynamic fields only show when relevant; review step catches errors |
| **Declare Major Incident** | 2-step modal, 15 fields, buried in header action | Full-screen wizard: Triage → Assessment → Broadcast → Confirm | High-stakes action deserves dedicated space; step validation prevents incomplete declarations |
| **Resolve Ticket (Partner)** | Status dropdown → RCA form inline → AI generate → Template save → Submit | Dedicated "Resolution" drawer: Evidence → RCA → Customer Response → Accept/Reject | Separates investigation from resolution; progressive disclosure of RCA fields |
| **Executive Review** | Dashboard tab → drill-down modal → cross-filter → export | Dashboard → Insights card → Deep-dive page (not modal) → Scheduled report | Modals break flow; deep-dive pages are bookmarkable/shareable |

---

## 6. PROPOSED DESIGN SYSTEM

### 6.1 Color System (Semantic Tokens)

```css
/* Brand — RETAINED: Dark Red #8B0000 */
--color-brand: #8B0000;
--color-brand-light: #A52A2A;
--color-brand-dark: #6B0000;

/* Neutral Foundation (12-step scale) */
--color-neutral-0: #FFFFFF;
--color-neutral-50: #FAFAFA;
--color-neutral-100: #F5F5F5;
--color-neutral-200: #E5E5E5;
--color-neutral-300: #D4D4D4;
--color-neutral-400: #A3A3A3;
--color-neutral-500: #737373;
--color-neutral-600: #525252;
--color-neutral-700: #404040;
--color-neutral-800: #262626;
--color-neutral-900: #171717;
--color-neutral-950: #0A0A0A;

/* Semantic Surfaces */
--color-bg-app: var(--color-neutral-50);
--color-bg-surface: var(--color-neutral-0);
--color-bg-surface-raised: var(--color-neutral-0);
--color-bg-surface-sunken: var(--color-neutral-100);
--color-bg-hover: var(--color-neutral-100);
--color-bg-active: var(--color-neutral-200);

/* Semantic Text */
--color-text-primary: var(--color-neutral-900);
--color-text-secondary: var(--color-neutral-600);
--color-text-muted: var(--color-neutral-400);
--color-text-inverse: var(--color-neutral-0);
--color-text-link: var(--color-brand);

/* Semantic Borders */
--color-border-subtle: var(--color-neutral-200);
--color-border-default: var(--color-neutral-300);
--color-border-strong: var(--color-neutral-400);
--color-border-focus: var(--color-brand);

/* Status Colors (accessible, not decorative) */
--color-success: #16A34A;      --color-success-bg: #F0FDF4;      --color-success-fg: #166534;
--color-warning: #D97706;      --color-warning-bg: #FFFBEB;      --color-warning-fg: #92400E;
--color-error:   #DC2626;      --color-error-bg:   #FEF2F2;      --color-error-fg:   #991B1B;
--color-info:    #2563EB;      --color-info-bg:    #EFF6FF;      --color-info-fg:    #1D4ED8;

/* Priority (mapped to status) */
--color-priority-critical: var(--color-error);
--color-priority-high:     var(--color-warning);
--color-priority-medium:   var(--color-info);
--color-priority-low:      var(--color-success);

/* Dark mode overrides (selective) */
.dark {
  --color-bg-app: var(--color-neutral-950);
  --color-bg-surface: var(--color-neutral-900);
  --color-bg-surface-raised: var(--color-neutral-800);
  --color-bg-hover: var(--color-neutral-800);
  --color-text-primary: var(--color-neutral-50);
  --color-text-secondary: var(--color-neutral-400);
  --color-text-muted: var(--color-neutral-500);
  --color-border-subtle: var(--color-neutral-800);
  --color-border-default: var(--color-neutral-700);
}
```

### 6.2 Typography

| Token | Size | Weight | Line Height | Use Case |
|-------|------|--------|-------------|----------|
| `--text-display` | 2.25rem (36px) | 700 | 1.15 | Page titles, hero |
| `--text-h1` | 1.875rem (30px) | 700 | 1.2 | Section headers |
| `--text-h2` | 1.5rem (24px) | 600 | 1.3 | Card titles |
| `--text-h3` | 1.25rem (20px) | 600 | 1.35 | Subsection |
| `--text-h4` | 1.125rem (18px) | 600 | 1.4 | List headers |
| `--text-body-lg` | 1rem (16px) | 400 | 1.6 | Primary content |
| `--text-body` | 0.875rem (14px) | 400 | 1.6 | Default UI text |
| `--text-body-sm` | 0.8125rem (13px) | 400 | 1.5 | Dense tables, metadata |
| `--text-caption` | 0.75rem (12px) | 400 | 1.4 | Labels, hints |
| `--text-overline` | 0.625rem (10px) | 600 | 1.4 | Category labels, badges |
| `--text-mono` | 0.75rem (12px) | 400 | 1.5 | IDs, amounts, codes |

**Font Families**: `--font-sans: "Inter"`, `--font-heading: "Montserrat"`, `--font-mono: "JetBrains Mono"`

### 6.3 Spacing System (4px base)

| Token | Value | Use Case |
|-------|-------|----------|
| `--space-0` | 0 | Reset |
| `--space-1` | 4px | Inline gaps, icon-text |
| `--space-2` | 8px | Form field gaps, button padding |
| `--space-3` | 12px | Card internal padding |
| `--space-4` | 16px | Section gaps, card margins |
| `--space-5` | 20px | Card padding lg |
| `--space-6` | 24px | Page section gaps |
| `--space-8` | 32px | Major section gaps |
| `--space-10` | 40px | Page margins |
| `--space-12` | 48px | Hero sections |

### 6.4 Border Radius

| Token | Value | Use Case |
|-------|-------|----------|
| `--radius-none` | 0 | Tables, full-bleed |
| `--radius-sm` | 4px | Badges, chips, small inputs |
| `--radius-md` | 8px | Buttons, inputs, cards (default) |
| `--radius-lg` | 12px | Modals, drawers, elevated cards |
| `--radius-xl` | 16px | Page containers, hero cards |
| `--radius-full` | 9999px | Pills, avatars, progress rings |

### 6.5 Elevation (Shadow Scale)

| Token | Value | Use Case |
|-------|-------|----------|
| `--shadow-0` | none | Flat surfaces |
| `--shadow-1` | `0 1px 2px rgba(0,0,0,.04)` | Cards at rest |
| `--shadow-2` | `0 1px 3px rgba(0,0,0,.06), 0 1px 2px -1px rgba(0,0,0,.04)` | Hover cards |
| `--shadow-3` | `0 4px 12px -2px rgba(0,0,0,.08)` | Dropdowns, popovers |
| `--shadow-4` | `0 8px 24px -4px rgba(0,0,0,.10)` | Modals, drawers |
| `--shadow-5` | `0 16px 48px -8px rgba(0,0,0,.12)` | Full-screen overlays |

### 6.6 Component Primitives (Unified)

| Component | Variants | Sizes | States |
|-----------|----------|-------|--------|
| **Button** | primary, secondary, outline, ghost, danger | sm, md, lg, icon | default, hover, active, focus, loading, disabled |
| **Input** | text, email, password, number, search | sm, md | default, focus, error, disabled, helper |
| **Select** | native, combobox (future) | sm, md | default, focus, error, disabled |
| **Checkbox** | single, indeterminate | sm, md | default, hover, focus, checked, disabled |
| **Radio** | single, group | sm, md | default, focus, checked, disabled |
| **Switch** | - | sm, md | default, focus, checked, disabled |
| **Badge** | success, warning, error, info, neutral | sm, md, dot | - |
| **StatusBadge** | all 9 statuses + 4 priorities | sm, md | - |
| **Card** | elevated, outlined, filled | padding: none/sm/md/lg | hoverable, clickable |
| **Modal** | sm, md, lg, xl, full | - | open, closing, closed |
| **Drawer** | bottom, right, left | sm, md, lg, full | open, closing, closed |
| **Table** | striped, bordered, hoverable | - | loading, empty, error |
| **Tabs** | horizontal, vertical | - | active, disabled |
| **Toast** | success, error, warning, info | - | visible, dismissing |
| **Tooltip** | top, bottom, left, right | - | visible, hidden |
| **Dropdown** | menu, select | - | open, closed |
| **Progress** | bar, radial, steps | sm, md, lg | indeterminate, complete |
| **Skeleton** | text, card, table-row, avatar, chart | - | pulse, wave |
| **EmptyState** | icon + title + message + action | - | - |

### 6.7 Motion Principles

| Principle | Implementation |
|-----------|----------------|
| **Purposeful** | Only animate state changes (enter/exit, expand/collapse, loading) |
| **Fast** | 150ms micro-interactions, 250ms transitions, 350ms modal/drawer |
| **Easing** | `--ease-out: cubic-bezier(0, 0, 0.2, 1)` for exits, `--ease-in-out` for transitions |
| **Reduced Motion** | Respect `prefers-reduced-motion` — disable all non-essential animation |
| **No Layout Thrash** | Use `transform`/`opacity` only; avoid animating `width`/`height`/`top`/`left` |
| **Stagger** | 50ms stagger for list enter animations |

---

## 7. COMPONENT ARCHITECTURE

### Proposed Hierarchy

```
src/components/
├── ui/                          # Design system primitives (30+)
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.stories.tsx
│   │   ├── Button.test.tsx
│   │   └── index.ts
│   ├── Input/
│   ├── Select/
│   ├── Modal/
│   ├── Card/
│   ├── Table/
│   ├── Badge/
│   ├── StatusBadge/
│   ├── Tabs/
│   ├── Toast/
│   ├── Tooltip/
│   ├── Dropdown/
│   ├── Progress/
│   ├── Skeleton/
│   ├── EmptyState/
│   ├── Card/
│   ├── Avatar/
│   ├── Spinner/
│   ├── ProgressWizard/
│   ├── ProgressBar/
│   ├── KpiCard/
│   ├── GovernanceChart/
│   ├── GovernanceDrillDown/
│   ├── ConfirmModal/
│   ├── PageErrorBoundary/
│   ├── ErrorBoundary/
│   ├── Breadcrumbs/
│   ├── Pagination/
│   ├── SliderForm/
│   ├── ColorPicker/
│   ├── FileUpload/
│   ├── Toggle/
│   └── index.ts                 # BARREL: export all primitives
├── layout/
│   ├── PageContainer.tsx
│   ├── PageHeader.tsx
│   ├── PageTransition.tsx
│   ├── AppShell.tsx             # NEW: TopBar + Sidebar + Main + Footer
│   ├── ResponsiveSidebar.tsx    # NEW: Handles mobile/tablet/desktop
│   └── DataTableToolbar.tsx     # NEW: Search + filters + density + export
├── forms/
│   ├── FormField.tsx            # Label + Input + Error + Helper
│   ├── FormSection.tsx          # Collapsible section with validation summary
│   ├── FormWizard.tsx           # Multi-step with progress, draft save
│   ├── DynamicFormStep.tsx      # (existing, refine)
│   └── DuplicateResolutionModal.tsx
├── ticket/
│   ├── TicketCard.tsx           # NEW: Reusable ticket card (list + compact)
│   ├── TicketList.tsx           # Virtualized list with selection, filters
│   ├── TicketDetail.tsx         # Composed from sections
│   ├── TicketHeader.tsx         # ID, status, priority, SLA, actions
│   ├── TicketProgress.tsx       # ProgressWizard + blockers
│   ├── TicketMetadata.tsx       # Key-value grid
│   ├── TicketActions.tsx        # Status-driven action registry
│   ├── TicketChat.tsx           # Composer + thread + attachments
│   ├── TicketTabs.tsx           # Activity / Intelligence / Watchers / Files
│   ├── SlaCountdown.tsx
│   └── StatusActionPanel.tsx
├── dashboard/
│   ├── KpiGrid.tsx
│   ├── ChartCard.tsx
│   ├── PartnerScorecard.tsx
│   ├── AlertBanner.tsx
│   ├── HealthScore.tsx
│   ├── DrillDownModal.tsx
│   └── ExecutiveInsights.tsx
├── mi/
│   ├── MiTimeline.tsx
│   ├── MiControls.tsx
│   ├── MiPirForm.tsx
│   ├── MiNotificationLog.tsx
│   └── DeclareMiWizard.tsx
├── auth/
│   ├── LoginForm.tsx
│   ├── AuthLayout.tsx
│   └── PasswordToggle.tsx
└── onboarding/
    ├── OnboardingTour.tsx
    └── CommandPalette.tsx
```

### Key Patterns

1. **Action Registry** — `TicketActions` consumes `actionState` from `StatusActionPanel`; each action registers `{ label, icon, handler, variant, roles }`
2. **Compound Components** — `Table` + `DataTableToolbar` + `Pagination` compose via context
3. **Render Props for Flexibility** — `Card` accepts `renderHeader`, `renderFooter`
4. **Controlled + Uncontrolled** — `Input`, `Select` support both patterns
5. **Polymorphic `as` Prop** — `Button`/`Link` share component via `asChild` pattern (Radix-style)

---

## 8. REDESIGN ROADMAP

### Phase 0 — Foundation (Week 1-2)

| Task | Dependencies | Deliverable |
|------|--------------|-------------|
| 0.1 Design token migration | — | Complete `@theme` + `:root` with semantic tokens (this doc §6) |
| 0.2 Component library barrel | — | `src/components/ui/index.ts` exporting all 30+ primitives |
| 0.3 Token enforcement script | 0.1 | ESLint rule: disallow arbitrary values (`text-[12px]`, `p-2.5`) in favor of tokens |
| 0.4 Storybook setup | 0.2 | Component docs + visual regression testing |
| 0.5 Enable HMR | — | `vite.config.ts: hmr: true` (fixes CSS reload issue) |

### Phase 1 — Layout & Navigation (Week 2-3)

| Task | Dependencies | Deliverable |
|------|--------------|-------------|
| 1.1 `AppShell` component | 0.1, 0.2 | Composed shell: TopBar + ResponsiveSidebar + Main + Footer |
| 1.2 Responsive sidebar | 1.1 | Desktop: collapsible (64/256px); Tablet: overlay drawer; Mobile: bottom-sheet |
| 1.3 Navigation IA restructure | 1.1 | Group tabs: Operate / Analyze / Knowledge / Admin |
| 1.4 Keyboard shortcuts (⌘K) | 1.1 | CommandPalette integrated with tab/actions search |
| 1.5 URL state persistence | 1.1 | All view state (filters, selection, density) in URL |

### Phase 2 — Ticket Workspace (Week 3-5)

| Task | Dependencies | Deliverable |
|------|--------------|-------------|
| 2.1 `TicketCard` primitive | 0.1, 0.2 | Reusable card: density variants, selection, SLA badge, hover states |
| 2.2 `TicketList` virtualized | 2.1 | `react-window` for 1000+ tickets; sticky headers; column resize |
| 2.3 `TicketDetail` composition | 2.1 | Header + Progress + Metadata + Actions + Tabs (composed) |
| 2.4 Action Registry pattern | 2.3 | `ActionRegistry` maps status×role → allowed actions; replaces inline branches |
| 2.5 Inline ticket creation | 2.2 | "New Ticket" row at list top; expands inline; auto-saves draft |
| 2.6 Chat panel refactor | 2.3 | Composer (primary) + Attachments drawer + Thread actions menu |
| 2.7 Right panel consolidation | 2.3 | Watchers/Files → Detail tabs; Intelligence → Insights drawer |

### Phase 3 — Customer Portal (Week 5-6)

| Task | Dependencies | Deliverable |
|------|--------------|-------------|
| 3.1 `FormWizard` primitive | 0.2 | Multi-step with progress, draft auto-save, step validation |
| 3.2 Split into two pages | 3.1 | `/complaints/new` (wizard) + `/complaints/lookup` (search + history) |
| 3.3 Dynamic transaction fields | 3.1 | `DynamicFormStep` with conditional visibility, async validation |
| 3.4 Duplicate detection UX | 3.2 | Inline "Potential duplicate found" banner with merge/create actions |

### Phase 4 — Executive Dashboard (Week 6-7)

| Task | Dependencies | Deliverable |
|------|--------------|-------------|
| 4.1 Default "Insights" view | 0.1 | 4 KPIs + AI-generated insights + health score; progressive disclosure |
| 4.2 Deep-dive pages (not modals) | 4.1 | `/dashboard/partners/:id`, `/dashboard/trends`, `/dashboard/risk` |
| 4.3 Cross-filter URL sync | 4.1 | All filters in URL; bookmarkable/shareable views |
| 4.4 Scheduled reports UI | 4.2 | Report builder + schedule + delivery (email, PDF, CSV) |

### Phase 5 — Major Incidents (Week 7-8)

| Task | Dependencies | Deliverable |
|------|--------------|-------------|
| 5.1 `DeclareMiWizard` full-screen | 0.1, 1.1 | 4-step: Triage → Scope → Assessment → Broadcast |
| 5.2 PIR as dedicated page | 5.1 | `/major-incidents/:id/pir` with version history |
| 5.3 Timeline as virtualized list | 5.1 | 1000+ entries; sticky header; filter by role/date |

### Phase 6 — Cross-Cutting Polish (Week 8-9)

| Task | Dependencies | Deliverable |
|------|--------------|-------------|
| 6.1 Global empty/error/loading states | 0.2 | Consistent `EmptyState`, `Skeleton`, `ErrorState` everywhere |
| 6.2 Keyboard navigation audit | — | Every interactive element reachable; focus visible; skip links |
| 6.3 Color contrast audit | 0.1 | All text ≥ 4.5:1; UI elements ≥ 3:1; fix brand-on-white issues |
| 6.4 Performance: code-split + lazy | 1.1 | Route-level lazy (already); component-level for heavy charts |
| 6.5 Visual regression tests | 0.4 | Playwright + Percy/Chromatic for 50+ component states |

### Phase 7 — Accessibility & QA (Week 9-10)

| Task | Deliverable |
|------|-------------|
| 7.1 Full WCAG 2.1 AA audit | Automated (axe) + manual (screen reader, keyboard) |
| 7.2 Focus management in modals/drawers | Trap + restore; `Tab`/`Shift+Tab` cycling |
| 7.3 Live regions for toasts/notifications | `aria-live="polite"` for toasts; `assertive` for errors |
| 7.4 Reduced motion compliance | All animations respect `prefers-reduced-motion` |
| 7.5 Touch target sizing | Minimum 44×44px; 8px gap between targets |

---

## 9. RISK ASSESSMENT

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **AppContext refactor breaks consumers** | High | High | Strangler Fig: create new domain hooks alongside; migrate one page at a time; keep `AppContext` as facade |
| **CSS token migration causes visual regressions** | Medium | High | Visual regression tests (Phase 0.4); snapshot comparison; staged rollout per page |
| **SSE reconnection logic broken** | Low | High | Integration test: simulate disconnect/reconnect; verify state sync |
| **React Query cache invalidation** | Medium | Medium | Centralize `queryClient.invalidateQueries` in mutation helpers; audit all `setTickets` calls |
| **Role-based tab access drift** | Medium | Medium | Unit test `ROLE_TABS` + `can()` against `UserRole` enum; add CI check |
| **Mobile drawer breaks on iOS Safari** | Medium | Medium | Test on real devices; use `position: sticky` fallback; avoid `vh` units |
| **Chart library upgrade (Recharts)** | Low | Medium | Pin version; test rendering in headless CI; snapshot charts |
| **Bundle size growth** | Medium | Medium | Enforce `esbuild` analyze in CI; budget: <200KB gzipped initial JS |
| **Server/client type drift** | Low | High | Generate TypeScript from OpenAPI spec (`openapi.ts`); single source of truth |
| **Auth flow regression** | Low | Critical | E2E tests for login, session restore, role switch, password reset, MFA |

---

## 10. CLARIFYING QUESTIONS

1. **Brand color lock-in**: You specified "retain my brand color" (#8B0000 Dark Red). Should the semantic system use this as primary action color, or only for brand moments (logo, primary buttons)?

2. **Density default**: Current `compactDensity` toggle exists but isn't used consistently. Should "comfortable" (current) or "compact" be default for agents?

3. **Chart library**: Recharts is used heavily. Any preference to stay or evaluate lighter alternatives (e.g., `@visx`, `chart.js`)?

4. **Real-time requirements**: SSE currently pushes all events to all clients. Should we add server-side filtering (per-user channels) to reduce client noise?

5. **Internationalization**: Any near-term i18n needs? Current strings are hardcoded English.

6. **Design token format**: Tailwind v4 `@theme` is CSS-first. Should we also generate a `tokens.json` for Figma sync (Style Dictionary)?

7. **Component testing**: Current tests are sparse. Target coverage threshold for new components?

8. **Migration strategy**: Big-bang per-phase, or incremental per-page behind feature flags?

---

## APPENDIX: FILE INVENTORY FOR MIGRATION

### Files to Refactor (High Priority)
- `src/context/AppContext.tsx` → Split into domain providers
- `src/pages/ticket-workspace/TicketWorkspacePage.tsx` → Compose from `TicketList` + `TicketDetail` + `TicketChat`
- `src/pages/ticket-workspace/TicketDetailView.tsx` → Extract inline components
- `src/pages/ticket-workspace/TicketListPane.tsx` → Use `TicketCard` + `TicketList`
- `src/pages/CustomerPortalPage.tsx` → Split into `ComplaintWizard` + `CustomerLookup`
- `src/pages/ExecutiveDashboardPage.tsx` → Extract `KpiGrid`, `ChartCard`, `PartnerScorecard`
- `src/pages/MajorIncidentsPage.tsx` → Extract `MiTimeline`, `MiControls`, `DeclareMiWizard`

### Files to Create (New Primitives)
- `src/components/ui/FormField.tsx`
- `src/components/ui/FormSection.tsx`
- `src/components/ui/FormWizard.tsx`
- `src/components/ui/DataTableToolbar.tsx`
- `src/components/ticket/TicketCard.tsx`
- `src/components/ticket/TicketList.tsx`
- `src/components/ticket/TicketActions.tsx`
- `src/components/ticket/TicketChat.tsx`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/ResponsiveSidebar.tsx`
- `src/components/mi/DeclareMiWizard.tsx`
- `src/components/mi/MiPirForm.tsx`

### Files to Deprecate/Remove
- Inline sub-components in `TicketDetailView` (PriorityBadge, TransitionBlockers, SlaBreachBanner, SectionHeader, TicketMetadata, RcaReadout, DetailTabs, DetailTabContent, EvidenceTab)
- `src/components/ui/Tilt3D.tsx` (unused decorative effect)
- `src/components/ui/animated-ai-chat.tsx` (unused)
- Duplicate filter logic in `ExecutiveDashboardPage`, `MajorIncidentsPage`, `TicketListPane`

---

**End of Audit & Roadmap**

*This document represents the Phase 0-2 deliverable. Implementation begins upon approval.*