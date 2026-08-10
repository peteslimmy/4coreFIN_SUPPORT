export type Permission =
  | 'tickets:view'
  | 'tickets:create'
  | 'tickets:edit'
  | 'tickets:resolve'
  | 'tickets:delete'
  | 'tickets:escalate'
  | 'tickets:merge'
  | 'tickets:unmask'
  | 'tickets:assign'
  | 'comments:view'
  | 'comments:create'
  | 'comments:internal'
  | 'major-incidents:manage'
  | 'customers:manage'
  | 'notifications:view'
  | 'audit:view'
  | 'audit:verify'
  | 'reports:view'
  | 'executive:dashboard'
  | 'partner:rca'
  | 'admin:config'
  | 'admin:users'
  | 'admin:forms'
  | 'admin:access'
  | 'admin:branding'
  | 'admin:landing_page'
  | 'admin:sla';

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  buScoped: boolean;
  permissions: Permission[] | '*';
}
