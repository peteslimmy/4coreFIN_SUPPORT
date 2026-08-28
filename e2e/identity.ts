/**
 * E2E identity — fixed, stable credentials so every process (global-setup,
 * test worker, spec) sees the same users and password.
 */
const FIXED_PASSWORD = (process.env.E2E_PASSWORD || 'E2e!fixed123').trim();

export const RUN_ID = 'e2efixed';
export const E2E_PASSWORD = FIXED_PASSWORD;
export const MARKER = `[E2E ${RUN_ID}]`;

// .test is the IANA-reserved TLD for testing. The old `.e2e` domain is no
// longer usable: Zod 4's email validation (login route) rejects TLDs that
// contain digits, so every login with an @…​.e2e address failed with 400.
const DOMAIN = `${RUN_ID}.test` as const;

export const customerEmail = (seq: number): string => `customer${seq}@${DOMAIN}`;

export interface E2eUser {
  key: string;
  email: string;
  name: string;
  role: string;
  bu: string;
  partner?: string;
}

export const E2E_USERS: E2eUser[] = [
  { key: 'superadmin', email: `e2e.superadmin@${DOMAIN}`, name: 'E2E Super Admin', role: 'SUPER_ADMIN', bu: 'EXECUTIVE' },
  { key: 'executive', email: `e2e.executive@${DOMAIN}`, name: 'E2E Executive', role: 'EXECUTIVE', bu: 'EXECUTIVE' },
  { key: 'possap',     email: `e2e.possap@${DOMAIN}`,     name: 'E2E POSSAP Support',  role: 'BU_SUPPORT',  bu: 'POSSAP' },
  { key: 'vreg',       email: `e2e.vreg@${DOMAIN}`,       name: 'E2E VREG Support',    role: 'BU_SUPPORT',  bu: 'VREG' },
  { key: 'partner',    email: `e2e.partner@${DOMAIN}`,    name: 'E2E PARKWAY Partner', role: 'PARTNER',     bu: '', partner: 'PARKWAY' },
];

export const USERS = Object.fromEntries(E2E_USERS.map((u) => [u.key, u.email])) as Record<string, string>;