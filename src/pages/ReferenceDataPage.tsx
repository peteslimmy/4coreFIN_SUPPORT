import { useState } from 'react';
import { Database } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { REFERENCE_KINDS } from '../types/reference';
import CrudTable from '../components/reference/CrudTable';
import PageTransition from '../components/layout/PageTransition';
import PageContainer from '../components/layout/PageContainer';
import PageHeader from '../components/layout/PageHeader';

export default function ReferenceDataPage() {
  const { currentRole, can } = useApp();
  const visibleKinds = REFERENCE_KINDS.filter((k) => currentRole === 'SUPER_ADMIN' || can(k.permission ?? 'admin:config'));
  const [activeKind, setActiveKind] = useState(visibleKinds[0]?.kind ?? 'businessUnits');

  if (currentRole !== 'SUPER_ADMIN' && !can('admin:config')) {
    return (
      <PageTransition>
        <PageContainer maxWidth="full">
          <div className="text-center py-12 text-text-muted text-base">Access denied. Admin only.</div>
        </PageContainer>
      </PageTransition>
    );
  }

  const activeDef = visibleKinds.find((k) => k.kind === activeKind) ?? visibleKinds[0];

  return (
    <PageTransition>
      <PageContainer maxWidth="full">
        <PageHeader
          title="Reference Data"
          subtitle="Manage business units, providers, categories, SLA rules, templates, and other configuration lists used across the platform"
          breadcrumbs={[{ label: 'Home' }, { label: 'Administration' }, { label: 'Reference Data' }]}
        />

        <div className="flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-56 shrink-0">
            <nav className="space-y-1">
              {visibleKinds.map((k) => (
                <button
                  key={k.kind}
                  onClick={() => setActiveKind(k.kind)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                    activeKind === k.kind
                      ? 'bg-accent/10 text-accent-light border border-border dark:bg-accent-dark/30 dark:text-accent-light dark:border-border'
                      : 'text-text-muted hover:bg-surface-hover'
                  }`}
                >
                  {k.kind === 'businessUnits' && <Database className="w-4 h-4" />}
                  {k.kind === 'paymentChannels' && <Database className="w-4 h-4" />}
                  {k.kind === 'providers' && <Database className="w-4 h-4" />}
                  {k.kind === 'categories' && <Database className="w-4 h-4" />}
                  {k.kind === 'slaRules' && <Database className="w-4 h-4" />}
                  {k.kind === 'holidays' && <Database className="w-4 h-4" />}
                  {k.kind === 'ticketTemplates' && <Database className="w-4 h-4" />}
                  {k.kind === 'escalationRules' && <Database className="w-4 h-4" />}
                  {k.kind === 'notificationConfigs' && <Database className="w-4 h-4" />}
                  {k.kind === 'savedReplies' && <Database className="w-4 h-4" />}
                  {k.kind === 'users' && <Database className="w-4 h-4" />}
                  {k.labelPlural}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex-1 bg-surface-elevated rounded-xl p-6">
            <CrudTable kind={activeDef} />
          </div>
        </div>
      </PageContainer>
    </PageTransition>
  );
}
