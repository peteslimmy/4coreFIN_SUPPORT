import { memo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, AlertCircle } from 'lucide-react';
import type { TableProps } from '../../types/ui';
import Skeleton from './Skeleton';

function Table<T>({
  columns, data, keyExtractor, sortable, sortField, sortDirection, onSort,
  selectedRows, onSelect, onSelectAll, loading, emptyMessage, emptyIcon, onRowClick, className = '',
}: TableProps<T>) {
  if (loading) {
    return (
      <div className={`space-y-2 ${className}`}>
        <Skeleton variant="table-row" count={columns.length > 3 ? 6 : 3} />
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto rounded-lg border border-border ${className}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface border-b border-border">
            {onSelect && (
              <th className="px-4 py-3 text-left w-10">
                <input
                  type="checkbox"
                  checked={selectedRows?.size === data.length && data.length > 0}
                  onChange={onSelectAll}
                  className="rounded border-border text-accent focus:ring-brand-500"
                  aria-label="Select all rows"
                />
              </th>
            )}
            {columns.map(col => {
              const ariaSort = sortable && col.sortable
                ? sortField === col.key
                  ? sortDirection === 'asc' ? 'ascending' as const : 'descending' as const
                  : 'none' as const
                : undefined;
              return (
              <th
                key={col.key}
                aria-sort={ariaSort}
                className={`px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider ${
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                } ${col.width ? '' : ''}`}
                style={col.width ? { width: col.width } : undefined}
              >
                {sortable && col.sortable ? (
                  <button
                    onClick={() => onSort?.(col.key)}
                    className="inline-flex items-center gap-1.5 hover:text-text-primary transition-colors focus-ring rounded"
                    aria-label={`Sort by ${col.header}${sortField === col.key ? (sortDirection === 'asc' ? ' ascending' : ' descending') : ''}`}
                  >
                    {col.header}
                    {sortField === col.key ? (
                      sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <ChevronsUpDown className="w-3.5 h-3.5 text-text-muted" aria-hidden="true" />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (onSelect ? 1 : 0)} className="px-4 py-16 text-center">
                <div className="flex flex-col items-center gap-3 text-text-muted">
                  {emptyIcon || <AlertCircle className="w-8 h-8 opacity-60" />}
                  <p className="text-sm text-text-muted">{emptyMessage || 'No data available'}</p>
                </div>
              </td>
            </tr>
          ) : (
            data.map(item => {
              const id = keyExtractor(item);
              const isSelected = selectedRows?.has(id);
              return (
                <tr
                  key={id}
                  className={`transition-colors duration-150 ${
                    isSelected ? 'bg-primary-light/60' : 'hover:bg-surface'
                  } ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={() => onRowClick?.(item)}
                  onKeyDown={(e) => { if (onRowClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onRowClick(item); } }}
                  role={onRowClick ? 'button' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {onSelect && (
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={!!isSelected}
                        onChange={() => onSelect(id)}
                        className="rounded border-border text-accent focus:ring-brand-500"
                        aria-label={`Select row ${id}`}
                      />
                    </td>
                  )}
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-sm ${
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                      }`}
                    >
                      {col.render ? col.render(item) : (item as Record<string, unknown>)[col.key] ?? '-'}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

const MemoizedTable = memo(Table) as typeof Table;
export default MemoizedTable;
