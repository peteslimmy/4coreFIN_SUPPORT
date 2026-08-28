# Comprehensive Codebase Audit Plan
## 4CoreFinSupport — FinTech Incident Control & Payment Operations Intelligence

**Status**: PLAN MODE — READ-ONLY ANALYSIS  
**Branch**: `develop` (12 commits ahead of origin)  
**Date**: 2026-08-28

---

## Executive Summary

This is a **React 19 + TypeScript + Vite + Express + Supabase** full-stack FinTech application for payment incident management. The codebase shows significant recent refactoring (150+ modified files, 2 deleted pages, many new components). The audit must cover security, correctness, display, performance, and maintainability.

---

## Audit Categories & Methodology

### 1. 🔴 CRITICAL SECURITY AUDIT (Highest Priority)

#### 1.1 Authentication & Authorization
- [ ] **Supabase Auth Integration** (`server/auth.ts`, `server/supabase.ts`)
  - Verify all login flows go through Supabase Auth (no local password verification in production)
  - Check JWT secret validation: 32+ chars, not repeated, proper rotation strategy
  - Verify token version invalidation on password change works correctly
  - Check CSRF double-submit cookie implementation timing-safe comparison
  - Verify same-origin referer/origin checks don't have bypasses
  - Confirm `requireAuth` middleware validates `tokenVersion` against DB

- [ ] **RBAC & Permission Gates** (`server/rbac.ts`, `server/middleware/requirePermission.ts`, `server/middleware/requireAdmin.ts`)
  - Map all role combinations to permissions matrix
  - Verify no privilege escalation paths (e.g., BU_SUPPORT → SUPER_ADMIN)
  - Check partner-scoped access controls in `server/routes/partnerPortal.ts`
  - Verify multi-tenant isolation in `server/tenant.ts` + `canAccessTicket`

- [ ] **Encryption & Secrets** (`server/services/encryptionService.ts`, `server/auth.ts`)
  - AES-256-GCM implementation: IV uniqueness, auth tag verification
  - ENCRYPTION_KEY validation: 64 hex chars, 32 bytes, startup validation
  - Check for hardcoded secrets in codebase (grep for patterns)
  - Verify PII encryption at rest: `maskValue` usage in logs/errors

- [ ] **Rate Limiting & DoS Protection** (`server.ts`, `server/middleware/`)
  - General API: 600 req/min (tunable via `API_RATE_LIMIT_MAX`)
  - Auth endpoints: 20 req/15min
  - Upload endpoints: 60 req/min + concurrency gate (8 concurrent, 40 queued)
  - Verify `trust proxy` only enabled via explicit `TRUST_PROXY=1`
  - Check for rate limit bypasses (health check, Swagger UI)

- [ ] **Input Validation & Sanitization** (`server/middleware/validateBody.ts`, `server/validation.ts`, `server/lib/promptSanitizer.ts`, `server/lib/svgSanitize.ts`)
  - Zod schema coverage on all route inputs
  - SVG upload sanitization (XSS prevention)
  - Prompt injection protection for AI endpoints
  - SQL injection: verify all Supabase queries use parameterized `.eq()`, `.ilike()` with `escapeLike`

- [ ] **CORS, CSP, Headers** (`server/middleware/csp.ts`, `server.ts`)
  - CSP nonce per request, strict in production
  - Permissions-Policy headers (camera, mic, geo, payment, usb disabled)
  - HSTS in production (1 year, includeSubDomains, preload)
  - COOP, CORP, Referrer-Policy, Origin-Agent-Cluster

#### 1.2 Data Protection & Compliance
- [ ] **Audit Logging** (`server/auditEvents.ts`, `server/auditCatalog.ts`, `server/routes/audit.ts`)
  - Immutable audit trail for all state changes
  - PII redaction in logs (`maskValue` usage)
  - Retention policy compliance (GDPR, SOX, PCI-DSS)

- [ ] **File Upload Security** (`server/middleware/uploadGate.ts`, `server/services/imageProcessingService.ts`)
  - Size limits: 5MB (evidence, avatar, branding), 10MB (storage, landing page)
  - MIME type validation, magic byte checking
  - Sharp image processing: strip metadata, resize limits

