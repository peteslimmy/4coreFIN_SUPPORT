import https from 'https';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { resolve, basename } from 'path';

dotenv.config();

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || '';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';

if (!PROJECT_REF || !ACCESS_TOKEN) {
  console.error('SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN must be set');
  process.exit(1);
}

function runSql(query: string): Promise<any> {
  return new Promise((resolvePromise, reject) => {
    const data = JSON.stringify({ query });
    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolvePromise({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolvePromise({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function parseSqlStatements(sql: string): string[] {
  const lines = sql.split('\n');
  let current = '';
  const stmts: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comment-only lines and empty lines
    if (trimmed.startsWith('--') || trimmed === '') continue;

    current += line + '\n';

    // Statement ends when line ends with ;
    if (trimmed.endsWith(';')) {
      stmts.push(current.trim());
      current = '';
    }
  }

  if (current.trim()) stmts.push(current.trim());
  return stmts;
}

async function getAppliedMigrations(): Promise<string[]> {
  const { status, data } = await runSql(`SELECT name FROM _applied_migrations ORDER BY name`);
  if ((status === 200 || status === 201) && Array.isArray(data)) return data.map((r) => r.name);
  // Table does not exist yet — create it and start fresh.
  if (status === 404 || (data && /does not exist|relation.*not exist/i.test(JSON.stringify(data)))) {
    await runSql(`CREATE TABLE IF NOT EXISTS _applied_migrations (name TEXT PRIMARY KEY);`);
    return [];
  }
  throw new Error(`Failed to read _applied_migrations: ${status} ${JSON.stringify(data)}`);
}

async function setup() {
  const dir = resolve(process.cwd(), 'supabase/migrations');
  const { readdirSync } = await import('fs');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  const applied = await getAppliedMigrations();
  const pending = files.filter((f) => !applied.includes(f));

  if (pending.length === 0) {
    console.log('All migrations already applied. Nothing to do.');
    return;
  }
  console.log(`Applied: ${applied.length}. Pending: ${pending.length}: ${pending.join(', ')}\n`);

  for (const file of pending) {
    const sql = readFileSync(resolve(dir, file), 'utf8');
    const statements = parseSqlStatements(sql);
    console.log(`Applying ${file} (${statements.length} statements)...`);

    let success = 0;
    let failed = 0;
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const firstLine = stmt.split('\n')[0].substring(0, 80);
      try {
        const result = await runSql(stmt);
        if (result.status === 200 || result.status === 201 || result.status === 204) {
          console.log(`  [${i + 1}/${statements.length}] OK: ${firstLine}`);
          success++;
        } else {
          const err = result.data?.message || result.data?.error || JSON.stringify(result.data).substring(0, 120);
          console.log(`  [${i + 1}/${statements.length}] ${result.status}: ${firstLine}\n     → ${err}`);
          failed++;
        }
      } catch (e: any) {
        console.log(`  [${i + 1}/${statements.length}] ERROR: ${firstLine}\n     → ${e.message}`);
        failed++;
      }
    }

    if (failed === 0) {
      await runSql(`INSERT INTO _applied_migrations (name) VALUES ('${file.replace(/'/g, "''")}');`);
      console.log(`✔ ${file}: ${success} succeeded, ${failed} failed\n`);
    } else {
      console.log(`✖ ${file}: ${success} succeeded, ${failed} failed — not marked as applied; fix and re-run.\n`);
    }
  }

  console.log('Done.');
}

setup().catch(console.error);
