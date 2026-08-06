import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import { authorizedFetch } from '../lib/api';

interface Settings {
  [key: string]: string;
}

let cachedSettings: Settings | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30_000; // 30 seconds

async function fetchAdminSettings(
  setSettings: Dispatch<SetStateAction<Settings>>,
  setLoading: Dispatch<SetStateAction<boolean>>
) {
  try {
    const res = await authorizedFetch('/api/admin/settings');
    if (res.ok) {
      const data = await res.json();
      cachedSettings = data;
      cacheTimestamp = Date.now();
      setSettings(data);
    }
  } catch (e) {
    console.error('Failed to fetch settings:', e);
  } finally {
    setLoading(false);
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(cachedSettings || {});
  const [loading, setLoading] = useState(!cachedSettings);

  const refresh = useCallback(async () => {
    if (cachedSettings && Date.now() - cacheTimestamp < CACHE_TTL) {
      setSettings(cachedSettings);
      setLoading(false);
      return;
    }
    await fetchAdminSettings(setSettings, setLoading);
  }, [setSettings, setLoading]);

  const updateSetting = useCallback(async (key: string, value: string) => {
    try {
      const res = await authorizedFetch(`/api/admin/settings/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, [key]: value }));
        cachedSettings = { ...cachedSettings, [key]: value };
      }
      return res.ok;
    } catch (e) {
      console.error('Failed to update setting:', e);
      return false;
    }
  }, []);

  const updateSettings = useCallback(async (newSettings: Record<string, string>) => {
    try {
      const res = await authorizedFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, ...newSettings }));
        cachedSettings = { ...cachedSettings, ...newSettings };
      }
      return res.ok;
    } catch (e) {
      console.error('Failed to update settings:', e);
      return false;
    }
  }, []);

  const getSetting = useCallback((key: string, fallback?: string) => {
    return settings[key] ?? fallback;
  }, [settings]);

  useEffect(() => {
    if (cachedSettings && Date.now() - cacheTimestamp < CACHE_TTL) {
      return;
    }
    fetchAdminSettings(setSettings, setLoading);
  }, [setSettings, setLoading]);

  return { settings, loading, getSetting, updateSetting, updateSettings, refresh };
}

// Public settings hook (no auth required)
export function usePublicSettings() {
  const [settings, setSettings] = useState<Settings>({});

  useEffect(() => {
    fetch('/api/public/settings')
      .then(r => r.json())
      .then(setSettings)
      .catch(() => {});
  }, []);

  return settings;
}
