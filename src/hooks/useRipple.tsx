import React, { useState, useCallback, useRef, useEffect } from 'react';

export default function useRipple(disabled?: boolean) {
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number; size: number }>>([]);
  const nextId = useRef(0);
  const prefersReducedMotion = useRef(false);
  // Track expiry timers so pending ripples are cleared on unmount instead of
  // firing state updates into a dead component.
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current.clear();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => { prefersReducedMotion.current = e.matches; };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled || prefersReducedMotion.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.5;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const id = nextId.current++;
    setRipples(prev => [...prev, { id, x, y, size }]);
    const t = setTimeout(() => {
      timers.current.delete(t);
      setRipples(prev => prev.filter(r => r.id !== id));
    }, 600);
    timers.current.add(t);
  }, [disabled]);
  const rippleElements = ripples.map(r => (
    <span key={r.id} className="pointer-events-none absolute rounded-full bg-surface-card/30 animate-ripple"
      style={{ left: r.x, top: r.y, width: r.size, height: r.size }} />
  ));
  return { onMouseDown, rippleElements };
}
