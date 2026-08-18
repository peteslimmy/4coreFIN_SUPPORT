import { RUN_ID, E2E_PASSWORD, E2E_USERS } from './e2e/identity.ts';

async function main() {
  console.log('RUN_ID', RUN_ID);
  console.log('E2E_PASSWORD', E2E_PASSWORD);
  console.log('possap email', E2E_USERS.find(u => u.key === 'possap')?.email);

  const loginRes = await fetch('http://localhost:3001/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: E2E_USERS.find(u => u.key === 'possap')?.email,
      password: E2E_PASSWORD,
    }),
    redirect: 'manual',
  });
  console.log('login status', loginRes.status, 'location', loginRes.headers.get('location'));
}

main().catch((e) => { console.error(e); process.exit(1); });