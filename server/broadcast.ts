import type { Response } from 'express';

interface SseClient {
  res: Response;
  userId: string;
  role: string;
  bu: string;
  // Resolved tenant the client may observe, or null for global visibility.
  tenantId: string | null;
  // Whether the client may read across all tenants.
  global: boolean;
}

const sseClients = new Set<SseClient>();

// Bound live streams per user: every open tab holds an SSE connection, and
// unbounded growth lets a single account exhaust sockets/memory. When the
// cap is hit, the user's oldest connections are closed so fresh tabs win.
const MAX_SSE_PER_USER = 5;

/** Export for graceful shutdown */
export function getSseClients(): ReadonlySet<SseClient> {
  return sseClients;
}

/** Close all SSE connections gracefully */
export function closeAllSseConnections(): void {
  for (const client of sseClients) {
    try {
      client.res.write('event: shutdown\ndata: {"reason":"server_shutdown"}\n\n');
      client.res.end();
    } catch {
      // Ignore errors on forced close
    }
  }
  sseClients.clear();
}

export function addSseClient(
  res: Response,
  userId: string,
  role: string,
  bu: string,
  tenantId: string | null,
  global: boolean
) {
  // Enforce the per-user connection cap before registering the new client.
  const existing: SseClient[] = [];
  for (const c of sseClients) {
    if (c.userId === userId) existing.push(c);
  }
  const excess = existing.length - (MAX_SSE_PER_USER - 1);
  if (excess > 0) {
    for (const stale of existing.slice(0, excess)) {
      try {
        stale.res.write('event: reconnect\ndata: {"reason":"connection_limit"}\n\n');
        stale.res.end();
      } catch {
        // socket already gone
      }
      sseClients.delete(stale);
    }
  }

  const client: SseClient = { res, userId, role, bu, tenantId, global };
  sseClients.add(client);
  // Eagerly drop the client when the socket closes so dead connections do not
  // linger until the next broadcast prunes them (matters when broadcasts are
  // sparse but connections churn).
  res.on('close', () => {
    sseClients.delete(client);
  });
}

export function removeSseClient(res: Response) {
  for (const client of sseClients) {
    if (client.res === res) {
      sseClients.delete(client);
      break;
    }
  }
}

/**
 * Fan an event out to subscribers scoped by the source tenant. Source events
 * that carry no tenant id are only delivered to global-visibility clients so a
 * scoped user never receives another tenant's data.
 */
export function broadcast(event: string, data: any, tenantId?: string | null) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  // Fall back to the tenant id bundled on the payload when not passed explicitly.
  const sourceTenant = tenantId ?? data?.tenantId ?? data?.tenant_id ?? null;

  const dead: SseClient[] = [];
  for (const client of sseClients) {
    if (client.global) {
      if (!safeWrite(client, msg)) dead.push(client);
      continue;
    }
    // Source is unscoped (or scope unknown) → only global readers are safe.
    if (!sourceTenant) continue;
    if (client.tenantId && client.tenantId !== sourceTenant) continue;
    if (!safeWrite(client, msg)) dead.push(client);
  }
  // Prune clients whose socket died so they don't accumulate.
  for (const client of dead) sseClients.delete(client);
}

function safeWrite(client: SseClient, msg: string): boolean {
  try {
    client.res.write(msg);
    return !client.res.writableEnded;
  } catch {
    return false;
  }
}