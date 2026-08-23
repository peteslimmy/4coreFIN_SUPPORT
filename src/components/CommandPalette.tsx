import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Ticket,
  Users,
  BookOpen,
  BarChart2,
  ArrowRight,
  Clock,
  Zap,
  FileText,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useUi } from '../context/UiContext';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { api } from '../lib/api';

interface PaletteItem {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  type: 'ticket' | 'customer' | 'kb' | 'document' | 'nav' | 'shortcut' | 'recent';
  action: () => void;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [prevOpen, setPrevOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [backendResults, setBackendResults] = useState<PaletteItem[]>([]);
  const [recentSearches, setRecentSearches] = useState<PaletteItem[]>([]);
  const [shortcuts, setShortcuts] = useState<PaletteItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { tickets, kbArticles, customers } = useApp();
  const { setActiveTab, setActiveTicketId } = useUi();
  const loading = recentLoading || searchLoading;

  useKeyboardShortcuts([
    { key: 'k', ctrl: true, handler: () => setOpen(o => !o) },
  ]);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setBackendResults([]);
      setRecentSearches([]);
      setShortcuts([]);
    }
  }

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const debouncedQuery = useDebounce(query, 300);

  // Fetch recent searches and shortcuts when palette opens with empty query
  useEffect(() => {
    if (!open) return;
    if (debouncedQuery.length >= 2) return;

    let cancelled = false;
    setRecentLoading(true);

    Promise.all([
      api.getRecentSearches().catch(() => []),
      api.getSearchShortcuts().catch(() => []),
    ]).then(([recent, sc]) => {
      if (cancelled) return;
      setRecentSearches(
        (recent || []).map((r, i) => ({
          id: `recent:${i}`,
          label: r.query,
          description: `Searched ${new Date(r.searchedAt).toLocaleDateString()}`,
          icon: Clock,
          type: 'recent' as const,
          action: () => setQuery(r.query),
        }))
      );
      setShortcuts(
        (sc || []).map((s) => ({
          id: `shortcut:${s.id}`,
          label: s.name,
          description: s.query,
          icon: Zap,
          type: 'shortcut' as const,
          action: () => setQuery(s.query),
        }))
      );
    }).catch(() => {}).finally(() => {
      if (!cancelled) setRecentLoading(false);
    });

    return () => { cancelled = true; };
  }, [open, debouncedQuery]);

  // Backend search
  useEffect(() => {
    if (debouncedQuery.length < 2) return;

    let cancelled = false;
    setSearchLoading(true);

    api.globalSearch(debouncedQuery).then((data) => {
      if (cancelled) return;
      const items: PaletteItem[] = [];

      for (const t of data.tickets || []) {
        items.push({
          id: `bkt:${t.id}`,
          label: t.title,
          description: t.subtitle,
          icon: Ticket,
          type: 'ticket',
          action: () => { setActiveTicketId(t.id); setActiveTab('tickets'); },
        });
      }
      for (const c of data.customers || []) {
        items.push({
          id: `bkc:${c.id}`,
          label: c.title,
          description: c.subtitle,
          icon: Users,
          type: 'customer',
          action: () => setActiveTab('customers'),
        });
      }
      for (const a of data.kbArticles || []) {
        items.push({
          id: `bkkb:${a.id}`,
          label: a.title,
          description: a.subtitle,
          icon: BookOpen,
          type: 'kb',
          action: () => setActiveTab('kb'),
        });
      }
      for (const d of data.documents || []) {
        items.push({
          id: `bkdoc:${d.id}`,
          label: d.title,
          description: d.subtitle,
          icon: FileText,
          type: 'document',
          action: () => setActiveTab('documents'),
        });
      }

      setBackendResults(items);
    }).catch(() => {
      if (!cancelled) setBackendResults([]);
    }).finally(() => {
      if (!cancelled) setSearchLoading(false);
    });

    return () => { cancelled = true; };
  }, [debouncedQuery, setActiveTab, setActiveTicketId]);

  const clientItems = useMemo<PaletteItem[]>(() => {
    const results: PaletteItem[] = [];
    const q = query.toLowerCase().trim();
    if (!q) return results;

    const navItems: { id: string; label: string; icon: LucideIcon }[] = [
      { id: 'tickets', label: 'Ticket Workspace', icon: Ticket },
      { id: 'dashboard', label: 'Executive Performance', icon: BarChart2 },
      { id: 'audit_logs', label: 'Immutable Audit Logs', icon: BookOpen },
      { id: 'kb', label: 'Knowledge Base', icon: BookOpen },
    ];

    for (const nav of navItems) {
      if (nav.label.toLowerCase().includes(q)) {
        results.push({
          id: `nav:${nav.id}`,
          label: `Go to ${nav.label}`,
          description: 'Navigate to page',
          icon: ArrowRight,
          type: 'nav',
          action: () => setActiveTab(nav.id),
        });
      }
    }

    for (const t of tickets) {
      if (t.id.toLowerCase().includes(q) || t.customerName.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)) {
        results.push({
          id: `ticket:${t.id}`,
          label: `${t.id} - ${t.customerName}`,
          description: `${t.category} [${t.status}]`,
          icon: Ticket,
          type: 'ticket',
          action: () => { setActiveTicketId(t.id); setActiveTab('tickets'); },
        });
      }
    }

    for (const c of (customers || [])) {
      const fullName = `${c.firstName} ${c.lastName}`;
      if (fullName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.businessUnit.toLowerCase().includes(q)) {
        results.push({
          id: `customer:${c.id}`,
          label: fullName,
          description: `${c.email} - ${c.businessUnit}`,
          icon: Users,
          type: 'customer',
          action: () => setActiveTab('customers'),
        });
      }
    }

    for (const a of kbArticles) {
      if (a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q)) {
        results.push({
          id: `kb:${a.id}`,
          label: a.title,
          description: a.category ? `KB - ${a.category}` : 'Knowledge Base',
          icon: BookOpen,
          type: 'kb',
          action: () => setActiveTab('kb'),
        });
      }
    }

    return results.slice(0, 12);
  }, [query, tickets, kbArticles, customers, setActiveTab, setActiveTicketId]);

  const allItems = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) {
      return [...recentSearches, ...shortcuts].slice(0, 15);
    }
    const effectiveBackend = q.length >= 2 ? backendResults : [];
    const merged = [...effectiveBackend, ...clientItems];
    const deduped = merged.filter((item, index, self) =>
      index === self.findIndex((other) => other.id === item.id)
    );
    return deduped.slice(0, 15);
  }, [query, backendResults, clientItems, recentSearches, shortcuts]);

  const typeBadge: Record<PaletteItem['type'], { color: string; label: string }> = {
    ticket: { color: 'bg-blue-100 text-blue-700', label: 'Ticket' },
    customer: { color: 'bg-green-100 text-green-700', label: 'Customer' },
    kb: { color: 'bg-purple-100 text-purple-700', label: 'KB' },
    document: { color: 'bg-amber-100 text-amber-700', label: 'Document' },
    nav: { color: 'bg-slate-100 text-slate-600', label: 'Navigation' },
    shortcut: { color: 'bg-cyan-100 text-cyan-700', label: 'Shortcut' },
    recent: { color: 'bg-slate-100 text-slate-500', label: 'Recent' },
  };

  const executeItem = useCallback((item: PaletteItem) => {
    item.action();
    setOpen(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % Math.max(allItems.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + allItems.length) % Math.max(allItems.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allItems[activeIndex]) {
        executeItem(allItems[activeIndex]);
      }
    }
  }, [allItems, activeIndex, executeItem]);

  const prevDebouncedQueryRef = useRef('');

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const activeEl = list.children[activeIndex] as HTMLElement | undefined;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-overlay backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-lg bg-surface-elevated rounded-xl shadow-modal border border-border overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              {loading ? (
                <Loader2 className="w-5 h-5 text-text-muted shrink-0 animate-spin" />
              ) : (
                <Search className="w-5 h-5 text-text-muted shrink-0" />
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
                onKeyDown={handleKeyDown}
                placeholder="Search tickets, customers, knowledge base..."
                className="flex-1 text-sm text-text-primary placeholder:text-text-muted outline-none bg-transparent focus-ring rounded"
              />
              <kbd className="text-[10px] text-text-muted bg-surface px-1.5 py-0.5 rounded font-mono border border-border">ESC</kbd>
            </div>
            <div ref={listRef} className="max-h-[360px] overflow-y-auto p-2">
              {allItems.length === 0 && !loading && query && (
                <p className="text-sm text-text-muted text-center py-8">No results for &quot;{query}&quot;</p>
              )}
              {allItems.length === 0 && !loading && !query && (
                <p className="text-sm text-text-muted text-center py-8">Start typing to search...</p>
              )}
              {loading && allItems.length === 0 && (
                <p className="text-sm text-text-muted text-center py-8">Searching...</p>
              )}
              {allItems.map((item, index) => {
                const badge = typeBadge[item.type];
                return (
                  <button
                    key={item.id}
                    onClick={() => executeItem(item)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-left focus-ring ${
                      index === activeIndex ? 'bg-surface-hover' : 'hover:bg-surface'
                    }`}
                  >
                    <item.icon className="w-4 h-4 text-text-muted shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-text-primary truncate">{item.label}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${badge.color}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-muted truncate">{item.description}</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
