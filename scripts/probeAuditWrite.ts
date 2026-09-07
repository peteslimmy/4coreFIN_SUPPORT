import 'dotenv/config';
import { appendAuditLog } from '../server/repositories/auditLogRepository';

// TEMP probe: verifies the audit write path (incl. advisory-lock RPC fallback)
// works end-to-end. Run with: npx tsx scripts/probeAuditWrite.ts
appendAuditLog({
  ticketId: null,
  actor: 'audit-probe',
  role: 'GLOBAL_ADMIN',
  action: 'PROBE',
  details: 'audit write probe after advisory-lock fix',
})
  .then(entry => {
    console.log('AUDIT WRITE OK:', entry.id, 'hash:', entry.hash?.slice(0, 16));
    process.exit(0);
  })
  .catch(err => {
    console.error('AUDIT WRITE FAILED:', err?.message || err);
    process.exit(1);
  });