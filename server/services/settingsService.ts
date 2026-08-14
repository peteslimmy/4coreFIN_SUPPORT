import { supabase } from '../supabase';

const DEFAULTS: Record<string, any> = {
  'branding.logo_light': null,
  'branding.logo_dark': null,
  'branding.favicon': null,
  'branding.hero_image': null,
  'branding.feature_images': [],
  'branding.org_name': '4CoreFin',
  'branding.logo_size': 32,
  'theme.primary': '#2563eb',
  'theme.secondary': '#64748b',
  'theme.accent': '#10b981',
  'theme.mode': 'system',
  'theme.border_radius': '8px',
  'theme.font_family': 'Plus Jakarta Sans',
  'smtp.host': '',
  'smtp.port': '',
  'smtp.security': 'tls',
  'smtp.username': '',
  'smtp.password': '',
  'smtp.from_email': '',
  'smtp.from_name': '',
  'integrations.api_keys': [],
  'integrations.webhooks': [],
  'auth.session_timeout': 43200,
  'auth.require_mfa': false,
  'auth.password_min_length': 8,
  'auth.password_require_uppercase': true,
  'auth.password_require_number': true,
  'auth.password_require_special': true,
};

// Public settings that can be fetched without auth (for login page branding + theme)
const PUBLIC_KEYS = [
  'branding.logo_light',
  'branding.logo_dark',
  'branding.favicon',
  'branding.hero_image',
  'branding.org_name',
  'branding.logo_size',
  'theme.primary',
  'theme.secondary',
  'theme.accent',
  'theme.mode',
  'theme.border_radius',
];

export async function getSetting(key: string): Promise<any> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', key)
    .single();
  if (error || !data) return DEFAULTS[key] ?? null;
  return data.value;
}

export async function getSettings(keys?: string[]): Promise<Record<string, any>> {
  const query = keys
    ? supabase.from('system_settings').select('key, value').in('key', keys)
    : supabase.from('system_settings').select('key, value');
  const { data, error } = await query;
  if (error || !data) return { ...DEFAULTS };

  const result: Record<string, any> = { ...DEFAULTS };
  for (const row of data) {
    result[row.key] = row.value;
  }
  return result;
}

export async function getPublicSettings(): Promise<Record<string, any>> {
  const allSettings = await getSettings(PUBLIC_KEYS);
  const result: Record<string, any> = {};
  for (const key of PUBLIC_KEYS) {
    result[key] = allSettings[key] ?? DEFAULTS[key] ?? null;
  }
  return result;
}

export async function setSetting(key: string, value: any, updatedBy?: string): Promise<void> {
  const { error } = await supabase
    .from('system_settings')
    .upsert({ key, value, updated_by: updatedBy || null, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`setSetting error: ${error.message}`);
}

export async function setSettings(settings: Record<string, any>, updatedBy?: string): Promise<void> {
  const rows = Object.entries(settings).map(([key, value]) => ({
    key,
    value,
    updated_by: updatedBy || null,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('system_settings').upsert(rows, { onConflict: 'key' });
  if (error) throw new Error(`setSettings error: ${error.message}`);
}
