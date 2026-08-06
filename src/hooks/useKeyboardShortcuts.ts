import { useEffect, useCallback } from 'react';

type ShortcutHandler = (e: KeyboardEvent) => void;

interface Shortcut {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  handler: ShortcutHandler;
  preventDefault?: boolean;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[], enabled = true) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    for (const s of shortcuts) {
      const ctrlPressed = e.ctrlKey || e.metaKey;
      const match = e.key.toLowerCase() === s.key.toLowerCase();
      const modMatch = s.ctrl || s.meta ? ctrlPressed : true;
      const shiftMatch = s.shift ? e.shiftKey : !e.shiftKey;

      if (match && modMatch && shiftMatch) {
        if (s.preventDefault !== false) e.preventDefault();
        s.handler(e);
        return;
      }
    }
  }, [shortcuts, enabled]);

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);
}
