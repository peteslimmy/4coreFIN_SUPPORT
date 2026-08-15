import { post, jar } from './httpClient.mjs';

const login = await post('/api/auth/login', {
  email: 'qa_test_20260815_201550@4coreqa.local',
  password: 'QA_Test_Pass_2026!',
});
console.log('LOGIN', login.status);
const csrf = jar.get('4c_csrf') ?? '';
if (!csrf) { console.log('NO-CSRF'); process.exit(1); }
const h = (extra = {}) => ({ ['X-CSRF-Token']: csrf, 'Content-Type': 'application/json', ...extra });

const empty = await post('/api/tickets', { id: '' }, h());
console.log('EMPTY-CREATE', empty.status, JSON.stringify(empty.body));

const noEmail = await post('/api/tickets', { businessUnit: 'RETAIL' }, h());
console.log('NO-EMAIL', noEmail.status, JSON.stringify(noEmail.body));

const ok = await post('/api/tickets', {
  customerName: 'Verify Customer',
  customerEmail: 'sec56verify@test.com',
  businessUnit: 'RETAIL',
  id: 'tkt-sec56-live-check',
}, h());
console.log('VALID-CREATE', ok.status, JSON.stringify(ok.body));