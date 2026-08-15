import fs from 'node:fs';
import path from 'node:path';
import { verifyFullAuditChain } from '../../scripts/verifyAuditChain';

const r = await verifyFullAuditChain().catch((e) => ({ valid: false, error: String(e) }));
await fs.promises.mkdir(path.join(process.cwd(), 'qa', 'evidence'), { recursive: true });
await fs.promises.writeFile(
  path.join(process.cwd(), 'qa', 'evidence', 'audit-chain-result.json'),
  JSON.stringify({ timestamp: new Date().toISOString(), result: r }, null, 2)
);
process.exit(r.valid === true ? 0 : 2);