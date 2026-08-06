import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import type { ToastType } from '../../types/ui';

const iconMap: Record<ToastType, { icon: typeof CheckCircle; bg: string }> = {
  success: { icon: CheckCircle, bg: 'bg-success-light border-success' },
  error: { icon: XCircle, bg: 'bg-error-light border-error' },
  warning: { icon: AlertTriangle, bg: 'bg-warning-light border-warning' },
  info: { icon: Info, bg: 'bg-info-light border-info' },
};

const iconColor: Record<ToastType, string> = {
  success: 'text-success',
  error: 'text-error',
  warning: 'text-warning',
  info: 'text-info',
};

export default function ToastContainer() {
  const { toasts, removeToast, pauseToast, resumeToast } = useToast();

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none" aria-live="polite" aria-atomic="false">
      <AnimatePresence>
        {toasts.map(toast => {
          const config = iconMap[toast.type];
          const Icon = config.icon;
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
               className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg border shadow-toast bg-surface-elevated ${config.bg}`}
               role="alert"
               onMouseEnter={() => pauseToast(toast.id)}
               onMouseLeave={() => resumeToast(toast.id)}
             >
                <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor[toast.type]}`} />
                <p className="flex-1 text-sm text-text-primary">{toast.message}</p>
                {toast.action && (
                  <button
                    type="button"
                    onClick={() => {
                      removeToast(toast.id);
                      toast.action?.onClick();
                    }}
                    className="shrink-0 text-sm font-semibold text-primary hover:text-primary-dark underline-offset-2 hover:underline transition-colors focus-ring rounded"
                  >
                    {toast.action.label}
                  </button>
                )}
                <button
                  onClick={() => removeToast(toast.id)}
                  className="shrink-0 p-0.5 text-text-muted hover:text-text-primary transition-colors focus-ring rounded"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
             </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