#### 1.3 Infrastructure Secrets
- [ ] **Environment Variables** (`.env`, `.env.example`)
  - `.env` in `.gitignore` ✓ (confirmed)
  - Rotate all production secrets (JWT_SECRET, ENCRYPTION_KEY, Supabase keys, GEMINI_API_KEY)
  - No secrets in `.env.test.example` or test fixtures

---

### 2. 🟠 CORRECTNESS & BUG HUNTING

#### 2.1 TypeScript & Compile-Time Safety
- [ ] **Type Coverage** (`tsc --noEmit`, `package.json:lint`)
  - Current: `test_connection2.ts` error only (standalone test file)
  - Check for `any` usage: 99+ warnings fixed, verify no regressions
  - Strict mode: `skipLibCheck: true` — verify no type holes
  - Path aliases: `@/*` → `./*` (root) — verify no resolution issues

#### 2.2 Runtime Correctness
- [ ] **React Patterns** (150+ component files)
  - Hook rules: `exhaustive-deps`, `set-state-in-effect` — fixed 9 warnings
  - Component purity: `Date.now()` in render → fixed with `useMemo`
  - Fast refresh: non-component exports moved to separate files
  - Memory leaks: cleanup in `useEffect` (intervals, subscriptions, SSE)

- [ ] **Async Error Handling** (`server.ts:wrapAsyncHandlers`)
  - All async route handlers wrapped for rejection forwarding
  - Verify no unhandled promise rejections in routes

- [ ] **Database Operations** (`server/repository.ts`, `server/routes/*.ts`)
  - Transaction boundaries for multi-table writes
  - Optimistic locking / version checks (tokenVersion, SLA)
  - RLS policies aligned with `requireAuth` + `canAccessTicket`

#### 2.3 State Management
- [ ] **React Context** (`src/context/AppContext.tsx`, `TicketContext.tsx`, `UiContext.tsx`, `AppShellContext.tsx`)
  - No stale closures in context providers
  - Selective re-renders (context splitting)
  - No circular dependencies

- [ ] **Server State** (`@tanstack/react-query`, `src/hooks/useSettings.ts`)
  - Cache invalidation on mutations
  - Stale-while-revalidate behavior
  - Error boundaries for query failures

---

### 3. 🟡 DISPLAY & UX ISSUES

#### 3.1 Responsive & Layout
- [ ] **Landing Page** (`src/pages/LandingPage.tsx`)
  - Text wrapping on mobile: heading `text-3xl sm:text-4xl md:text-6xl`
  - Description `max-w-2xl` responsive typography
  - Button layout: `flex items-center gap-3` (no wrap)
  - Background scrim gradients (`from-black/60`, etc.) — verify contrast

- [ ] **Ticket Workspace** (`src/pages/ticket-workspace/*.tsx`)
  - `TicketListPane`: PriorityChips extracted (fixed render bug)
  - `TicketDetailView`: responsive panels, mobile drawer
  - `TicketChatPanel`: virtualized messages, scroll restoration
  - `RightPanel` / `IntelligenceSection`: lazy-loaded heavy components

- [ ] **Dashboard & Executive Views** (`src/components/dashboard/`, `src/components/executive/`)
  - Chart responsiveness (Recharts)
  - KPI cards: truncation, tooltip overflow
  - Partner scorecard tables: horizontal scroll on mobile

#### 3.2 Accessibility (a11y)
- [ ] **ARIA & Semantic HTML** (100+ fixes already applied)
  - Label/input pairs (`htmlFor`/`id`)
  - Icon buttons: `aria-label` or `aria-labelledby`
  - Decorative elements: `aria-hidden`
  - Keyboard navigation: `tabIndex`, `onKeyDown`, `role`
  - Live regions: `role="alert"`, `aria-live`
  - Focus management: `focus-ring` utility, focus trapping in modals

- [ ] **Color Contrast & Design Tokens**
  - `no-restricted-syntax` ESLint rule: 0 warnings (was 174)
  - Dark mode: CSS variables `--color-*` for all tokens
  - No raw `bg-white`, `text-white`, `bg-black` in components

