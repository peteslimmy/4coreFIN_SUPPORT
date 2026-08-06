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
  sseClients.add({ res, userId, role, bu, tenantId, global });
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