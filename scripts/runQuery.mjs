// TEMP: run an ad-hoc query against the dev project via Management API.
// Usage: node scripts/runQuery.mjs '<SQL>'
import { config } from 'dotenv';
config({ override: true });
const q = process.argv[2] || 'select 1';
const r = await fetch(
  'https://api.supabase.com/v1/projects/' + process.env.SUPABASE_PROJECT_REF + '/database/query',
  {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  }
);
const text = await r.text();
try {
  const arr = JSON.parse(text);
  console.log(JSON.stringify(Array.isArray(arr) ? arr.slice(0, 50) : arr, null, 1));
} catch {
  console.log(text);
}