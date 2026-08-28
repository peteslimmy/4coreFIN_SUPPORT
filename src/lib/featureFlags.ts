/**
 * Client-side feature flags.
 *
 * Flags are read from `localStorage` at startup and can be toggled at runtime
 * via the dev toolbar or console.  They default to `false` (new code is hidden)
 * so we can migrate pages incrementally.
 *
 * Usage:
 *   import { flags } from '@/lib/featureFlags';
 *   if (flags.NEW_DESIGN_SYSTEM) { … }
 *
 * Toggle at runtime (browser console):
 *   localStorage.setItem('ff:NEW_DESIGN_SYSTEM', 'true');
 *   location.reload();
 */

const PREFIX = 'ff:' as const;

export interface FeatureFlags {
  /** Master toggle for the MD3 design-system migration. When false (default),
   *  pages render the legacy look. When true, migrated pages use the new
   *  design tokens and components. */
  NEW_DESIGN_SYSTEM: boolean;

  /** Enable per-user SSE channels (server-side filtering). */
  SSE_PER_USER_CHANNELS: boolean;

  /** Enable compact density as default (overrides user preference). */
  COMPACT_DENSITY_DEFAULT: boolean;
}

function readFlag(key: string): boolean {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v === 'true' || v === '1';
  } catch {
    return false;
  }
}

function createFlags(): FeatureFlags {
  return {
    NEW_DESIGN_SYSTEM: readFlag('NEW_DESIGN_SYSTEM'),
    SSE_PER_USER_CHANNELS: readFlag('SSE_PER_USER_CHANNELS'),
    COMPACT_DENSITY_DEFAULT: readFlag('COMPACT_DENSITY_DEFAULT'),
  };
}

/** Singleton flag object — re-evaluated on each import (module-level). */
export const flags: FeatureFlags = createFlags();

/**
 * Update a flag at runtime and persist to localStorage.
 * Call `location.reload()` afterwards to let the app pick up the change.
 */
export function setFlag<K extends keyof FeatureFlags>(key: K, value: FeatureFlags[K]): void {
  localStorage.setItem(PREFIX + key, String(value));
}

/** Reset all flags to defaults (remove from localStorage). */
export function resetFlags(): void {
  Object.keys(flags).forEach((k) => localStorage.removeItem(PREFIX + k));
}
