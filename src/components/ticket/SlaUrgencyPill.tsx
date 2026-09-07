import { motion } from 'framer-motion';
import { parseSlaCountdown, formatSlaPillText, formatSlaCompact, formatSlaVerbose, SlaCountdownParts } from '../../lib/utils';
import type { TicketStatus } from '../../types/app';

interface SlaUrgencyPillProps {
  deadlineMs: number;
  now: number;
  status: TicketStatus;
  size?: 'compact' | 'comfortable';
  showIcon?: boolean;
}

export function SlaUrgencyPill({ deadlineMs, now, status, size = 'comfortable', showIcon = true }: SlaUrgencyPillProps) {
  // Closed/Resolved = no active SLA
  if (status === 'CLOSED' || status === 'RESOLVED') return null;

  const parts = parseSlaCountdown(deadlineMs, now);
  const isBreached = parts.isBreached;
  const isAtRisk = !isBreached && parts.totalMinutes <= 60; // <1h = at risk

  // Semantic variant
  const variant = isBreached ? 'breach' : isAtRisk ? 'risk' : 'healthy';
   
  const variants = {
    breach: {
      bg: 'bg-sla-breach-bg',
      text: 'text-sla-breach',
      border: 'border-sla-breach',
      icon: 'priority_high',
      label: 'BREACHED',
      pulse: true,
    },
    risk: {
      bg: 'bg-sla-risk-bg',
      text: 'text-sla-risk',
      border: 'border-sla-risk',
      icon: 'warning_amber',
      label: 'AT RISK',
      pulse: false,
    },
    healthy: {
      bg: 'bg-sla-healthy-bg',
      text: 'text-sla-healthy',
      border: 'border-sla-healthy',
      icon: 'check_circle',
      label: 'ON TRACK',
      pulse: false,
    },
  } as const;

  const v = variants[variant];
  
  // Format for display: negative time for breached
  const displayText = isBreached 
    ? `-${parts.hours}h ${String(parts.minutes).padStart(2, '0')}m` 
    : formatSlaCompact(parts);

  return (
    <motion.div
      layout
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-medium max-text-10 ${v.bg} ${v.text} ${v.border}`}
      animate={v.pulse ? { boxShadow: ['0 0 0 0 var(--color-sla-breach)', '0 0 0 4px transparent'] } : {}}
      transition={{ duration: 1.5, repeat: Infinity }}
      style={v.pulse ? { boxShadow: '0 0 0 0 var(--color-sla-breach)' } : {}}
      title={formatSlaVerbose(parts)} // Tooltip on hover
    >
      {/* Colored dot indicator */}
      <span className={`w-1.5 h-1.5 rounded-full ${v.text}`} aria-hidden="true"></span>
      {/* Micro label */}
      {showIcon && (
        <span className="sr-only">{v.label}</span>
      )}
      {/* SLA time - micro typography */}
      <span className="text-sla-mono font-mono font-bold tabular-nums whitespace-nowrap text-micro">
        {displayText}
      </span>
      {/* Screen reader only text */}
      <span className="sr-only">{formatSlaVerbose(parts)}</span>
    </motion.div>
  );
}