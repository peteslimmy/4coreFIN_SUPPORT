import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Ticket, Users, BookOpen, BarChart2, ArrowRight, type LucideIcon } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

interface PaletteItem {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  action: () => void;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [prevOpen, setPrevOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { tickets, kbArticles, setActiveTab, setActiveTicketId, customers } = useApp();

  useKeyboardShortcuts([
    { key: 'k', ctrl: true, handler: () => setOpen(o => !o) },
  ]);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setQuery('');
  }

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
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
          action: () => setActiveTab('kb'),
        });
      }
    }

    return results.slice(0, 12);
  }, [query, tickets, kbArticles, customers, setActiveTab, setActiveTicketId]);

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
              <Search className="w-5 h-5 text-text-muted shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search tickets, customers, knowledge base..."
                className="flex-1 text-sm text-text-primary placeholder:text-text-muted outline-none bg-transparent focus-ring rounded"
                onKeyDown={e => {
                  if (e.key === 'Escape') setOpen(false);
                }}
              />
              <kbd className="text-[10px] text-text-muted bg-surface px-1.5 py-0.5 rounded font-mono border border-border">ESC</kbd>
            </div>
            <div className="max-h-[360px] overflow-y-auto p-2">
              {items.length === 0 && query && (
                <p className="text-sm text-text-muted text-center py-8">No results for &quot;{query}&quot;</p>
              )}
              {items.length === 0 && !query && (
                <p className="text-sm text-text-muted text-center py-8">Start typing to search...</p>
              )}
              {items.map(item => (
                <button
                  key={item.id}
                  onClick={() => { item.action(); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface transition text-left focus-ring"
                >
                  <item.icon className="w-4 h-4 text-text-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{item.label}</p>
                    <p className="text-[11px] text-text-muted truncate">{item.description}</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
