import { useState, useMemo } from 'react';
import { BarChart3, Search } from 'lucide-react';
import Table from '../ui/Table';
import type { PartnerMetricRow } from '../../lib/executiveMetrics';

interface PartnerScorecardProps {
  data: PartnerMetricRow[];
  onExport?: () => void;
}

export default function PartnerScorecard({ data, onExport: _onExport }: PartnerScorecardProps) {
  const [sortField, setSortField] = useState<string>('partner');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [search, setSearch] = useState('');

  const handleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const filtered = useMemo(() =>
    data.filter(s => s.partner.toLowerCase().includes(search.toLowerCase())),
    [data, search],
  );

  return (
    <div className="bg-surface-elevated rounded-xl shadow-card p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" /> Payment Partner SLA Scorecard
        </h3>
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Filter..."
            aria-label="Filter partners"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-border rounded-lg px-3 py-1.5 text-body-sm focus:ring-1 focus:ring-accent/20 focus:border-accent outline-none transition-all duration-200 focus-ring bg-surface"
          />
        </div>
      </div>
      <Table
        columns={[
          { key: 'partner', header: 'Payment Partner', sortable: true, render: (s: PartnerMetricRow) => <span className="font-bold text-text-primary">{s.partner}</span> },
          { key: 'sla', header: 'SLA %', sortable: true, align: 'right', render: (s: PartnerMetricRow) => <span className="font-mono text-success-dark">{s.sla.toFixed(1)}%</span> },
          { key: 'active', header: 'Active', sortable: true, align: 'right', render: (s: PartnerMetricRow) => <span className="font-mono">{s.active}</span> },
          { key: 'mttr', header: 'MTTR (h)', sortable: true, align: 'right', render: (s: PartnerMetricRow) => <span className="font-mono">{s.mttr}h</span> },
          { key: 'reopen', header: 'Reopen %', sortable: true, align: 'right', render: (s: PartnerMetricRow) => <span className="font-mono text-text-muted">{s.reopen}%</span> },
          { key: 'satisfaction', header: 'CSAT', sortable: true, align: 'right', render: (s: PartnerMetricRow) => <span className="font-mono">{s.satisfaction} / 5</span> },
          { key: 'status', header: 'Status', align: 'right', render: (s: PartnerMetricRow) => {
            const variantMap: Record<string, 'success' | 'warning' | 'error'> = { 'Excellent': 'success', 'Passing': 'warning' };
            const variant = variantMap[s.status] || 'error';
            return (
              <span className={`inline-flex items-center gap-1.5 font-bold uppercase text-caption ${
                variant === 'success' ? 'text-success-dark' : variant === 'warning' ? 'text-warning-dark' : 'text-error-dark'
              }`}>
                <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${variant === 'success' ? 'bg-success' : variant === 'warning' ? 'bg-warning' : 'bg-error'}`} />
                {s.status}
              </span>
            );
          }},
        ]}
        data={filtered}
        keyExtractor={(s: PartnerMetricRow) => s.partner}
        sortable
        sortField={sortField}
        sortDirection={sortAsc ? 'asc' : 'desc'}
        onSort={handleSort}
      />
    </div>
  );
}
