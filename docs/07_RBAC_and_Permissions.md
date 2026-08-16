# Role-Based Access Control (RBAC)

## Roles
| Role | Scope | Description |
|---|---|---|
| SUPER_ADMIN | global (`*`) | Full platform access |
| EXECUTIVE | global (read) | Dashboards, audit verify, reports |
| BU_SUPPORT_L1 | tenant | Frontline handling only |
| BU_SUPPORT_L2 | tenant | + escalate, merge, unmask, declare major incidents |
| BU_SUPPORT_L3 | tenant | + delete tickets, admin config, audit write |
| BU_SUPPORT (legacy) | tenant | Full pre-tier set (migration safety) |
| PARTNER | partner org | Own-org tickets, comments, RCA submission, MI declare |
| CUSTOMER | own BU | File/track own tickets, comments view, feedback |

Tiers are strictly additive (L1 ⊂ L2 ⊂ L3). Custom roles may be defined in the admin UI and stored in `app_config.roles`; system-role overrides replace the defaults.

## Permission matrix (29 permissions)
Groups: Tickets (view/create/edit/resolve/delete/escalate/merge/unmask/assign), Comments & Notifications (view/create/internal + notifications:view), Operations (major-incidents manage/declare, customers:manage, partner:rca), Oversight (audit view/write/verify, reports:view, executive:dashboard), Administration (config/users/forms/access/branding/landing_page/sla, users:view).

| Permission | L1 | L2 | L3 | legacy | PARTNER | EXEC | CUST |
|---|---|---|---|---|---|---|---|
| tickets:view/create/edit/resolve/assign | ✔ | ✔ | ✔ | ✔ | edit only | view | create/view |
| tickets:escalate / merge / unmask | — | ✔ | ✔ | ✔ | — | unmask | — |
| tickets:delete | — | — | ✔ | ✔ | — | — | — |
| major-incidents:manage | ✔ | ✔ | ✔ | ✔ | ✔ | — | — |
| major-incidents:declare | — | ✔ | ✔ | ✔ | ✔ | — | — |
| admin:config | — | — | ✔ | ✔ | — | — | — |
| audit:view | ✔ | ✔ | ✔ | ✔ | — | ✔ | — |
| audit:write | — | — | ✔ | ✔ | — | — | — |
| audit:verify | — | — | — | — | — | ✔ | — |
| partner:rca | — | — | — | — | ✔ | — | — |
| executive:dashboard | — | — | — | — | — | ✔ | — |

## Enforcement layers
1. Route middleware `requirePermission` (server-checked on every request).
2. Object-level `canAccessTicket` (pure module `src/lib/canAccessTicket.ts`) — double-checks tenant/org scope.
3. Query-level scoping in the repository (tenant_id / partner_org_id filters).
4. RLS policies as a backstop for non-service connections.
5. DB CHECK/trigger invariants for enum + transition legality.

## Partner isolation
Partner accounts carry `partner_org_id` (migration 044). Org-scoped partners match tickets strictly by FK equality — org-less tickets are invisible and name-string fallback applies only to pre-migration accounts. Verified by `src/lib/canAccessTicket.test.ts`.
