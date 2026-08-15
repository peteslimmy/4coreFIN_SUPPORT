import { useEffect, useMemo, useState } from 'react';
import { Database, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { REFERENCE_KINDS, type ReferenceKindDef } from '../types/reference';
import CrudTable from '../components/reference/CrudTable';
import UserAccountsManager from '../components/admin/UserAccountsManager';
import PageTransition from '../components/layout/PageTransition';
import PageContainer from '../components/layout/PageContainer';
import PageHeader from '../components/layout/PageHeader';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Textarea from '../components/ui/Textarea';
import { api } from '../lib/api';

interface CustomKindRecord {
  kind: string;
  label: string;
  labelPlural?: string;
  description?: string;
  stringItems?: boolean;
}

/** Derive a camelCase storage key from a display label. */
function labelToKind(label: string): string {
  const words = label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  return words.map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join('');
}

function customKindToDef(ck: CustomKindRecord): ReferenceKindDef {
  const label = ck.label || ck.kind;
  return {
    kind: ck.kind,
    label,
    labelPlural: ck.labelPlural || `${label}s`,
    stringItems: true,
    description: ck.description || '',
    fields: [{ key: 'value', label, type: 'text', required: true, placeholder: `e.g. ${label}` }],
    columns: [{ key: 'value', header: label }],
    idOf: (i) => String(i),
    supportBulkImport: true,
  };
}

const EMPTY_DRAFT = { kind: '', label: '', labelPlural: '', description: '', items: '' };

export default function ReferenceDataPage() {
  const { currentRole, can, showToast } = useApp();
  const [customKinds, setCustomKinds] = useState<CustomKindRecord[]>([]);
  const [kindModalOpen, setKindModalOpen] = useState(false);
  const [savingKind, setSavingKind] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [kindEdited, setKindEdited] = useState(false);
  const [activeKind, setActiveKind] = useState('businessUnits');

  const baseKinds = useMemo(
    () => REFERENCE_KINDS.filter((k) => currentRole === 'SUPER_ADMIN' || can(k.permission ?? 'admin:config')),
    [currentRole, can],
  );

  const visibleKinds = useMemo(() => [...baseKinds, ...customKinds.map(customKindToDef)], [baseKinds, customKinds]);

  useEffect(() => {
    api
      .listReferenceKinds()
      .then((kinds) => setCustomKinds((kinds ?? []) as CustomKindRecord[]))
      .catch(() => setCustomKinds([]));
  }, []);

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

  const openAddKind = () => {
    setDraft(EMPTY_DRAFT);
    setKindEdited(false);
    setKindModalOpen(true);
  };

  const handleLabelChange = (label: string) => {
    setDraft((p) => ({ ...p, label, kind: kindEdited ? p.kind : labelToKind(label) }));
  };

  const handleAddKind = async () => {
    const label = draft.label.trim();
    const kind = draft.kind.trim();
    if (!label) {
      showToast('Display name is required.', 'error');
      return;
    }
    if (!kind) {
      showToast('Storage key is required.', 'error');
      return;
    }
    setSavingKind(true);
    try {
      const result = (await api.createReferenceKind({
        kind,
        label,
        labelPlural: draft.labelPlural.trim() || label,
        description: draft.description.trim(),
        items: draft.items
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      })) as CustomKindRecord;
      setCustomKinds((prev) => [...prev, result] as CustomKindRecord[]);
      setKindModalOpen(false);
      setDraft(EMPTY_DRAFT);
      setKindEdited(false);
      setActiveKind(result.kind);
      showToast('Reference kind created.', 'success');
    } catch (e) {
      showToast((e as Error).message || 'Failed to create kind', 'error');
    } finally {
      setSavingKind(false);
    }
  };

  return (
    <PageTransition>
      <PageContainer maxWidth="full">
        <PageHeader
          title="Reference Data"
          subtitle="Manage business units, partner providers, categories, SLA rules, templates, and other configuration lists used across the platform"
          breadcrumbs={[{ label: 'Home' }, { label: 'Administration' }, { label: 'Reference Data' }]}
        />

        <div className="flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-56 shrink-0">
            <button
              onClick={openAddKind}
              className="w-full mb-3 flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs font-semibold text-accent-light hover:bg-surface-hover transition"
            >
              <Plus className="w-4 h-4" />
              Add Kind
            </button>
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
                  <Database className="w-4 h-4 shrink-0" />
                  {k.labelPlural}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex-1 bg-surface-elevated rounded-xl p-6">
            {activeDef.kind === 'users' ? <UserAccountsManager /> : <CrudTable kind={activeDef} />}
          </div>
        </div>

        <Modal
          open={kindModalOpen}
          onClose={() => setKindModalOpen(false)}
          title="Add Reference Kind"
          footer={
            <>
              <button
                onClick={() => setKindModalOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-text-muted hover:bg-surface-hover transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddKind}
                disabled={savingKind}
                className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition disabled:opacity-50"
              >
                {savingKind ? 'Creating…' : 'Create Kind'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <Input
              label="Display Name"
              required
              value={draft.label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="e.g. Payment Provider"
            />
            <Input
              label="Storage Key"
              helperText="Used as the reference data key. Auto-generated from the display name; letters, numbers and underscores only."
              value={draft.kind}
              onChange={(e) => {
                setKindEdited(true);
                setDraft((p) => ({ ...p, kind: e.target.value }));
              }}
              placeholder="e.g. paymentProviders"
            />
            <Input
              label="Plural Label"
              value={draft.labelPlural}
              onChange={(e) => setDraft((p) => ({ ...p, labelPlural: e.target.value }))}
              placeholder="e.g. Payment Providers"
            />
            <Textarea
              label="Description"
              value={draft.description}
              onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
              placeholder="Short description shown to admins"
              rows={2}
            />
            <Textarea
              label="Initial Items (one per line)"
              value={draft.items}
              onChange={(e) => setDraft((p) => ({ ...p, items: e.target.value }))}
              placeholder={'e.g.\nPaystack\nFlutterwave\nPaga'}
              rows={5}
            />
          </div>
        </Modal>
      </PageContainer>
    </PageTransition>
  );
}