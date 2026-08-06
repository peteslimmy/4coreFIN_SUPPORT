import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import type { ToastData, ToastType } from '../types/ui';

interface ToastContextType {
  toasts: ToastData[];
  addToast: (message: string, type?: ToastType, duration?: number, action?: ToastData['action']) => void;
  removeToast: (id: string) => void;
  pauseToast: (id: string) => void;
  resumeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const timeoutsRef = useRef<Map<string, { timeoutId: ReturnType<typeof setTimeout>; startTime: number; duration: number }>>(new Map());

  const removeToast = useCallback((id: string) => {
    timeoutsRef.current.delete(id);
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType = 'info', duration: number = 4000, action?: ToastData['action']) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setToasts(prev => [...prev, { id, message, type, duration, action }]);
    if (duration > 0) {
      const timeoutId = setTimeout(() => removeToast(id), duration);
      timeoutsRef.current.set(id, { timeoutId, startTime: Date.now(), duration });
    }
  }, [removeToast]);

  const pauseToast = useCallback((id: string) => {
    const entry = timeoutsRef.current.get(id);
    if (!entry) return;
    clearTimeout(entry.timeoutId);
    const elapsed = Date.now() - entry.startTime;
    const remaining = Math.max(entry.duration - elapsed, 0);
    timeoutsRef.current.set(id, { timeoutId: 0 as unknown as ReturnType<typeof setTimeout>, startTime: 0, duration: remaining });
    setToasts(prev => prev.map(t => t.id === id ? { ...t, paused: true } : t));
  }, []);

  const resumeToast = useCallback((id: string) => {
    const entry = timeoutsRef.current.get(id);
    if (!entry || entry.duration <= 0) return;
    const timeoutId = setTimeout(() => removeToast(id), entry.duration);
    timeoutsRef.current.set(id, { timeoutId, startTime: Date.now(), duration: entry.duration });
    setToasts(prev => prev.map(t => t.id === id ? { ...t, paused: false } : t));
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, pauseToast, resumeToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
