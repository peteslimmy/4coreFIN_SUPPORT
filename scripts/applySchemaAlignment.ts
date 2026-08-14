import 'dotenv/config';
import https from 'https';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || '';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
if (!PROJECT_REF || !ACCESS_TOKEN) throw new Error('SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN required');

function runSql(query: string): Promise<any> {
  return new Promise((res, rej) => {
    const data = JSON.stringify({ query });
    const req = https.request(
      {
        hostname: 'api.supabase.com',
        path: `/v1/projects/${PROJECT_REF}/database/query`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Length': Buffer.byteLength(data) },
      },
      (r) => {
        let b = '';
        r.on('data', (c) => (b += c));
        r.on('end', () => {
          try { res({ status: r.statusCode, data: JSON.parse(b) }); } catch { res({ status: r.statusCode, data: b }); }
        });
      }
    );
    req.on('error', rej);
    req.write(data);
    req.end();
  });
}

// Minimal SQL statement splitter (mirrors setupSupabase, handles strings/comments/dollar-quotes).
function parseSqlStatements(sql: string): string[] {
  const stmts: string[] = [];
  let current = '';
  let i = 0, dollarTag: string | null = null, inString: string | null = null;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i], next = sql[i + 1];
    if (inString === null && dollarTag === null && ch === '-' && next === '-') { while (i < n && sql[i] !== '\n') i++; continue; }
    if (inString === null && dollarTag === null && ch === '/' && next === '*') { i += 2; while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++; i += 2; continue; }
    if (inString === null && ch === '$') {
      const tag = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i))?.[0];
      if (tag) { if (dollarTag === null) dollarTag = tag; else if (dollarTag === tag) dollarTag = null; current += tag; i += tag.length; continue; }
    }
    if (dollarTag === null) {
      if (inString === null && (ch === "'" || ch === '"')) inString = ch;
      else if (inString === ch) { if (inString === "'" && next === "'") { current += ch + next; i += 2; continue; } inString = null; }
    }
    if (dollarTag === null && inString === null && ch === ';') { const t = current.trim(); if (t) stmts.push(t); current = ''; i++; continue; }
    current += ch; i++;
  }
  const t = current.trim();
  if (t) stmts.push(t);
  return stmts;
}

async function main() {
  const file = process.argv[2] || '026_code_schema_alignment.sql';
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations', file), 'utf8');
  const stmts = parseSqlStatements(sql);
  console.log(`Applying ${file} (${stmts.length} statements)...`);
  let failed = 0;
  for (let i = 0; i < stmts.length; i++) {
    const firstLine = stmts[i].split('\n')[0].slice(0, 90);
    const r = await runSql(stmts[i]);
    const err = String(r.data?.message || r.data?.error || (typeof r.data === 'string' ? r.data : '') || '');
    if (r.status === 200 || r.status === 201 || r.status === 204) {
      console.log(`  OK (${r.status}): ${firstLine}`);
    } else if (/already exists|duplicate key|duplicate key value/.test(err)) {
      console.log(`  OK (idempotent): ${firstLine}\n     -> ${err.slice(0, 140)}`);
    } else {
      console.log(`  FAIL (${r.status}): ${firstLine}\n     -> ${err.slice(0, 240)}`);
      failed++;
    }
  }
  if (failed > 0) {
    console.log(`\n${failed} statement(s) failed — not marking migrations applied.`);
    process.exit(1);
  }
  // Mark applied so the canonical runner never replays a superseded migration.
  const marks = process.argv[2]
    ? [process.argv[2]]
    : ['025_provider_to_partner.sql', '026_code_schema_alignment.sql'];
  for (const name of marks) {
    const r = await runSql(`INSERT INTO _applied_migrations (name) VALUES ('${name}') ON CONFLICT (name) DO NOTHING;`);
    console.log(`mark applied ${name}: ${r.status}`);
  }
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });