import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, LayoutDashboard, Ticket, Globe, BookOpen, Settings, X, ChevronRight, ChevronLeft, Check
} from 'lucide-react';

interface Step {
  icon: React.ReactNode;
  title: string;
  description: string;
  note?: string;
}

const STEPS: Step[] = [
  {
    icon: <Shield className="w-10 h-10 text-accent" />,
    title: 'Welcome to 4Core FinSupport',
    description: 'Your centralized dispute management and compliance platform. Manage payment incidents, track SLA performance, and stay audit-ready — all in one place.',
    note: 'Use the sidebar to navigate between modules.',
  },
  {
    icon: <LayoutDashboard className="w-10 h-10 text-accent" />,
    title: 'Executive Dashboard',
    description: 'Monitor real-time KPIs across Performance, Operations, and Quality tabs. Track FCR, SLA breaches, dispute exposure, provider scorecards, and trend charts.',
    note: 'Switch tabs to drill into operational metrics and quality benchmarks.',
  },
  {
    icon: <Ticket className="w-10 h-10 text-warning" />,
    title: 'Ticket Workspace',
    description: 'Manage individual complaints from receipt to resolution. Investigate, escalate, generate RCA reports, collaborate via comments, and declare Major Incidents.',
    note: 'Each ticket includes full audit trail, watcher notifications, and SLA deadline tracking.',
  },
  {
    icon: <Globe className="w-10 h-10 text-success" />,
    title: 'Multi-Party Portals',
    description: 'Customer, Partner, and Provider portals allow each party to submit, track, and update complaints — with role-based views and survey feedback.',
    note: 'Portals are auto-selected based on your login role.',
  },
  {
    icon: <BookOpen className="w-10 h-10 text-accent" />,
    title: 'Knowledge Base & Incidents',
    description: 'Access playbooks, known issues, and remediation guides. Declare and manage Major Incidents with timeline tracking and post-incident reviews.',
    note: 'Templates accelerate consistent complaint handling.',
  },
  {
    icon: <Settings className="w-10 h-10 text-text-secondary" />,
    title: 'Admin & Configuration',
    description: 'Configure business units, payment providers, SLA rules, user roles, holiday calendars, and notification routing. View immutable audit logs.',
    note: 'All configuration changes are logged for compliance.',
  },
];

export default function OnboardingTour() {
  const [open, setOpen] = React.useState(true);
  const [step, setStep] = React.useState(0);
  const [dismissed, setDismissed] = React.useState(() => {
    try { return localStorage.getItem('4c_tour_dismissed') === 'true'; } catch { return false; }
  });

  const dismiss = () => {
    try { localStorage.setItem('4c_tour_dismissed', 'true'); } catch { /* ignore */ }
    setDismissed(true);
    setOpen(false);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  if (dismissed) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-overlay backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <motion.div
            className="relative w-[90vw] max-w-lg bg-surface-elevated rounded-2xl border border-border-subtle shadow-2xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <button
              onClick={handleClose}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-hover transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="px-8 pt-10 pb-6 text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-2xl bg-surface border border-border-subtle flex items-center justify-center">
                  {current.icon}
                </div>
              </div>
              <h2 className="text-lg font-bold text-text-primary mb-2">{current.title}</h2>
              <p className="text-sm text-text-muted leading-relaxed">{current.description}</p>
              {current.note && (
                <div className="mt-4 inline-flex items-center gap-1.5 bg-accent/10 text-accent-light text-[11px] font-semibold px-3 py-1.5 rounded-full">
                  <Shield className="w-3 h-3" />
                  {current.note}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-8 py-4 bg-surface border-t border-border-subtle">
              <button
                onClick={dismiss}
                className="text-xs text-text-muted hover:text-text-secondary font-semibold transition cursor-pointer"
              >
                Skip tour
              </button>

              <div className="flex items-center gap-1.5">
                {STEPS.map((_, i) => (
                  <span
                    key={i}
                    className={`block rounded-full transition-all duration-200 ${
                      i === step ? 'w-6 h-2 bg-accent' : 'w-2 h-2 bg-border'
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                {step > 0 && (
                  <button
                    onClick={() => setStep(s => s - 1)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-elevated rounded-lg transition cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Back
                  </button>
                )}
                {isLast ? (
                  <button
                    onClick={dismiss}
                    className="flex items-center gap-1 px-4 py-1.5 bg-accent hover:bg-accent-light text-white text-xs font-semibold rounded-lg transition cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" /> Done
                  </button>
                ) : (
                  <button
                    onClick={() => setStep(s => s + 1)}
                    className="flex items-center gap-1 px-4 py-1.5 bg-accent hover:bg-accent-light text-white text-xs font-semibold rounded-lg transition cursor-pointer"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
