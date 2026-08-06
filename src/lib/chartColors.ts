export const CHART_COLORS = {
  primary: 'var(--color-error)',
  blue: '#3b82f6',
  emerald: '#10b981',
  amber: '#f59e0b',
  purple: '#8b5cf6',
  slate: '#6b7280',
  red: '#ef4444',
  cyan: '#06b6d4',
} as const;

export const CHART_PALETTE = [
  CHART_COLORS.blue,
  CHART_COLORS.emerald,
  CHART_COLORS.amber,
  CHART_COLORS.purple,
  CHART_COLORS.primary,
  CHART_COLORS.cyan,
  CHART_COLORS.slate,
];

export const CHART_FILLS = {
  blue: 'var(--color-chart-fill-blue)',
  emerald: 'var(--color-chart-fill-emerald)',
  amber: 'var(--color-chart-fill-amber)',
  purple: 'var(--color-chart-fill-purple)',
  primary: 'var(--color-chart-fill-primary)',
  cyan: 'var(--color-chart-fill-cyan)',
} as const;

export const GOVERNANCE_PALETTES = {
  sla: {
    colors: ['var(--color-chart-sla-1)', 'var(--color-chart-sla-2)', 'var(--color-chart-sla-3)'],
    fills: ['var(--color-chart-fill-sla-1)', 'var(--color-chart-fill-sla-2)', 'var(--color-chart-fill-sla-3)'],
    gradient: ['var(--color-chart-sla-1)', 'var(--color-chart-sla-2)', 'var(--color-chart-sla-3)'],
  },
  audit: {
    colors: ['var(--color-chart-audit-1)', 'var(--color-chart-audit-2)', 'var(--color-chart-audit-3)'],
    fills: ['var(--color-chart-fill-audit-1)', 'var(--color-chart-fill-audit-2)', 'var(--color-chart-fill-audit-3)'],
    gradient: ['var(--color-chart-audit-1)', 'var(--color-chart-audit-2)', 'var(--color-chart-audit-3)'],
  },
  risk: {
    colors: ['var(--color-chart-risk-1)', 'var(--color-chart-risk-2)', 'var(--color-chart-risk-3)'],
    fills: ['var(--color-chart-fill-risk-1)', 'var(--color-chart-fill-risk-2)', 'var(--color-chart-fill-risk-3)'],
    gradient: ['var(--color-chart-risk-1)', 'var(--color-chart-risk-2)', 'var(--color-chart-risk-3)'],
  },
  policy: {
    colors: ['var(--color-chart-policy-1)', 'var(--color-chart-policy-2)', 'var(--color-chart-policy-3)'],
    fills: ['var(--color-chart-fill-policy-1)', 'var(--color-chart-fill-policy-2)', 'var(--color-chart-fill-policy-3)'],
    gradient: ['var(--color-chart-policy-1)', 'var(--color-chart-policy-2)', 'var(--color-chart-policy-3)'],
  },
  general: {
    colors: CHART_PALETTE,
    fills: Object.values(CHART_FILLS),
    gradient: ['var(--color-chart-general-1)', 'var(--color-chart-general-2)', 'var(--color-chart-general-3)'],
  },
} as const;
