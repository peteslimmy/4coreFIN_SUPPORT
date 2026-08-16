/**
 * Local data cleanup.
 *
 * The offline mirrors (localStorage `4c_*` keys + the Dexie IndexedDB
 * database) were removed: the server and the React Query cache are the only
 * sources of truth. This module now exists solely to wipe any residual data
 * written by older builds — logout calls it as defense-in-depth on shared
 * machines.
 */

const LEGACY_LS_KEYS = [
  '4c_tickets', '4c_comments', '4c_audit', '4c_major_incidents',
  '4c_watcher_notifications', '4c_users', '4c_sla_rules', '4c_holidays',
  '4c_ticket_templates', '4c_kb_articles', '4c_saved_replies', '4c_customers',
  '4c_business_units', '4c_business_unit_codes', '4c_partners',
  '4c_payment_channels', '4c_categories', '4c_evidence', '4c_bu_form_configs',
  '4c_ticket_form_configs', '4c_roles',
];

const LEGACY_IDB_NAME = '4CoreFinSupportDB';

/** Remove every locally persisted app dataset (logout / decommissioning). */
export async function clearAppData(): Promise<void> {
  try {
    for (const key of LEGACY_LS_KEYS) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // localStorage unavailable (private mode) — nothing to clean.
  }
  try {
    // Deregister the retired Dexie database; resolves even when absent.
    if (typeof indexedDB !== 'undefined' && indexedDB.deleteDatabase) {
      indexedDB.deleteDatabase(LEGACY_IDB_NAME);
    }
  } catch {
    // Best-effort only.
  }
}
