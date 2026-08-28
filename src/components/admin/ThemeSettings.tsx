import { useState, useEffect } from 'react';
import { useSettings } from '../../hooks/useSettings';
import { applyTheme } from '../../hooks/useTheme';
import ColorPicker from '../ui/ColorPicker';
import { Save, Monitor, Sun, Moon } from 'lucide-react';

const SAVED_RESET_DELAY = 2000;

const RADIUS_OPTIONS = [
  { label: 'Sharp', value: '0px' },
  { label: 'Rounded', value: '6px' },
  { label: 'Default', value: '8px' },
  { label: 'Smooth', value: '12px' },
  { label: 'Full', value: '9999px' },
];

export default function ThemeSettings() {
  const { settings, updateSettings } = useSettings();
  const [primary, setPrimary] = useState(settings['theme.primary'] || '#2563eb');
  const [secondary, setSecondary] = useState(settings['theme.secondary'] || '#64748b');
  const [accent, setAccent] = useState(settings['theme.accent'] || '#10b981');
  const [mode, setMode] = useState(settings['theme.mode'] || 'system');
  const [radius, setRadius] = useState(settings['theme.border_radius'] || '8px');
  const [saved, setSaved] = useState(false);

  // Live preview
  useEffect(() => {
    applyTheme({
      'theme.primary': primary,
      'theme.secondary': secondary,
      'theme.accent': accent,
      'theme.mode': mode,
      'theme.border_radius': radius,
    });
  }, [primary, secondary, accent, mode, radius]);

  const handleSave = async () => {
    await updateSettings({
      'theme.primary': primary,
      'theme.secondary': secondary,
      'theme.accent': accent,
      'theme.mode': mode,
      'theme.border_radius': radius,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), SAVED_RESET_DELAY);
  };

  return (
    <div className="space-y-6">
      {/* Color Pickers */}
      <div>
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Brand Colors</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ColorPicker value={primary} onChange={setPrimary} label="Primary" />
          <ColorPicker value={secondary} onChange={setSecondary} label="Secondary" />
          <ColorPicker value={accent} onChange={setAccent} label="Accent" />
        </div>
      </div>

      {/* Color Preview */}
      <div className="flex gap-3 items-center">
        <div className="w-10 h-10 rounded-lg border border-border-subtle" style={{ backgroundColor: primary }} title="Primary" />
        <div className="w-10 h-10 rounded-lg border border-border-subtle" style={{ backgroundColor: secondary }} title="Secondary" />
        <div className="w-10 h-10 rounded-lg border border-border-subtle" style={{ backgroundColor: accent }} title="Accent" />
        <span className="text-xs text-text-muted ml-2">Live preview — colors update the entire app</span>
      </div>

      {/* Dark Mode */}
      <div>
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Appearance</h4>
        <div className="flex gap-2">
          {[
            { value: 'light', label: 'Light', icon: Sun },
            { value: 'dark', label: 'Dark', icon: Moon },
            { value: 'system', label: 'System', icon: Monitor },
          ].map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setMode(value)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-xs font-semibold transition ${
                mode === value
                  ? 'bg-accent text-[#fff] border-accent'
                  : 'bg-surface-elevated text-text-secondary border-border-subtle hover:bg-surface'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Border Radius */}
      <div>
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Border Radius</h4>
        <div className="flex gap-2 flex-wrap">
          {RADIUS_OPTIONS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setRadius(value)}
              className={`px-4 py-2.5 border text-xs font-semibold transition ${
                radius === value
                  ? 'bg-accent text-[#fff] border-accent'
                  : 'bg-surface-elevated text-text-secondary border-border-subtle hover:bg-surface'
              }`}
              style={{ borderRadius: value }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2 items-center">
          <div className="w-16 h-8 bg-accent text-[#fff] text-xs font-bold flex items-center justify-center" style={{ borderRadius: radius }}>
            Preview
          </div>
          <span className="text-xs text-text-muted">— {radius}</span>
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        className="flex items-center gap-2 px-4 py-2 bg-accent text-[#fff] rounded-lg text-xs font-semibold hover:bg-accent-light transition"
      >
        <Save className="w-4 h-4" />
        {saved ? 'Saved!' : 'Save Theme'}
      </button>
    </div>
  );
}
