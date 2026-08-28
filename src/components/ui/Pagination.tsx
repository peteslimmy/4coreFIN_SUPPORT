import type { PaginationProps } from '../../types/ui';

function getPageItems(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const items: Array<number | 'ellipsis'> = [1];
  if (current > 3) items.push('ellipsis');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    items.push(p);
  }
  if (current < total - 2) items.push('ellipsis');
  items.push(total);
  return items;
}

const Pagination = ({
  page,
  pageSize,
  total,
  onChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
}: PaginationProps) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);

  const goTo = (p: number) => {
    const clamped = Math.max(1, Math.min(totalPages, p));
    if (clamped !== current) onChange(clamped);
  };

  const itemBase =
    'inline-flex items-center justify-center h-8 min-w-8 px-2 text-xs font-medium rounded-md transition-colors focus-ring';
  const itemIdle = 'text-text-secondary hover:bg-surface-hover hover:text-text-primary';
  const itemActive = 'bg-primary text-[#fff]';

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-xs text-text-secondary" aria-live="polite">
        Showing <span className="font-semibold text-text-primary">{start}–{end}</span> of{' '}
        <span className="font-semibold text-text-primary">{total}</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => goTo(current - 1)}
          disabled={current <= 1}
          aria-label="Previous page"
          className={`${itemBase} ${itemIdle} disabled:opacity-40 disabled:pointer-events-none`}
        >
          ←
        </button>

        {getPageItems(current, totalPages).map((item, idx) =>
          item === 'ellipsis' ? (
            <span key={`ell-${idx}`} className="px-1.5 text-xs text-text-secondary" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => goTo(item)}
              aria-current={item === current ? 'page' : undefined}
              aria-label={`Page ${item}`}
              className={`${itemBase} ${item === current ? itemActive : itemIdle}`}
            >
              {item}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => goTo(current + 1)}
          disabled={current >= totalPages}
          aria-label="Next page"
          className={`${itemBase} ${itemIdle} disabled:opacity-40 disabled:pointer-events-none`}
        >
          →
        </button>

        {onPageSizeChange && (
          <label className="ml-3 flex items-center gap-1.5 text-xs text-text-secondary">
            <span className="hidden sm:inline">Rows</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Rows per page"
              className="h-8 rounded-md border border-border bg-surface-card px-1.5 text-xs text-text-primary focus-ring"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </nav>
  );
};

export default Pagination;
