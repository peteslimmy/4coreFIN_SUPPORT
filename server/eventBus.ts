/**
 * Cross-process event bus over Postgres LISTEN/NOTIFY.
 *
 * Why: the SSE client registry is per-process. During the Express→Next
 * transition BOTH servers run and handle mutations, and in a multi-replica
 * deployment each replica has its own registry. A broadcast fired in process
 * A must reach SSE clients connected to process B. LISTEN/NOTIFY gives every
 * Node process the event without adding Redis or polling.
 *
 * Delivery model: broadcast() fans out LOCALLY first (synchronous, zero
 * latency, keeps existing tests valid), then publishes to the channel for
 * remote processes. Each process stamps payloads with a random origin id and
 * ignores its own echoes, so no double delivery.
 *
 * NOTIFY payloads are capped at 8000 bytes; oversized payloads are delivered
 * as data-less hints (SSE refresh is best-effort UI sugar, never a data
 * source — the client refetches after any event).
 */

export interface BusPayload {
  event: string;
  data: unknown;
  tenantId: string | null;
  origin: string;
}

export const BROADCAST_CHANNEL = '4c_broadcast';
const ORIGIN = Math.random().toString(36).slice(2) + Date.now().toString(36);
const MAX_NOTIFY_BYTES = 7000;

type Handler = (payload: BusPayload) => void;
const handlers = new Set<Handler>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let listenerClient: any = null;
let listenerStarting: Promise<void> | null = null;

export function isEventBusEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

async function ensureListener(): Promise<void> {
  if (listenerClient || !isEventBusEnabled()) return;
  if (listenerStarting) return listenerStarting;

  listenerStarting = (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { Client } = await import('pg');
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      await client.query(`LISTEN ${BROADCAST_CHANNEL}`);
      client.on('notification', (msg: { payload?: string }) => {
        try {
          const payload = JSON.parse(msg.payload || '{}') as BusPayload;
          if (payload.origin === ORIGIN) return; // own echo — already delivered locally
          for (const h of handlers) {
            try {
              h(payload);
            } catch {
              /* one bad handler must not starve the rest */
            }
          }
        } catch {
          /* malformed payload — ignore */
        }
      });
      client.on('error', () => {
        // Connection died: reset so the next publish re-establishes it.
        listenerClient = null;
        listenerStarting = null;
      });
      listenerClient = client;
    } catch {
      // Bus unavailable — local-only delivery continues to work.
      listenerClient = null;
      listenerStarting = null;
    }
  })();

  return listenerStarting;
}

/** Register a handler for events originating from OTHER processes. */
export function subscribeRemote(handler: Handler): void {
  handlers.add(handler);
  void ensureListener();
}

/** Idempotent startup init (called from server bootstrap / instrumentation). */
export function initEventBus(): void {
  void ensureListener();
}

/** Publish to remote processes. Fire-and-forget; never throws. */
export function publishRemote(event: string, data: unknown, tenantId?: string | null): void {
  if (!isEventBusEnabled()) return;
  void (async () => {
    try {
      await ensureListener();
      if (!listenerClient) return;
      let payload = JSON.stringify({ event, data, tenantId: tenantId ?? null, origin: ORIGIN } satisfies BusPayload);
      if (payload.length > MAX_NOTIFY_BYTES) {
        // Too large for NOTIFY — deliver a data-less hint so remote clients
        // still learn *that* something happened.
        payload = JSON.stringify({ event, data: null, tenantId: tenantId ?? null, origin: ORIGIN } satisfies BusPayload);
      }
      await listenerClient.query('SELECT pg_notify($1, $2)', [BROADCAST_CHANNEL, payload]);
    } catch {
      /* best-effort */
    }
  })();
}
