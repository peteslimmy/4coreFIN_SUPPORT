import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import type { GovernanceContext } from '../../types/ui';

interface DrillDownRow {
  label: string;
  value: string | number;
  highlight?: boolean;
}

interface GovernanceDrillDownProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  rows: DrillDownRow[];
  governanceContext?: GovernanceContext;
  onExport?: () => void;
  metadata?: string[];
}

const CONTEXT_STYLES: Record<GovernanceContext, { border: string; headerBg: string; icon: typeof Info }> = {
  sla: { border: 'border-chart-emerald/20', headerBg: 'bg-success-light', icon: CheckCircle },
  audit: { border: 'border-chart-purple/20', headerBg: 'bg-chart-fill-purple', icon: Info },
  risk: { border: 'border-chart-amber/20', headerBg: 'bg-warning-light', icon: AlertTriangle },
  policy: { border: 'border-chart-emerald/20', headerBg: 'bg-chart-fill-emerald', icon: Info },
  general: { border: 'border-accent/20', headerBg: 'bg-accent/10', icon: Info },
};

function GovernanceDrillDown({ open, onClose, title, subtitle, rows, governanceContext = 'general', onExport, metadata }: GovernanceDrillDownProps) {
  const styles = CONTEXT_STYLES[governanceContext];
  const ContextIcon = styles.icon;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-overlay"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className={`relative w-full max-w-sm bg-surface-elevated rounded-xl border-2 ${styles.border} shadow-2xl overflow-hidden`}
          >
            <div className={`${styles.headerBg} px-5 py-4 border-b border-border-subtle`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-surface-elevated shadow-sm">
                    <ContextIcon className="w-4 h-4 text-text-primary" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
                    {subtitle && <p className="text-[11px] text-text-muted mt-0.5">{subtitle}</p>}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-surface-elevated/80 text-text-muted hover:text-text-secondary transition cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-5">
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {rows.map((row, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className={`flex justify-between items-center py-2 px-3 rounded-lg text-xs ${
                      row.highlight
                        ? 'bg-accent/10 text-accent font-semibold border border-accent/20'
                        : i === rows.length - 1 && !row.highlight
                          ? 'bg-surface font-semibold text-text-primary border-t border-border-subtle'
                          : 'text-text-secondary'
                    }`}
                  >
                    <span>{row.label}</span>
                    <span className="font-mono">{row.value}</span>
                  </motion.div>
                ))}
              </div>
              {metadata && metadata.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border-subtle">
                  {metadata.map((m, i) => (
                    <p key={i} className="text-[10px] text-text-muted flex items-start gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-border mt-1 shrink-0" />
                      {m}
                    </p>
                  ))}
                </div>
              )}
              {onExport && (
                <div className="mt-4 pt-3 border-t border-border-subtle">
                  <button
                    onClick={onExport}
                    className="flex items-center gap-1.5 text-[11px] font-medium text-accent hover:text-accent-light transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Export these details
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default memo(GovernanceDrillDown);
