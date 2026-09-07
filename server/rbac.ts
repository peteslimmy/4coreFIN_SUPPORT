/**
 * Canonical RBAC lives in `shared/rbac.ts`. This shim keeps every existing
 * `server/*` import working while guaranteeing client and server evaluate
 * permissions from one definition.
 */
export * from '../shared/rbac';
