process.env.NODE_ENV = 'development';
process.env.PORT = String(Number(process.env.E2E_PORT) || 3998);
process.env.DISABLE_HMR = 'true';

// ESM hoists static imports ahead of the assignments above, so the env vars
// would not be set before server.ts reads them. Use a dynamic import so the
// PORT/DISABLE_HMR overrides take effect (and don't collide with the dev server).
await import('../server');
