import Dexie from 'dexie';

export class AppDB extends Dexie {
  tickets!: Dexie.Table<any, string>;
  comments!: Dexie.Table<any, string>;
  auditLogs!: Dexie.Table<any, string>;
  majorIncidents!: Dexie.Table<any, string>;
  watcherNotifications!: Dexie.Table<any, string>;
  users!: Dexie.Table<any, string>;
  slaRules!: Dexie.Table<any, string>;
  holidays!: Dexie.Table<any, string>;
  ticketTemplates!: Dexie.Table<any, string>;
  kbArticles!: Dexie.Table<any, string>;
  customers!: Dexie.Table<any, string>;
  evidence!: Dexie.Table<any, string>;
  buFormConfigs!: Dexie.Table<any, string>;
  roles!: Dexie.Table<any, string>;
  savedReplies!: Dexie.Table<any, string>;
  businessUnits!: Dexie.Table<any, string>;
  providers!: Dexie.Table<any, string>;
  paymentChannels!: Dexie.Table<any, string>;
  categories!: Dexie.Table<any, string>;
  notificationConfigs!: Dexie.Table<any, string>;
  escalationRules!: Dexie.Table<any, string>;
  settings!: Dexie.Table<any, string>;
  queryCache!: Dexie.Table<{ key: string; value: string; updatedAt: number }, string>;
  offlineMutations!: Dexie.Table<{
    id: string;
    type: string;
    payload: any;
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
  }
}

export const db = new AppDB();

/**
 * Save query cache to IndexedDB
 */
export async function persistQueryCache(queryClient: any): Promise<void> {
  try {
    const cache = queryClient.getQueryCache();
    const queries = cache.getAll();
    const serialized: Record<string, any> = {};

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
export async function hydrateQueryCache(queryClient: any): Promise<void> {
  try {
    const cached = await db.queryCache.get('tanstack-query-cache');
    if (cached?.value) {
      const serialized = JSON.parse(cached.value);
      const cache = queryClient.getQueryCache();

      for (const [key, value] of Object.entries(serialized)) {
        const queryKey = key.split(':');
        cache.build(queryClient, {
          queryKey,
          state: {
            data: (value as any).data,
            dataUpdatedAt: (value as any).dataUpdatedAt,
            fetchStatus: (value as any).fetchStatus || 'idle',
          },
        });
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
  payload: any
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
  processFn: (type: string, payload: any) => Promise<any>
): Promise<void> {
  const mutations = await db.offlineMutations.orderBy('timestamp').toArray();

  for (const mutation of mutations) {
    try {
      await processFn(mutation.type, mutation.payload);
      await db.offlineMutations.delete(mutation.id);
    } catch (error) {
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

/**
 * Setup online/offline listeners
 */
export function setupOnlineListeners(
  queryClient: any,
  processFn: (type: string, payload: any) => Promise<any>
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