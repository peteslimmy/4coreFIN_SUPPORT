import { useState, useRef, type ChangeEvent } from 'react';
import { Download, Upload, Database, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import ConfirmModal from '../ui/ConfirmModal';

const STORAGE_PREFIX = '4c_';

export default function DataSettings() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useApp();
  const [clearStep, setClearStep] = useState<0 | 1 | 2>(0);

  const handleBackup = () => {
    const data: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        try {
          data[key] = JSON.parse(localStorage.getItem(key) || '');
        } catch {
          data[key] = localStorage.getItem(key);
        }
      }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `4core-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data backed up successfully.', 'success');
  };

  const handleRestore = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        let count = 0;
        for (const [key, value] of Object.entries(data)) {
          if (typeof key === 'string' && key.startsWith(STORAGE_PREFIX)) {
            localStorage.setItem(key, JSON.stringify(value));
            count++;
          }
        }
        showToast(`Restored ${count} data entries. Reloading page...`, 'success');
        setTimeout(() => window.location.reload(), 1500);
      } catch {
        showToast('Invalid backup file format.', 'error');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClearAll = () => {
    setClearStep(1);
  };

  const executeClear = () => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
    showToast('All data cleared. Reloading...', 'info');
    setTimeout(() => window.location.reload(), 1500);
  };

  return (
    <>
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-1">
          <Database className="w-4 h-4 text-accent" /> Data Management
        </h4>
        <p className="text-xs text-text-muted">Export or restore all application data stored in your browser.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={handleBackup}
          className="flex items-center gap-3 p-4 bg-surface rounded-xl border border-border-subtle hover:bg-accent/10 hover:border-accent/20 transition text-left"
        >
          <div className="p-2 bg-primary-light rounded-lg">
            <Download className="w-5 h-5 text-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Download Backup</p>
            <p className="text-[11px] text-text-muted">Save all data (tickets, users, settings) as JSON</p>
          </div>
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-3 p-4 bg-surface rounded-xl border border-border-subtle hover:bg-accent/10 hover:border-accent/20 transition text-left"
        >
          <div className="p-2 bg-warning-light rounded-lg">
            <Upload className="w-5 h-5 text-warning" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Restore from Backup</p>
            <p className="text-[11px] text-text-muted">Upload a previous backup file to restore data</p>
          </div>
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleRestore} />
        </button>
      </div>

      <div className="border-t border-border-subtle pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-error" />
            <span className="text-sm font-semibold text-text-primary">Danger Zone</span>
          </div>
          <button
            onClick={handleClearAll}
            className="px-4 py-2 bg-error-light text-error-dark border border-error/20 rounded-lg text-xs font-bold hover:bg-error/15 transition"
          >
            Clear All Local Data
          </button>
        </div>
        <p className="text-[11px] text-text-muted mt-1">Permanently deletes all locally stored data. Backup first!</p>
      </div>
    </div>
    <ConfirmModal
      isOpen={clearStep === 1}
      onClose={() => setClearStep(0)}
      onConfirm={() => setClearStep(2)}
      title="Clear All Local Data"
      message="This will permanently delete ALL local data. Are you sure?"
      confirmLabel="Yes, Clear Data"
    />
    <ConfirmModal
      isOpen={clearStep === 2}
      onClose={() => setClearStep(0)}
      onConfirm={executeClear}
      title="Final Confirmation"
      message="This cannot be undone. Confirm again to proceed."
      confirmLabel="Yes, Delete Everything"
    />
    </>
  );
}
