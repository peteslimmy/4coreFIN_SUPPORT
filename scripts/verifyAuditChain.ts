import { supabase } from '../server/supabase';
import { logger } from '../server/logger';
import { computeAuditHash, type AuditEntry } from '../server/compliance';

const CHUNK_SIZE = 5000;
const MAX_CHUNKS = 100; // Safety limit

/**
 * Verify the full audit chain in chunks to handle large datasets
 */
export async function verifyFullAuditChain(): Promise<{
  valid: boolean;
  brokenIndex: number | null;
  totalChecked: number;
  chunksProcessed: number;
  durationMs: number;
}> {
  const startTime = Date.now();
  let totalChecked = 0;
  let chunksProcessed = 0;
  let previousHash = '';

  logger.info('Starting full audit chain verification');

  for (let chunk = 0; chunk < MAX_CHUNKS; chunk++) {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('id, timestamp, ticket_id, actor, role, action, details, hash, previous_hash')
      .order('timestamp', { ascending: true })
      .order('id', { ascending: true })
      .range(chunk * CHUNK_SIZE, (chunk + 1) * CHUNK_SIZE - 1);

    if (error) {
      logger.error({ error }, 'Failed to fetch audit log chunk');
      return {
        valid: false,
        brokenIndex: null,
        totalChecked,
        chunksProcessed,
        durationMs: Date.now() - startTime,
      };
    }

    if (!data || data.length === 0) {
      // No more data
      break;
    }

    chunksProcessed++;
    const chunkEntries: AuditEntry[] = data.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      ticketId: r.ticket_id,
      actor: r.actor,
      role: r.role,
      action: r.action,
      details: r.details,
      hash: r.hash,
      previousHash: r.previous_hash,
    }));

    // Verify chunk
    for (let i = 0; i < chunkEntries.length; i++) {
      const entry = chunkEntries[i];
      const globalIndex = totalChecked + i;

      // Verify previous hash linkage
      const expectedPrevious = globalIndex > 0 ? previousHash : '';
      if ((entry.previousHash || '') !== expectedPrevious) {
        logger.error({ 
          index: globalIndex, 
          expected: expectedPrevious, 
          actual: entry.previousHash 
        }, 'Audit chain broken: previous hash mismatch');
        return {
          valid: false,
          brokenIndex: globalIndex,
          totalChecked: globalIndex,
          chunksProcessed,
          durationMs: Date.now() - startTime,
        };
      }

      // Verify current hash
      const expectedHash = computeAuditHash({
        id: entry.id,
        timestamp: entry.timestamp,
        ticketId: entry.ticketId,
        actor: entry.actor,
        role: entry.role,
        action: entry.action,
        details: entry.details,
        previousHash: entry.previousHash || '',
      });

      if (entry.hash !== expectedHash) {
        logger.error({ 
          index: globalIndex, 
          expected: expectedHash, 
          actual: entry.hash 
        }, 'Audit chain broken: hash mismatch');
        return {
          valid: false,
          brokenIndex: globalIndex,
          totalChecked: globalIndex,
          chunksProcessed,
          durationMs: Date.now() - startTime,
        };
      }

      previousHash = entry.hash;
    }

    totalChecked += chunkEntries.length;

    // Log progress
    if (chunksProcessed % 10 === 0) {
      logger.info({ chunksProcessed, totalChecked }, 'Audit chain verification progress');
    }
  }

  const durationMs = Date.now() - startTime;
  logger.info({ 
    valid: true, 
    totalChecked, 
    chunksProcessed, 
    durationMs 
  }, 'Full audit chain verification completed');

  return {
    valid: true,
    brokenIndex: null,
    totalChecked,
    chunksProcessed,
    durationMs,
  };
}

/**
 * Verify audit chain and store result
 */
export async function runAuditVerificationJob(): Promise<void> {
  try {
    const result = await verifyFullAuditChain();
    
    // Store verification result
    await Promise.resolve(
      supabase.from('audit_verification_log').insert({
        verified_at: new Date().toISOString(),
        valid: result.valid,
        broken_index: result.brokenIndex,
        total_checked: result.totalChecked,
        chunks_processed: result.chunksProcessed,
        duration_ms: result.durationMs,
      })
    ).catch(() => {
      // Table might not exist, that's OK
    });

    if (!result.valid) {
      // Alert on failure - in production, this would trigger PagerDuty/Slack
      logger.error({ 
        brokenIndex: result.brokenIndex,
        totalChecked: result.totalChecked 
      }, 'CRITICAL: Audit chain verification FAILED');
    }
  } catch (error) {
    logger.error({ error }, 'Audit verification job failed');
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAuditVerificationJob()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}