#### 3.3 Visual Regression
- [ ] **Storybook** (`storybook-static/`, `.storybook/`)
  - Component coverage: UI primitives, forms, modals, charts
  - Chromatic or visual diff tests
  - Dark/light theme variants

---

### 4. 🟢 PERFORMANCE & SCALABILITY

#### 4.1 Frontend Bundle
- [ ] **Bundle Analysis** (`vite build` output)
  - Chunk >500KB: `ExecutiveDashboardPage` (573KB), `index-lo1Pe2Ad.js` (471KB)
  - Code splitting: dynamic imports for heavy pages
  - Tree shaking: verify no dead code in `dist/`
  - Vite config: `manualChunks` for vendor splitting

#### 4.2 Runtime Performance
- [ ] **React Optimizations**
  - `React.memo` on list items (`TicketCard`, list rows)
  - `useMemo`/`useCallback` for expensive computations
  - Virtualization: `react-window` for long lists (tickets, audit logs)

- [ ] **Image Optimization** (`server/services/imageOptimizationService.ts`)
  - Sharp: WebP/AVIF, responsive sizes, lazy loading
  - Hero image: `useHeroImage` hook, eager fetch, priority hints

#### 4.3 Backend Scalability
- [ ] **Connection Pooling** (`server/supabase.ts`)
  - Supabase client singleton, connection limits
  - Prepared statements for frequent queries

- [ ] **Background Jobs** (`server/slaJob.ts`, `server/escalationEngine.ts`)
  - Interval-based (60s SLA, 120s escalation)
  - Idempotent processing, graceful shutdown
  - Lockout service: Redis or DB-based distributed lock

---

### 5. 🔵 MAINTAINABILITY & TECH DEBT

#### 5.1 Code Organization
- [ ] **Architecture**
  - Feature-based folders: `src/components/{admin,ticket,dashboard,...}`
  - Shared UI primitives: `src/components/ui/`
  - Server: routes → services → lib → middleware
  - Clear separation: client (`src/`) vs server (`server/`)

- [ ] **Testing Strategy**
  - Unit: `vitest` (100+ test files in `src/lib/*.test.ts`, `tests/`)
  - Integration: `vitest` + Supabase test DB
  - E2E: Playwright (accessibility, identity, portal visibility, provision)
  - Coverage: `vitest run --coverage`

#### 5.2 Documentation & DX
- [ ] **OpenAPI/Swagger** (`server/openapi.ts`, `/docs` endpoint)
  - Schema completeness for all routes
  - Authentication in spec (Bearer + cookie)
- [ ] **Type Definitions** (`src/types/app.ts`, `src/types/admin.ts`, `src/types/ui.ts`)
  - Shared types between client/server
  - Zod schemas as source of truth (`zod` dependency)

#### 5.3 Technical Debt Markers
- [ ] **TODO/FIXME/HACK** comments (grep)
- [ ] **Console statements** — removed from `VersionHistoryTimeline`, `CrudTable`
- [ ] **Magic numbers** — extracted to `src/lib/constants.ts`
- [ ] **Unused imports/variables** — ESLint clean
- [ ] **Deprecated APIs** — `React 19` compatibility

---

### 6. 📋 GIT & PROCESS HYGIENE

#### 6.1 Uncommitted Changes (150+ files modified)
- [ ] **Review all staged/unstaged changes** (`git diff --stat`)
  - 12 commits ahead of origin — verify commit messages, atomicity
  - 2 deleted pages: `DocumentManagementPage`, `EmailInboxPage`, `SurveyManagementPage`
  - New components: `AppShell`, `major-incidents/`, `portal/`, `ticket/`, `dashboard/`

#### 6.2 Untracked Files (20+)
- [ ] **Audit untracked** (`.storybook/`, `storybook-static/`, `*.ts` scripts, `*.log`, `*.out`)
  - Remove build artifacts: `dev.err`, `dev.out`, `server.err`, `server.out`, `server2.err`, `server2.out`, `temp.cjs`
  - Remove test scripts: `check_constraint.ts`, `fix_smtp_encryption.ts`, `getsmtp.ts`, `test_*.ts`
  - Move useful scripts to `scripts/` with documentation

