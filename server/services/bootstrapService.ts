import {
  listTickets,
  listComments,
  listNotifications,
  listMajorIncidents,
  listEvidence,
  listAuditLogs,
  listUsersPublic,
  listCustomers,
  listJsonTable,
  getConfig,
} from '../repository';
import { normalizeBusinessUnits } from '../../src/lib/buCodes';
import type { Permission, RoleDefinition } from '../rbac';
import { hasPermissionForRoleId, getRoles } from '../rbac';

type DomainKey = string;

interface BootstrapJob {
  key: DomainKey;
  fn: () => Promise<unknown>;
}

/**
 * Build the list of data-fetching jobs for the bootstrap endpoint based on the
 * requested scope and the user's permissions. Each job is an async function
 * that returns the domain data for its key.
 *
 * The jobs are returned un-executed so the caller can run them concurrently
 * with `Promise.all`.
 */
export function buildBootstrapJobs(opts: {
  user: { role: string; email: string; bu: string; tenantId?: string };
  scope: string[] | null;
  roles: ReturnType<typeof getRoles>;
  can: (permission: Permission) => boolean;
}): BootstrapJob[] {
  const { user, scope, can } = opts;
  const wants = (name: string) => !scope || scope.includes(name);
  const jobs: BootstrapJob[] = [];

  if (wants('tickets')) {
    jobs.push({ key: 'tickets', fn: () => listTickets(user as any, { includeDeleted: false }) });
  }
  if (wants('comments')) {
    jobs.push({ key: 'comments', fn: () => listComments(undefined, user as any, 500) });
  }
  if (wants('watcherNotifications')) {
    jobs.push({ key: 'watcherNotifications', fn: () => listNotifications(user.email, user as any) });
  }
  if (wants('majorIncidents')) {
    jobs.push({ key: 'majorIncidents', fn: () => listMajorIncidents(user as any) });
  }
  if (wants('evidence')) {
    jobs.push({ key: 'evidence', fn: () => listEvidence(undefined, user as any, 300) });
  }
  if (wants('auditLogs') && can('audit:view')) {
    jobs.push({ key: 'auditLogs', fn: () => listAuditLogs(500, user as any) });
  }
  if (wants('users') && can('users:view')) {
    jobs.push({ key: 'users', fn: () => listUsersPublic() });
  }
  if (wants('customers') && can('customers:manage')) {
    jobs.push({ key: 'customers', fn: () => listCustomers(user as any) });
  }
  if (wants('config')) {
    jobs.push({
      key: 'businessUnits',
      fn: async () => {
        const buList = normalizeBusinessUnits(await getConfig<any[]>('businessUnits', []));
        return buList.map((b) => b.name);
      },
    });
    jobs.push({
      key: 'businessUnitCodes',
      fn: async () => {
        const buList = normalizeBusinessUnits(await getConfig<any[]>('businessUnits', []));
        return buList.reduce<Record<string, string>>((acc, b) => { acc[b.name] = b.code; return acc; }, {});
      },
    });
    jobs.push({ key: 'paymentChannels', fn: () => getConfig('paymentChannels', []) });
    jobs.push({ key: 'partners', fn: () => getConfig('partners', []) });
    jobs.push({ key: 'categories', fn: () => getConfig('categories', []) });
  }
  if (wants('config') && can('admin:config:read')) {
    jobs.push({ key: 'slaRules', fn: () => listJsonTable('sla_rules') });
    jobs.push({ key: 'holidays', fn: () => listJsonTable('holidays') });
    jobs.push({ key: 'ticketTemplates', fn: () => listJsonTable('ticket_templates') });
    jobs.push({ key: 'kbArticles', fn: () => listJsonTable('kb_articles') });
    jobs.push({ key: 'savedReplies', fn: () => getConfig('savedReplies', []) });
    jobs.push({ key: 'buFormConfigs', fn: () => getConfig('buFormConfigs', []) });
    jobs.push({ key: 'notificationConfigs', fn: () => getConfig('notificationConfigs', []) });
    jobs.push({ key: 'escalationRules', fn: () => getConfig('escalationRules', []) });
  }

  return jobs;
}

/**
 * Execute bootstrap jobs concurrently and collect results into a keyed object.
 */
export async function executeBootstrapJobs(jobs: BootstrapJob[]): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {};
  const results = await Promise.all(jobs.map(async (j) => [j.key, await j.fn()] as [string, unknown]));
  for (const [key, value] of results) {
    data[key] = value;
  }
  return data;
}

/**
 * Resolve the roles data for the bootstrap response.
 */
export function resolveBootstrapRoles(opts: {
  cachedRoles: ReturnType<typeof getRoles> | null;
  roleConfig: RoleDefinition[];
  wantsRoles: boolean;
}): unknown {
  if (!opts.wantsRoles) return null;
  return opts.cachedRoles ?? getRoles(opts.roleConfig);
}
