// TEMP: provision E2E users for the page-crawl diagnostic
import { provisionTestUsers } from '../e2e/provision';
provisionTestUsers()
  .then(() => {
    console.log('PROVISION OK');
    process.exit(0);
  })
  .catch((e) => {
    console.error('PROVISION FAILED:', e?.message || e);
    process.exit(1);
  });