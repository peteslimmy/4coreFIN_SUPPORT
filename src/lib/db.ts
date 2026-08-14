import Dexie from 'dexie';
import type { QueryClient, QueryState } from '@tanstack/react-query';

export class AppDB extends Dexie {
  tickets!: Dexie.Table<unknown, string>;
  comments!: Dexie.Table<unknown, string>;
  auditLogs!: Dexie.Table<unknown, string>;
  majorIncidents!: Dexie.Table<unknown, string>;
  watcherNotifications!: Dexie.Table<unknown, string>;
  users!: Dexie.Table<unknown, string>;
  slaRules!: Dexie.Table<unknown, string>;
  holidays!: Dexie.Table<unknown, string>;
  ticketTemplates!: Dexie.Table<unknown, string>;
  kbArticles!: Dexie.Table<unknown, string>;
  customers!: Dexie.Table<unknown, string>;
  evidence!: Dexie.Table<unknown, string>;
  buFormConfigs!: Dexie.Table<unknown, string>;
  ticketFormConfigs!: Dexie.Table<unknown, string>;
  roles!: Dexie.Table<unknown, string>;
  savedReplies!: Dexie.Table<unknown, string>;
  businessUnits!: Dexie.Table<unknown, string>;
  partners!: Dexie.Table<unknown, string>;
  paymentChannels!: Dexie.Table<unknown, string>;
  categories!: Dexie.Table<unknown, string>;
  notificationConfigs!: Dexie.Table<unknown, string>;
  escalationRules!: Dexie.Table<unknown, string>;
  settings!: Dexie.Table<unknown, string>;
  queryCache!: Dexie.Table<{ key: string; value: string; updatedAt: number }, string>;
  offlineMutations!: Dexie.Table<{
    id: string;
    type: string;
    payload: unknown;
    timestamp: number;
    retries: number;
  }, string>;

  constructor() {
    super('4CoreFinSupportDB');
    this.version(1).stores({
      tickets: 'id, businessUnit, status, priority, createdAt, tenantId',
      comments: 'id, ticketId, timestamp',
      auditLogs: 'id, timestamp, ticketId',
      majorIncidents: 'id, createdAt, status',
      watcherNotifications: 'id, recipient, timestamp',
      users: 'id, email, role, bu',
      slaRules: 'id, category, priority',
      holidays: 'id, date',
      ticketTemplates: 'id, category',
      kbArticles: 'id, category, provider',
      customers: 'id, email, businessUnit',
      evidence: 'id, ticketId, uploadedAt',
      buFormConfigs: 'id, bu',
      ticketFormConfigs: 'id',
      roles: 'id',
      savedReplies: 'id',
      businessUnits: 'id',
      providers: 'id',
      categories: 'id',
      notificationConfigs: 'id',
      escalationRules: 'id',
      settings: 'key',
      queryCache: 'key',
      offlineMutations: 'id',
    });
    this.version(2).stores({
      paymentChannels: 'id',
    });
    this.version(3).stores({
      tickets: 'id, businessUnit, status, priority, createdAt, tenantId',
      comments: 'id, ticketId, timestamp',
      auditLogs: 'id, timestamp, ticketId',
      majorIncidents: 'id, createdAt, status',
      watcherNotifications: 'id, recipient, timestamp',
      users: 'id, email, role, bu',
      slaRules: 'id, category, priority',
      holidays: 'id, date',
      ticketTemplates: 'id, category',
      kbArticles: 'id, category, partner',
      customers: 'id, email, businessUnit',
      evidence: 'id, ticketId, uploadedAt',
      buFormConfigs: 'id, bu',
      ticketFormConfigs: 'id',
      roles: 'id',
      savedReplies: 'id',
      businessUnits: 'id',
      partners: 'id',
      categories: 'id',
      notificationConfigs: 'id',
      escalationRules: 'id',
      settings: 'key',
      queryCache: 'key',
      offlineMutations: 'id',
    }).upgrade(async (tx) => {
      await tx.table('providers').toCollection().each(async (row: unknown) => {
        await tx.table('partners').put(row);
      });
      await tx.table('providers').clear();
    });
  }
}

export const db = new AppDB();

/**
 * Save query cache to IndexedDB
 */
export async function persistQueryCache(queryClient: QueryClient): Promise<void> {
  try {
    const cache = queryClient.getQueryCache();
    const queries = cache.getAll();
    const serialized: Record<string, unknown> = {};

    for (const query of queries) {
      if (query.state.data !== undefined) {
        serialized[query.queryKey.join(':')] = {
          data: query.state.data,
          dataUpdatedAt: query.state.dataUpdatedAt,
          fetchStatus: query.state.fetchStatus,
        };
      }
    }

    if (Object.keys(serialized).length > 0) {
      await db.queryCache.put({
        key: 'tanstack-query-cache',
        value: JSON.stringify(serialized),
        updatedAt: Date.now(),
      });
    }
  } catch (error) {
    console.warn('Failed to persist query cache:', error);
  }
}

/**
 * Restore query cache from IndexedDB
 */
export async function hydrateQueryCache(queryClient: QueryClient): Promise<void> {
  try {
    const cached = await db.queryCache.get('tanstack-query-cache');
    if (cached?.value) {
      const serialized = JSON.parse(cached.value);
      const cache = queryClient.getQueryCache();

      for (const [key, value] of Object.entries(serialized)) {
        const queryKey = key.split(':');
        cache.build(queryClient, {
          queryKey,
        }, {
          data: (value as { data?: unknown }).data,
          dataUpdatedAt: (value as { dataUpdatedAt?: number }).dataUpdatedAt,
          fetchStatus: ((value as { fetchStatus?: string }).fetchStatus || 'idle') as 'fetching' | 'paused' | 'idle',
        } as QueryState<unknown>);
      }
    }
  } catch (error) {
    console.warn('Failed to hydrate query cache:', error);
  }
}

/**
 * Queue offline mutation for later sync
 */
export async function queueOfflineMutation(
  type: string,
  payload: unknown
): Promise<void> {
  await db.offlineMutations.add({
    id: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type,
    payload,
    timestamp: Date.now(),
    retries: 0,
  });
}

/**
 * Process queued offline mutations
 */
export async function processOfflineMutations(
  processFn: (type: string, payload: unknown) => Promise<unknown>
): Promise<void> {
  const mutations = await db.offlineMutations.orderBy('timestamp').toArray();

  for (const mutation of mutations) {
    try {
      await processFn(mutation.type, mutation.payload);
      await db.offlineMutations.delete(mutation.id);
    } catch {
      // Increment retry count
      if (mutation.retries >= 3) {
        // Max retries reached, remove
        await db.offlineMutations.delete(mutation.id);
        console.error('Offline mutation failed after 3 retries:', mutation);
      } else {
        await db.offlineMutations.update(mutation.id, { retries: mutation.retries + 1 });
      }
    }
  }
}

/**
 * Check if online
 */
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

export function setupOnlineListeners(
  queryClient: QueryClient,
  processFn: (type: string, payload: unknown) => Promise<unknown>
): () => void {
  const handleOnline = () => {
    console.log('Back online, syncing offline mutations...');
    processOfflineMutations(processFn);
    queryClient.invalidateQueries(); // Refetch all queries
  };

  const handleOffline = () => {
    console.log('Gone offline');
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

/**
 * Clear all app data (for logout)
 */
export async function clearAppData(): Promise<void> {
    await Promise.all(
        (db.tables || []).map((t) => t.clear())
    );
}