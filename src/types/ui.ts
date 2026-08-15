import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outlined' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
}

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

export interface StatusDotProps {
  status: string;
  label?: string;
  className?: string;
}

export interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  src?: string;
  className?: string;
}

export interface CardProps {
  title?: ReactNode;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  hoverable?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export type TabsOrientation = 'horizontal' | 'vertical';

export interface TabItem {
  value: string;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (value: string) => void;
  orientation?: TabsOrientation;
  className?: string;
  label?: string;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  homeIcon?: ReactNode;
  className?: string;
}

export interface DropdownItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

export interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right';
  className?: string;
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: ReactNode;
  footer?: ReactNode;
  closeOnOverlay?: boolean;
}

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastData {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  paused?: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface TableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (item: T) => ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  sortable?: boolean;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (field: string) => void;
  selectedRows?: Set<string>;
  onSelect?: (id: string) => void;
  onSelectAll?: () => void;
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  onRowClick?: (item: T) => void;
  className?: string;
}

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export type SkeletonVariant = 'text' | 'card' | 'table-row' | 'avatar' | 'chart';

export interface SkeletonProps {
  variant?: SkeletonVariant;
  count?: number;
  className?: string;
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export interface ProgressWizardStep {
  label: string;
  status?: 'completed' | 'active' | 'pending' | 'error' | 'terminal';
  errorCount?: number;
}

export interface ProgressWizardProps {
  steps: ProgressWizardStep[];
  currentStep?: number;
  className?: string;
}

export interface KpiCardProps {
  title: string;
  value: string | number;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    label: string;
  };
  icon?: ReactNode;
  color?: string;
  onClick?: () => void;
  animateValue?: boolean;
  format?: (value: number) => string;
  className?: string;
}

export interface TooltipProps {
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  children: ReactNode;
}

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export type GovernanceContext = 'sla' | 'audit' | 'risk' | 'policy' | 'general';

export interface ChartYKey {
  key: string;
  name: string;
  color?: string;
  fill?: string;
}

export interface ChartConfig {
  xKey?: string;
  yKeys?: ChartYKey[];
  y2Keys?: ChartYKey[];
  valueKey?: string;
  nameKey?: string;
  zKey?: string;
  colors?: string[];
  showLegend?: boolean;
  showGrid?: boolean;
  stacked?: boolean;
  max?: number;
  threshold?: number;
}

export interface DrillDownInfo {
  label: string;
  value: string | number;
  payload?: Record<string, unknown>;
  governance?: {
    slaStatus?: 'compliant' | 'breached' | 'at-risk';
    riskLevel?: 'low' | 'medium' | 'high' | 'critical';
    auditStatus?: 'verified' | 'pending' | 'flagged';
  };
}

export interface ChartDataEntry {
  name?: string;
  value?: number;
  color?: string;
  count?: number;
  [key: string]: string | number | boolean | undefined;
}

export interface GovernanceChartProps {
  type: 'area' | 'bar' | 'horizontal-bar' | 'stacked-bar' | 'pie' | 'radar' | 'line' | 'composed' | 'donut' | 'radial-bar' | 'funnel' | 'treemap' | 'scatter' | 'gauge';
  data: ChartDataEntry[];
  config: ChartConfig;
  title: string;
  subtitle?: string;
  governanceContext?: GovernanceContext;
  height?: number;
  className?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  onDrillDown?: (info: DrillDownInfo) => void;
  onCrossFilter?: (filter: { key: string; value: string } | null) => void;
  crossFilter?: { key: string; value: string } | null;
  exportable?: boolean;
  animated?: boolean;
  periodOptions?: Array<{ label: string; value: string }>;
  periodValue?: string;
  onPeriodChange?: (value: string) => void;
  valueFormatter?: (value: number) => string;
  xTickFormatter?: (value: unknown) => string;
}
