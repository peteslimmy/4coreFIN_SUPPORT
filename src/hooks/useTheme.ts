import { useEffect } from 'react';
import { usePublicSettings } from './useSettings';

function updateFavicon(url: string | null) {
  document.querySelectorAll('link[rel*="icon"]').forEach(el => el.remove());
  if (url) {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = url;
    document.head.appendChild(link);
  }
}

export function applyTheme(settings: Record<string, string>) {
  const root = document.documentElement;

  // Apply color tokens
  if (settings['theme.primary']) root.style.setProperty('--primary', settings['theme.primary']);
  if (settings['theme.secondary']) root.style.setProperty('--secondary', settings['theme.secondary']);
  if (settings['theme.accent']) root.style.setProperty('--accent', settings['theme.accent']);
  if (settings['theme.border_radius']) root.style.setProperty('--radius', settings['theme.border_radius']);

  // Theme mode (light-first: default is light, .dark toggles to dark)
  const mode = settings['theme.mode'] || 'system';
  if (mode === 'dark') {
    root.classList.add('dark');
  } else if (mode === 'light') {
    root.classList.remove('dark');
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  }

  // Favicon
  updateFavicon(settings['branding.favicon'] ? '/api/public/branding/favicon' : null);
}

export function useTheme() {
  const settings = usePublicSettings();

  useEffect(() => {
    if (settings && Object.keys(settings).length > 0) {
      applyTheme(settings);
    }
  }, [settings]);

  return {};
}
