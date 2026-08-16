/**
 * Shared integration-test conftest: reset the test project before every test
 * and tear down the GoTrue identities the test created afterwards.
 *
 * hardResetDb() must be called from beforeAll (or research helpers) — see the
 * helper comment in testDb.ts. The beforeEach here guarantees isolation even
 * when tests run concurrently or a prior test failed midway.
 */

import { beforeEach, afterEach } from 'vitest';
import { resetDatabase } from './testDb';
import { teardownTestAuth } from './testUsers';

beforeEach(async () => {
  await resetDatabase();
});

afterEach(async () => {
  await teardownTestAuth();
});