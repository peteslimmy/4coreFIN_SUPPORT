import { provisionTestUsers } from './provision';

/**
 * Provision run-scoped E2E identities + app users before the suite runs.
 * Global teardown removes them (see global-teardown.ts).
 */
export default async function globalSetup(): Promise<void> {
  await provisionTestUsers();
}