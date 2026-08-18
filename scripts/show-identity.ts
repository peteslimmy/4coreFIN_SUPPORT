import { E2E_USERS, E2E_PASSWORD } from './e2e/identity.ts';

async function main() {
  console.log('RUN_ID would map to these emails:');
  for (const u of E2E_USERS) console.log(' -', u.key, u.email);
  console.log('password:', E2E_PASSWORD);
}
main().catch((e) => { console.error(e); process.exit(1); });