import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * RLS posture contract (SEC-01 / DB-02 / DB-05).
 *
 * Phase 4 is migrating data access from a single service-role client to
 * per-request user-JWT clients; RLS then becomes the real authorization
 * boundary. For that transition to be safe, the migration files must keep the
 * policy set deny-by-default for non-service roles. These tests read the SQL
 * migration files and assert the invariants we rely on:
 *
 *  1. No `CREATE POLICY ... FOR ALL USING (true)` without an explicit
 *     `TO <role>` clause (an omitted role defaults to PUBLIC → anonymous
 *     internet users with the anon key).
 *  2. The public-schema operational tables wired in migration 080 are RLS-
 *     enabled with a service_role-only policy.
 *  3. `landing_page_image_versions` exposes no policy to anon; the only
 *     authenticated SELECT is narrowed to published parent images.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function readMigrations(): Array<{ file: string; sql: string }> {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(MIGRATIONS_DIR, file), 'utf8') }));
}

describe('RLS posture contract', () => {
  it('every public FOR ALL USING(true) policy is either service_role or dropped later', () => {
    const migrations = readMigrations();

    const offenders = migrations
      .flatMap(({ file, sql }) =>
        [...sql.matchAll(/CREATE POLICY\s+("?)([^"\s;]+)\1\s+ON\s+([\w.]+)[\s\S]*?;/g)].map((m) => ({
          file,
          name: m[2],
          table: m[3],
          block: m[0],
        }))
      )
      .filter(({ block }) => {
        if (!/FOR ALL/.test(block) || !/USING\s*\(\s*true\s*\)/.test(block)) return false;
        const to = block.match(/\bTO\s+([a-z_,\s]+)/i)?.[1] ?? '';
        return !/\bservice_role\b/.test(to);
      });

    for (const offender of offenders) {
      const idx = migrations.findIndex((m) => m.file === offender.file);
      const later = migrations.slice(idx + 1).filter((m) => {
        const numeric = /^(\d+)_/.exec(m.file)?.[1];
        return !numeric || Number(numeric) > 50; // only policies surviving the modern posture matter
      });
      const droppedBy = later.find((m) =>
        new RegExp(`DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+"?${escapeRegExp(offender.name)}"?\\s+ON\\s+${escapeRegExp(offender.table)}`, 'i').test(m.sql)
      );
      expect(droppedBy, `policy ${offender.name} on ${offender.table} (${offender.file}) has no superseding DROP`).toBeTruthy();
    }
  });

  it('080 enables RLS on the six operational tables with service-role policies', () => {
    const mig = readMigrations().find((m) => m.file.startsWith('080_'));
    expect(mig, 'migration 080 must exist').toBeTruthy();

    for (const table of ['business_hours', 'erasure_requests', 'pii_encryption_keys', 'sla_notification_log', 'escalation_notification_log', 'ticket_id_counters']) {
      expect(mig!.sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      expect(mig!.sql).toMatch(new RegExp(`CREATE POLICY "service_role manages ${table}" ON ${table}\\s+FOR ALL TO service_role USING \\(true\\) WITH CHECK \\(true\\);`));
    }
  });

  it('landing_page_image_versions is anon-denied and authenticated-narrowed to published', () => {
    const mig = readMigrations().find((m) => m.file.startsWith('080_'));
    expect(mig).toBeTruthy();

    expect(mig!.sql).toContain('"Anonymous users can view versions" ON public.landing_page_image_versions');
    // No remaining anon policy on the versions table.
    expect(mig!.sql).not.toMatch(/CREATE POLICY[^;]*ON public\.landing_page_image_versions[^;]*FOR SELECT TO anon/i);
    // The authenticated policy is tied to the parent image being published.
    const authBlock = mig!.sql.match(/CREATE POLICY "Authenticated can view versions of published images"[^;]*;/s)?.[0] ?? '';
    expect(authBlock).toContain('FOR SELECT TO authenticated');
    expect(authBlock).toContain("img.status = 'published'");
  });

  it('no migration >= 049 defines a policy using the fail-open coalesce tenant grant', () => {
    const offending = readMigrations()
      .filter(({ file }) => {
        const numeric = /^(\d+)_/.exec(file)?.[1];
        return numeric && Number(numeric) >= 50 && !file.startsWith('076_');
      })
      .flatMap(({ file, sql }) =>
        [...sql.matchAll(/CREATE POLICY[\s\S]*?;/g)]
          .filter((m) => /coalesce\(current_setting\('app\.tenant_id', true\), tenant_id\)/.test(m[0]))
          .map((m) => ({ file, block: m[0].slice(0, 80) }))
      );

    expect(offending).toEqual([]);
  });
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}