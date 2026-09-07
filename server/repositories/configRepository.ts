import { supabase } from '../supabase';
import { escapeLike } from '../lib/escapeLike';

// ─── App Config ────────────────────────────────────────────────────────

// Read-through cache for app_config values. Config rows are admin-managed and
// change rarely, but getConfig is hit on virtually every request (roles, BUs,
// SLA rules…). A short TTL removes the redundant DB round-trips under load.
// Writes through setConfig invalidate immediately. The cache also self-flushes
// when the Supabase client identity changes (tests swap in a fresh fake per
// test), preventing stale cross-test contamination.
const CONFIG_CACHE_TTL_MS = 60_000;
const configCache = new Map<string, { value: unknown; expiresAt: number; clientRef: unknown }>();

function flushConfigCacheIfStale(): void {
  const first = configCache.entries().next();
  if (!first.done && first.value[1].clientRef !== supabase) configCache.clear();
}

export function clearConfigCache(): void {
  configCache.clear();
}

export async function getConfig<T>(key: string, fallback: T): Promise<T> {
  flushConfigCacheIfStale();
  const cached = configCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', key)
    .single();
  if (error || !data) return fallback;
  configCache.set(key, { value: data.value, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS, clientRef: supabase });
  return data.value as T;
}

export async function setConfig(key: string, value: any) {
  const { error } = await supabase
    .from('app_config')
    .upsert({ key, value }, { onConflict: 'key' });
  if (error) throw new Error(`setConfig failed (${key}): ${error.message}`);
  configCache.delete(key);
}

// ─── Reference data: referential-integrity counters ───────────────────
// All counters use head-count queries: the database counts, no rows ship.

export async function countTicketsByBu(bu: string): Promise<number> {
  const { count, error } = await supabase
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('business_unit', bu)
    .eq('is_deleted', false);
  if (error) return 0;
  return count || 0;
}

export async function countTicketsByPartner(partner: string): Promise<number> {
  const { count, error } = await supabase
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('partner', partner)
    .eq('is_deleted', false);
  if (error) return 0;
  return count || 0;
}

export async function countTicketsByCategory(category: string): Promise<number> {
  const { count, error } = await supabase
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('category', category)
    .eq('is_deleted', false);
  if (error) return 0;
  return count || 0;
}

export async function countUsersByBu(bu: string): Promise<number> {
  const { count, error } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('bu', bu);
  if (error) return 0;
  return count || 0;
}

export async function countActiveTicketsByCategoryAndPriority(category: string, priority: string): Promise<number> {
  const { count, error } = await supabase
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .ilike('category', escapeLike(category.trim()))
    .ilike('priority', escapeLike(priority.trim()))
    .eq('is_deleted', false);
  if (error) return 0;
  return count || 0;
}

export async function categoryExists(name: string): Promise<boolean> {
  const items = await listConfigItems('categories', []);
  return items.some((c: any) => {
    const catName = typeof c === 'string' ? c : c?.name;
    return String(catName ?? '').trim().toLowerCase() === name.trim().toLowerCase();
  });
}

// ─── Reference data: app_config list manipulation ─────────────────────

/**
 * Returns the identity of an app_config list item. String items are
 * identified by their value; object items by their `id` (or `name` fallback).
 */
function configItemId(item: any): string {
  if (item == null) return '';
  if (typeof item === 'string') return String(item);
  return String(item.id ?? item.name ?? '');
}

export async function listConfigItems(key: string, fallback: any[]): Promise<any[]> {
  try {
    return (await getConfig<any[]>(key, fallback)) ?? [];
  } catch {
    return [];
  }
}

export async function addConfigItem(key: string, item: any): Promise<any[]> {
  const items = await listConfigItems(key, []);
  const id = configItemId(item);
  if (!id) throw new Error('Item needs an id or value');
  if (items.some((x) => configItemId(x) === id)) {
    throw new Error(`"${id}" already exists`);
  }
  const next = [...items, item];
  await setConfig(key, next);
  return next;
}

export async function updateConfigItem(key: string, id: string, patch: any): Promise<any[]> {
  const items = await listConfigItems(key, []);
  const target = items.find((x) => configItemId(x) === id);
  if (!target) throw new Error(`Not found: ${id}`);
  const next = items.map((x) => {
    if (configItemId(x) !== id) return x;
    if (typeof x === 'string') {
      // Legacy string row upgraded to an object patch (e.g. BU now carries a code).
      if (typeof patch === 'object' && patch !== null) return { ...patch, name: patch.name ?? String(x), id: x };
      return String(patch);
    }
    const merged = { ...x, ...patch };
    if (x.id || patch?.id) merged.id = x.id || patch.id;
    else if (!merged.name) merged.id = id;
    return merged;
  });
  await setConfig(key, next);
  return next;
}

export async function removeConfigItem(key: string, id: string): Promise<any[]> {
  const items = await listConfigItems(key, []);
  const next = items.filter((x) => configItemId(x) !== id);
  await setConfig(key, next);
  return next;
}

// ─── Reference data: custom kinds (user-created) ─────────────────────

export interface CustomReferenceKind {
  kind: string;
  label: string;
  labelPlural: string;
  description: string;
  stringItems: true;
}

export async function listCustomReferenceKinds(): Promise<CustomReferenceKind[]> {
  return (await getConfig<CustomReferenceKind[]>('customReferenceKinds', [])) ?? [];
}

export async function addCustomReferenceKind(def: CustomReferenceKind): Promise<void> {
  const kinds = await listCustomReferenceKinds();
  if (kinds.some((k) => String(k.kind ?? '').trim().toLowerCase() === String(def.kind).trim().toLowerCase())) {
    throw new Error(`A reference kind "${def.kind}" already exists`);
  }
  await setConfig('customReferenceKinds', [...kinds, def]);
}