#### 6.3 Dependencies
- [ ] **Security Audit** (`npm audit`, `pnpm audit`)
  - Check for vulnerable dependencies
  - `bcryptjs`, `jsonwebtoken`, `sharp`, `multer` — common attack surface
- [ ] **License Compliance** — all MIT/BSD/Apache-2.0 compatible
- [ ] **Lockfile Integrity** — `pnpm-lock.yaml` vs `package-lock.json` (both present)

---

## Execution Strategy

### Phase 1: Automated Static Analysis (Can run immediately)
| Tool | Command | Target |
|------|---------|--------|
| TypeScript | `tsc --noEmit` | All `.ts/.tsx` |
| ESLint | `eslint src/ server/` | Lint rules + custom |
| npm audit | `pnpm audit --prod` | Production deps |
| Secret scan | `truffleHog` or `git-secrets` | Git history |
| SAST | `sonarqube` or `codeql` | Security patterns |

### Phase 2: Dynamic Testing (Requires running services)
| Test Type | Command | Coverage |
|-----------|---------|----------|
| Unit | `pnpm test` | `src/lib/`, `server/` |
| Integration | `pnpm test:prepare && pnpm test` | DB-backed routes |
| E2E | `pnpm test:e2e` | Critical user flows |
| A11y | `pnpm test:a11y` | WCAG 2.1 AA |

### Phase 3: Manual Review (High-value targets)
1. **Auth flows**: login, password reset, session management, CSRF
2. **Payment data paths**: evidence upload, encryption, audit trail
3. **Admin settings**: branding, integrations, user management
4. **Major incident declaration**: war room, comms, compliance
5. **Partner portal**: scoped access, data isolation

### Phase 4: Load & Chaos Testing
- [ ] k6 or Artillery: API rate limits, upload concurrency
- [ ] Chaos: Supabase failover, network partition, SSE reconnection
- [ ] Memory profiling: long-running server, SSE connections

---

## Deliverables

| Artifact | Format | Owner |
|----------|--------|-------|
| Security Findings | `SECURITY_AUDIT.md` | Critical → High → Medium |
| Bug Database | GitHub Issues (labeled) | Reproducible steps |
| Display/UX Issues | Figma/Storybook annotations | Screenshots + diffs |
| Performance Report | `PERFORMANCE.md` | Bundle sizes, Core Web Vitals |
| Tech Debt Register | `TECH_DEBT.md` | Prioritized backlog |
| Secrets Rotation Checklist | `SECRETS_ROTATION.md` | All env vars |

---

## Clarifying Questions Before Execution

1. **Scope**: Full codebase (client + server + tests + infra) or specific areas?
2. **Priority**: Security-first, or balanced with correctness/display?
3. **Environment**: Audit against local dev, staging, or production-like?
4. **Compliance**: Any specific frameworks (PCI-DSS, SOC2, GDPR) to validate against?
5. **Team Capacity**: How many engineers available for remediation?
6. **Timeline**: Hard deadline for audit completion?
7. **Tooling Budget**: Can we run commercial SAST (CodeQL, SonarCloud) or OSS only?

---

## Risk Assessment Matrix

| Area | Likelihood | Impact | Priority |
|------|------------|--------|----------|
| Secrets in `.env` (local only) | Low | Critical | 🔴 Fix: rotate all |
| JWT secret validation | Medium | Critical | 🔴 Verify rotation |
| Supabase RLS alignment | Medium | High | 🟠 Test thoroughly |
| Rate limit bypass | Low | High | 🟠 Verify all endpoints |
| Bundle size (573KB chunk) | High | Medium | 🟡 Code split |
| Mobile text wrapping | High | Low | 🟢 Fixed in latest |
| Test coverage gaps | Medium | Medium | 🟡 Measure + target |
| Untracked build artifacts | High | Low | 🟢 Cleanup |

---

**Ready to execute Phase 1 (Automated Static Analysis) immediately upon approval.**