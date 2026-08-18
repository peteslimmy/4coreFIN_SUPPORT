import { provisionTestUsers } from './e2e/provision.ts';

provisionTestUsers()
  .then(() => console.log('provisionTestUsers: OK'))
  .catch((e) => { console.error('provisionTestUsers: ERR', e); process.exit(1); });