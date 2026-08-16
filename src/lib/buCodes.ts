export interface BuDescription {
  name: string;
  code: string;
}

/** A business unit record as stored in app_config. */
export interface BuUnit {
  name: string;
  code?: string;
}

/** True when the raw value looks like an object business unit {code: {name, code}}. */
export function isBuObject(v: unknown): v is BuUnit {
  return typeof v === 'object' && v !== null && typeof (v as BuUnit).name === 'string';
}

/**
 * Auto-generate a short uppercase code from a business unit name, e.g.
 * "RETAIL-B" → "RET". Falls back to "BU" for empty names.
 * Only letters (A-Z) are used, exactly 3 characters.
 */
export function suggestBuCode(name: string): string {
  const letters = (name ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, ''); // Remove everything except A-Z
  if (!letters) return 'BU';
  return letters.slice(0, 3); // Take exactly 3 characters
}

/**
 * Normalize a mixed list of string names and /* BU objects into BuUnit[],
 * deriving a code for missing ones. Order of the input is preserved.
 */
export function normalizeBusinessUnits(raw: unknown[] | undefined | null): BuUnit[] {
  const seen = new Set<string>();
  return (raw || []).map((v) => {
    if (isBuObject(v)) {
      const name = String(v.name);
      const code = (v.code || suggestBuCode(name)).toUpperCase();
      seen.add(code);
      return { name, code };
    }
    const name = String(v ?? '');
    let code = suggestBuCode(name);
    while (seen.has(code)) code += 'X';
    seen.add(code);
    return { name, code };
  });
}

/** Names only, matching the legacy string[] contract used across the app. */
export function businessUnitNames(raw: unknown[] | undefined | null): string[] {
  return normalizeBusinessUnits(raw).map((b) => b.name);
}

/** Look up the code for a business unit by name (case-insensitive); null when missing. */
export function buCodeFor(name: string, raw: unknown[] | undefined | null): string | null {
  const target = (name || '').toUpperCase();
  const hit = normalizeBusinessUnits(raw).find((b) => b.name.toUpperCase() === target);
  return hit ? hit.code : null;
}

/** Format a date as YYMMMDD for ticket numbering (e.g. 26AUG16). */
export function yymmdd(date: Date = new Date()): string {
  const y = String(date.getFullYear()).slice(-2);
  const m = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Generate the next ticket id "BUCODE-YYMMMDD-NNN" for a business unit.
 * Falls back to the legacy `TKT-<ms>` format when the BU has no code, so
 * creation never blocks. `existingIds` lets callers compute the next sequence
 * number deterministically (supply the already-scoped ticket id list).
 */
export function nextTicketId(
  buName: string,
  buRaw: unknown[] | undefined | null,
  existingIds: string[],
  now: Date = new Date()
): string {
  const code = buCodeFor(buName, buRaw);
  if (!code) return 'TKT-' + now.getTime();
  const date = yymmdd(now);
  const prefix = `${code}-${date}-`;
  let max = 0;
  for (const id of existingIds || []) {
    if (typeof id === 'string' && id.startsWith(prefix)) {
      const n = parseInt(id.slice(prefix.length), 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}