import { memo } from 'react';
import { ChevronRight, Home } from 'lucide-react';
import type { BreadcrumbsProps } from '../../types/ui';

function Breadcrumbs({ items, homeIcon, className = '' }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-1 text-sm ${className}`}>
      <span className="text-text-muted">{homeIcon || <Home className="w-4 h-4" />}</span>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="w-3.5 h-3.5 text-text-muted" aria-hidden="true" />
          {item.href ? (
            <a href={item.href} className="text-text-muted hover:text-text-primary transition-colors focus-ring rounded">
              {item.label}
            </a>
          ) : (
            <span className="text-text-primary font-semibold">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export default memo(Breadcrumbs);
