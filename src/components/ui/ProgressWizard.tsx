import { Check, X, type LucideIcon } from 'lucide-react';
import type { ProgressWizardProps, ProgressWizardStep } from '../../types/ui';

const statusStyles: Record<string, { circle: string; line: string; label: string; icon?: LucideIcon }> = {
  completed: {
    circle: 'bg-success border-success text-white ring-2 ring-success-light',
    line: 'bg-success',
    label: 'text-success-dark font-semibold',
    icon: Check,
  },
  active: {
    circle: 'bg-primary border-primary text-white ring-4 ring-primary-light',
    line: 'bg-primary',
    label: 'text-primary font-semibold',
  },
  pending: {
    circle: 'bg-surface-elevated border-border text-text-muted',
    line: 'bg-border',
    label: 'text-text-muted',
  },
  error: {
    circle: 'bg-error border-error text-white',
    line: 'bg-error',
    label: 'text-error-dark font-semibold',
    icon: X,
  },
  terminal: {
    circle: 'bg-success border-success text-white ring-2 ring-success-light',
    line: 'bg-success',
    label: 'text-success-dark font-semibold',
    icon: Check,
  },
};

export default function ProgressWizard({ steps, currentStep, className = '' }: ProgressWizardProps) {
  const isTerminal = (i: number) =>
    currentStep !== undefined && i === steps.length - 1 && i === currentStep;
  return (
    <div className={`flex items-center ${className}`} role="list" aria-label="Progress steps">
      {steps.map((step, i) => {
        const resolvedStatus: ProgressWizardStep['status'] =
          step.status || (currentStep !== undefined
            ? i < currentStep
              ? isTerminal(i) ? 'terminal' : 'completed'
              : i === currentStep
                ? (i === steps.length - 1 ? 'terminal' : 'active')
                : 'pending'
            : 'pending');
        const styles = statusStyles[resolvedStatus || 'pending'];
        const Icon = styles.icon;

        return (
          <div key={i} className="flex items-center flex-1 last:flex-none" role="listitem">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all duration-300 ${styles.circle}`}
                aria-current={resolvedStatus === 'active' || resolvedStatus === 'terminal' ? 'step' : undefined}
                aria-label={`${step.label}: ${resolvedStatus}`}
              >
                {Icon ? <Icon className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-[11px] mt-1.5 text-center max-w-[96px] leading-tight ${styles.label}`}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 mt-[-1.25rem] transition-colors duration-300 ${styles.line}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
