/**
 * Real Supabase identity + users-row provisioning for integration tests.
 *
 * Login in this repo goes through Supabase Auth (signInWithPassword), so a
 * seeded "app user" is not enough — a real GoTrue identity must exist for the
 * email/password the test signs in with. This helper provisions that identity
 * (admin API, email confirmed by default) and the matching app `users` row
 * (tenant_id resolved the same way the repository does).
 *
 * All identities created here are tracked so the conftest can delete them on
 * teardown with admin.auth.admin.deleteUser (which also removes the app row via
 * users.auth_user_id ON DELETE CASCADE).
 */

import bcrypt from 'bcryptjs';
import { supabase } from './testDb';
import { tenantIdForBu, GLOBAL_TENANT_ID } from '../../server/tenant';
import { ensureTenantForBu } from '../../server/repository';

export const TEST_PASSWORD = 'password123';

export interface TestUserSeed {
  id: string;
  name: string;
  email: string;
  role: string;
  bu: string;
  phone?: string;
  password?: string;
  /** Email confirmed in GoTrue (default true). Set false to test unconfirmed login. */
  emailConfirm?: boolean;
  /** Create a GoTrue identity (default true). Set false for rows that never sign in. */
  auth?: boolean;
  isActive?: boolean;
  mustChangePassword?: boolean;
  activationToken?: string | null;
  accountType?: string;
  partner?: string;
  passwordHash?: string;
  /** Optional extra columns for special rows. */
  extra?: Record<string, unknown>;
}

const createdAuthIds = new Set<string>();

export function trackedAuthIds(): ReadonlySet<string> {
  return createdAuthIds;
}

/** Idempotently remove an existing GoTrue identity for an email (if any). */
async function deleteIdentityIfExists(email: string): Promise<void> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 10000 });
  if (error || !data?.users) return;
  const users = data.users as unknown as Array<{ id: string; email?: string }>;
  const existing = users.filter((u) => u.email?.toLowerCase() === email.toLowerCase());
  for (const u of existing) {
    if (createdAuthIds.has(u.id)) {
      createdAuthIds.delete(u.id);
    }
    await supabase.auth.admin.deleteUser(u.id);
  }
}

/**
 * Provision a real GoTrue identity + the matching app user row.
 * Returns the app user id and the auth identity id.
 */
export async function createTestUser(seed: TestUserSeed): Promise<{ userId: string; authId: string | null }> {
  const userId = seed.id;
  const tenantId = tenantIdForBu(seed.bu);
  if (tenantId !== GLOBAL_TENANT_ID) {
    await ensureTenantForBu(seed.bu);
  }

  let authId: string | null = null;
  if (seed.auth !== false) {
    await deleteIdentityIfExists(seed.email);
    const password = seed.password ?? TEST_PASSWORD;
    const { data, error } = await supabase.auth.admin.createUser({
      email: seed.email,
      password,
      email_confirm: seed.emailConfirm !== false,
      user_metadata: { full_name: seed.name },
    });
    if (error || !data.user) {
      throw new Error(
        `createUser(${seed.email}) auth provisioning failed: ${error?.message}. ` +
          'Run "npm run test:reset" to wipe the test project first.'
      );
    }
    authId = data.user.id;
    createdAuthIds.add(authId);
  }

  const passwordHash = seed.passwordHash ?? (await bcrypt.hash(seed.password ?? TEST_PASSWORD, 10));

  const row: Record<string, unknown> = {
    id: userId,
    name: seed.name,
    email: seed.email,
    password_hash: passwordHash,
    role: seed.role,
    bu: seed.bu,
    phone: seed.phone ?? '',
    tenant_id: tenantId,
    account_type: seed.accountType ?? (seed.role === 'PARTNER' ? 'PARTNER' : 'BU'),
    must_change_password: seed.mustChangePassword ?? false,
    is_active: seed.isActive ?? true,
    activation_token: seed.activationToken ?? null,
    ...(seed.partner ? { partner: seed.partner } : {}),
    ...(authId ? { auth_user_id: authId } : {}),
    ...(seed.extra ?? {}),
  };

  const { error: insertError } = await supabase.from('users').insert(row);
  if (insertError) {
    throw new Error(`createUser(${seed.email}) users insert failed: ${insertError.message}`);
  }

  return { userId, authId };
}

/** Convenience: create several users at once. */
export async function createTestUsers(seeds: TestUserSeed[]): Promise<void> {
  for (const seed of seeds) {
    await createTestUser(seed);
  }
}

/** Delete every auth identity created by this process. */
export async function teardownTestAuth(): Promise<void> {
  for (const authId of Array.from(createdAuthIds)) {
    await supabase.auth.admin.deleteUser(authId);
  }
  createdAuthIds.clear();
}