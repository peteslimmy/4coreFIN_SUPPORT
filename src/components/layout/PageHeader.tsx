import type { ReactNode } from 'react';
import Breadcrumbs from '../ui/Breadcrumbs';
import type { BreadcrumbItem } from '../../types/ui';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  className?: string;
}

export default function PageHeader({ title, subtitle, breadcrumbs, actions, className = '' }: PageHeaderProps) {
  return (
    <div className={`mb-4 ${className}`}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs items={breadcrumbs} className="mb-2" />
      )}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-h2 text-text-primary font-semibold">{title}</h1>
          {subtitle && <p className="text-body-sm text-text-muted mt-1 max-w-2xl">{subtitle}</p>}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </div>
      <div className="mt-3 h-px bg-border-subtle" />
    </div>
  );
}
