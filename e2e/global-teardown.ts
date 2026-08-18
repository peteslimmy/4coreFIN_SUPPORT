import { cleanupE2eData } from './provision';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Remove E2E tickets + identities created by this run. */
export default async function globalTeardown(): Promise<void> {
  await cleanupE2eData();
  try { fs.unlinkSync(path.join(__dirname, '.e2e-meta.json')); } catch { /* best-effort */ }
}