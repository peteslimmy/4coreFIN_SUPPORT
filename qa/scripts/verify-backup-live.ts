import fs from 'node:fs';
import path from 'node:path';
import { verifyBackupIntegrity } from '../../scripts/verifyBackup';

const r = await verifyBackupIntegrity().catch((e) => ({ overallSuccess: false, error: String(e), results: [] }));
const payload = { timestamp: new Date().toISOString(), ...r };
await fs.promises.mkdir(path.join(process.cwd(), 'qa', 'evidence'), { recursive: true });
await fs.promises.writeFile(
  path.join(process.cwd(), 'qa', 'evidence', 'backup-integrity-result.json'),
  JSON.stringify(payload, null, 2)
);
process.exit(r.overallSuccess === true ? 0 : 2);