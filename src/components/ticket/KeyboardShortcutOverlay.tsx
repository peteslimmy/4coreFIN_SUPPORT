import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface ShortcutItem {
  keys: string[];
  description: string;
}

const shortcuts: ShortcutItem[] = [
  { keys: ['J'], description: 'Move down in ticket list' },
  { keys: ['K'], description: 'Move up in ticket list' },
  { keys: ['Enter'], description: 'Open selected ticket' },
  { keys: ['Space'], description: 'Toggle ticket selection' },
  { keys: ['Ctrl', 'E'], description: 'Escalate selected ticket' },
  { keys: ['?'], description: 'Toggle this help overlay' },
  { keys: ['Esc'], description: 'Close overlay or modal' },
];

interface KeyboardShortcutOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutOverlay({ isOpen, onClose }: KeyboardShortcutOverlayProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} />
      <div className="relative bg-surface-elevated border border-border rounded-xl shadow-elevated p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-text-primary">Keyboard Shortcuts</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          {shortcuts.map((shortcut, i) => (
            <div key={i} className="flex items-center justify-between py-1.5">
              <span className="text-xs text-text-secondary">{shortcut.description}</span>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key, j) => (
                  <kbd
                    key={j}
                    className="px-1.5 py-0.5 text-[11px] font-mono font-semibold text-text-primary bg-surface border border-border rounded"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-text-muted mt-4 pt-3 border-t border-border">
          Press <kbd className="px-1 py-0.5 font-mono text-[11px] bg-surface border border-border rounded">?</kbd> anywhere to toggle this overlay
        </p>
      </div>
    </div>
  );
}
