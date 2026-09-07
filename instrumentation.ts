/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * Used to connect the cross-process SSE event bus (LISTEN/NOTIFY).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initEventBus } = await import('./server/eventBus');
    initEventBus();
  }
}
