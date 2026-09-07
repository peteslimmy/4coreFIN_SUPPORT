// Canonical permission/role types live in `shared/rbac.ts` — re-exported here
// so existing `../types/rbac` imports keep compiling against the unified model.
export type { Permission, RoleDefinition } from '../../shared/rbac';
