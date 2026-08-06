import { useState } from 'react';
import { useApp } from '../context/AppContext';
import BrandingSettings from '../components/admin/BrandingSettings';
import ThemeSettings from '../components/admin/ThemeSettings';
import IntegrationSettings from '../components/admin/IntegrationSettings';
import DataSettings from '../components/admin/DataSettings';
import ComplaintFormsSettings from '../components/admin/ComplaintFormsSettings';
import AccessControlSettings from '../components/admin/AccessControlSettings';
import { Palette, Building2, Plug, Database, ClipboardList, ShieldCheck } from 'lucide-react';
import PageTransition from '../components/layout/PageTransition';
import PageContainer from '../components/layout/PageContainer';
import PageHeader from '../components/layout/PageHeader';

const TABS = [
  { id: 'branding', label: 'Branding', icon: Building2 },
  { id: 'theme', label: 'Theme', icon: Palette },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'forms', label: 'Complaint Forms', icon: ClipboardList },
  { id: 'access', label: 'Access Control', icon: ShieldCheck },
  { id: 'data', label: 'Data', icon: Database },
];

export default function AdminSettingsPage() {
  const { currentRole, can } = useApp();
  const [activeTab, setActiveTab] = useState('branding');

  if (currentRole !== 'SUPER_ADMIN' && !can('admin:config') && !can('admin:access')) {
    return (
      <PageTransition>
        <PageContainer maxWidth="lg">
          <div className="text-center py-12 text-text-muted text-base">Access denied. Admin only.</div>
        </PageContainer>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <PageContainer maxWidth="lg">
        <PageHeader
          title="Admin Settings"
          subtitle="Customize branding, theme, and integrations for your organization"
          breadcrumbs={[{ label: 'Home' }, { label: 'Administration' }, { label: 'Settings' }]}
        />

        <div className="flex flex-col md:flex-row gap-6">
          {/* Sidebar Tabs */}
          <div className="w-full md:w-48 shrink-0">
            <nav className="space-y-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition ${
                    activeTab === id
                      ? 'bg-accent/10 text-accent-light border border-border dark:bg-accent-dark/30 dark:text-accent-light dark:border-border'
                      : 'text-text-muted hover:bg-surface-hover'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 bg-surface-elevated rounded-xl p-6">
            {activeTab === 'branding' && <BrandingSettings />}
            {activeTab === 'theme' && <ThemeSettings />}
            {activeTab === 'integrations' && <IntegrationSettings />}
            {activeTab === 'forms' && <ComplaintFormsSettings />}
            {activeTab === 'access' && <AccessControlSettings />}
            {activeTab === 'data' && <DataSettings />}
          </div>
        </div>
      </PageContainer>
    </PageTransition>
  );
}
