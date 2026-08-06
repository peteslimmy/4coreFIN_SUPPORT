import { Moon, Sun, Monitor } from 'lucide-react';
import { usePublicSettings } from '../hooks/useSettings';
import { applyTheme } from '../hooks/useTheme';
import { authorizedFetch, hasSession } from '../lib/api';

const modes = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
] as const;

export default function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const settings = usePublicSettings();
  const current = (settings && settings['theme.mode']) || 'system';

  const cycleMode = async () => {
    const idx = modes.findIndex(m => m.value === current);
    const next = modes[(idx + 1) % modes.length].value;
    if (!hasSession()) {
      applyTheme({ 'theme.mode': next });
      return;
    }
    try {
      const res = await authorizedFetch('/api/admin/settings/theme.mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: next }),
      });
      if (res.ok) applyTheme({ 'theme.mode': next });
    } catch {
      applyTheme({ 'theme.mode': next });
    }
  };

  if (collapsed) {
    return (
      <button
        onClick={cycleMode}
        className="w-full flex justify-center p-2 rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors focus-ring"
        aria-label={`Theme: ${current}`}
      >
        {modes.map(m => {
          const Icon = m.icon;
          return (
            <Icon
              key={m.value}
              className={`w-4 h-4 ${m.value === current ? 'block' : 'hidden'}`}
            />
          );
        })}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 px-5 py-2">
      <button
        onClick={cycleMode}
        className="flex items-center gap-2 flex-1 p-2 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors focus-ring text-xs font-semibold"
      >
        {modes.map(m => {
          const Icon = m.icon;
          return (
            <Icon
              key={m.value}
              className={`w-4 h-4 ${m.value === current ? '' : 'hidden'}`}
            />
          );
        })}
        <span className="capitalize">{current}</span>
      </button>
    </div>
  );
}
