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

    const attempt = (remaining: number, delayMs: number) => {
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
      req.on('error', (err: any) => {
        const transient = /ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNREFUSED|socket hang up|EAI_AGAIN/i.test(String(err.code || err.message));
        if (transient && remaining > 0) {
          console.log(`  (retrying runSql in ${delayMs}ms — ${err.code || err.message})`);
          setTimeout(() => attempt(remaining - 1, Math.min(delayMs * 2, 10000)), delayMs);
        } else {
          reject(err);
        }
      });
      req.write(data);
      req.end();
    };

    attempt(4, 1000);
  });
}

function parseSqlStatements(sql: string): string[] {
  const stmts: string[] = [];
  let current = '';
  let i = 0;
  let dollarTag: string | null = null;
  let inString: string | null = null; // '\'' | '"' | null
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    // Line comment (skipped only when outside quotes/dollar-quotes)
    if (inString === null && dollarTag === null && ch === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    // Block comment
    if (inString === null && dollarTag === null && ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // Dollar-quoted string open/close (e.g. $$ ... $$, $tag$ ... $tag$)
    if (inString === null && ch === '$') {
      const tag = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i))?.[0];
      if (tag) {
        if (dollarTag === null) {
          dollarTag = tag;
        } else if (dollarTag === tag) {
          dollarTag = null;
        }
        current += tag;
        i += tag.length;
        continue;
      }
    }
    // Single/double quoted strings
    if (dollarTag === null) {
      if (inString === null && (ch === "'" || ch === '"')) {
        inString = ch;
      } else if (inString === ch) {
        if (inString === "'" && next === "'") {
          current += ch + next;
          i += 2;
          continue;
        }
        inString = null;
      }
    }
    // Statement terminator
    if (dollarTag === null && inString === null && ch === ';') {
      const trimmed = current.trim();
      if (trimmed) stmts.push(trimmed);
      current = '';
      i++;
      continue;
    }
    current += ch;
    i++;
  }

  const trimmed = current.trim();
  if (trimmed) stmts.push(trimmed);
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

  // Warn on duplicate numeric prefixes (e.g. two 022_*.sql): the runner tracks
  // applied migrations by full filename so nothing is skipped, but duplicate
  // numbers make ordering and fix-migration references error-prone (DB-01).
  const seenPrefixes = new Map<string, string>();
  for (const file of files) {
    const prefix = /^(\d+)_/.exec(file)?.[1];
    if (prefix) {
      const prev = seenPrefixes.get(prefix);
      if (prev) console.warn(`⚠ Duplicate migration number ${prefix}: '${prev}' and '${file}'`);
      else seenPrefixes.set(prefix, file);
    }
  }

  const applied = await getAppliedMigrations();
  const pending = files.filter((f) => !applied.includes(f));

  if (pending.length === 0) {
    console.log('All migrations already applied. Nothing to do.');
    return;
  }
  console.log(`Applied: ${applied.length}. Pending: ${pending.length}: ${pending.join(', ')}\n`);

  for (const file of pending) {
    const sql = readFileSync(resolve(dir, file), 'utf8');
    const statementCount = parseSqlStatements(sql).length;
    console.log(`Applying ${file} (${statementCount} statements, single transaction)...`);

    // Apply the whole file inside one transaction so a mid-file failure can
    // never leave a partially-applied migration behind (DB-01). The statement-
    // by-statement loop previously committed each statement independently.
    try {
      const wrapped = `BEGIN;\n${sql}\nCOMMIT;`;
      const result = await runSql(wrapped);
      if (result.status === 200 || result.status === 201 || result.status === 204) {
        await runSql(`INSERT INTO _applied_migrations (name) VALUES ('${file.replace(/'/g, "''")}');`);
        console.log(`✔ ${file}: applied and recorded.\n`);
      } else {
        const err = result.data?.message || result.data?.error || JSON.stringify(result.data).substring(0, 400);
        console.log(`✖ ${file}: transaction rolled back — not marked as applied; fix and re-run.\n     → ${err}\n`);
      }
    } catch (e: any) {
      console.log(`✖ ${file}: transaction rolled back — not marked as applied; fix and re-run.\n     → ${e.message}\n`);
    }
  }

  console.log('Done.');
}

setup().catch(console.error);
