import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { authorizedFetch } from '../lib/api';

interface Settings {
  [key: string]: string;
}

let cachedSettings: Settings | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30_000; // 30 seconds

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(cachedSettings || {});
  const [loading, setLoading] = useState(!cachedSettings);
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const dirtyKeysRef = useRef(dirtyKeys);
  useEffect(() => { dirtyKeysRef.current = dirtyKeys; });

  const fetchAdminSettings = useCallback(async (
    setSettings: Dispatch<SetStateAction<Settings>>,
    setLoading: Dispatch<SetStateAction<boolean>>
  ) => {
    try {
      const res = await authorizedFetch('/api/admin/settings');
      if (res.ok) {
        const data = await res.json();
        cachedSettings = data;
        cacheTimestamp = Date.now();
        setSettings(prev => {
          const merged = { ...data };
          for (const [key, value] of Object.entries(prev)) {
            if (dirtyKeysRef.current.has(key)) {
              merged[key] = value;
            }
          }
          return merged;
        });
      }
    } catch (e) {
      console.error('Failed to fetch settings:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (cachedSettings && Date.now() - cacheTimestamp < CACHE_TTL) {
      setSettings(cachedSettings);
      setLoading(false);
      return;
    }
    await fetchAdminSettings(setSettings, setLoading);
  }, [setSettings, setLoading, fetchAdminSettings]);

  const updateSetting = useCallback(async (key: string, value: string) => {
    try {
      // Mark key as dirty optimistically
      setDirtyKeys(prev => {
        const newSet = new Set(prev);
        newSet.add(key);
        return newSet;
      });
      
      const res = await authorizedFetch(`/api/admin/settings/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, [key]: value }));
        cachedSettings = { ...cachedSettings, [key]: value };
        // Clear dirty flag on success
        setDirtyKeys(prev => {
          const newSet = new Set(prev);
          newSet.delete(key);
          return newSet;
        });
        return true;
      } else {
        // Keep dirty flag on failure so we can retry or show error
        return false;
      }
    } catch (e) {
      console.error('Failed to update setting:', e);
      // Keep dirty flag on failure
      return false;
    }
  }, []);

  const updateSettings = useCallback(async (newSettings: Record<string, string>) => {
    try {
      // Mark all keys in newSettings as dirty optimistically
      setDirtyKeys(prev => {
        const newSet = new Set(prev);
        for (const key of Object.keys(newSettings)) {
          newSet.add(key);
        }
        return newSet;
      });
      
      const res = await authorizedFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, ...newSettings }));
        cachedSettings = { ...cachedSettings, ...newSettings };
        // Clear dirty flags for successfully updated keys
        setDirtyKeys(prev => {
          const newSet = new Set(prev);
          for (const key of Object.keys(newSettings)) {
            newSet.delete(key);
          }
          return newSet;
        });
        return true;
      } else {
        // Keep dirty flags on failure
        return false;
      }
    } catch (e) {
      console.error('Failed to update settings:', e);
      // Keep dirty flags on failure
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
  }, [setSettings, setLoading, fetchAdminSettings]);

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
