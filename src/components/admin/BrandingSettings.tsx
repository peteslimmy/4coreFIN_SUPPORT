import { useState } from 'react';
import { useSettings } from '../../hooks/useSettings';
import { authorizedFetch } from '../../lib/api';
import FileUpload from '../ui/FileUpload';
import { Save } from 'lucide-react';

export default function BrandingSettings() {
  const { settings, updateSetting } = useSettings();
  const [orgName, setOrgName] = useState(settings['branding.org_name'] || '4CoreFin');
  const [saved, setSaved] = useState(false);
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>('light');

  const handleUpload = (folder: string, settingKey?: string) => async (files: File[]): Promise<(string | null)[]> => {
    const results: (string | null)[] = [];
    for (const file of files) {
      if (folder === 'landing_page') {
        // Use the dedicated landing page image upload system instead of generic branding upload
        const formData = new FormData();
        formData.append('image', file);
        formData.append('status', 'published');
        formData.append('title', 'Landing Page Hero');
        formData.append('alt_text', 'Enterprise Operations & Compliance Platform');

        const res = await authorizedFetch('/api/landing-page/images', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          results.push(data.desktop_url || data.storage_path);
        } else {
          results.push(null);
        }
      } else {
        const res = await authorizedFetch('/api/admin/branding/upload', {
          method: 'POST',
          headers: {
            'Content-Type': file.type,
            'X-Filename': file.name,
            'X-Folder': folder,
            ...(settingKey ? { 'X-Setting-Key': settingKey } : {}),
          },
          body: file,
        });
        const data = await res.json();
        if (res.ok && data.path) {
          if (settingKey) {
            const persisted = await updateSetting(settingKey, data.path);
            if (!persisted) {
              throw new Error(`Upload succeeded but saving "${settingKey}" failed. Check server logs.`);
            }
          }
          results.push(`/api/public/branding/${settingKey?.split('.').pop()}`);
        } else {
          results.push(null);
        }
      }
    }
    return results;
  };

  const handleSave = async () => {
    await updateSetting('branding.org_name', orgName);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const logoLight = settings['branding.logo_light'];
  const logoDark = settings['branding.logo_dark'];

  return (
    <div className="space-y-6">
      {/* Organization Name */}
      <div>
        <label className="text-xs font-medium text-text-secondary block mb-1">Organization Name</label>
        <input
          type="text"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          className="w-full max-w-md text-sm bg-surface-elevated border border-border-subtle rounded-lg px-3 py-2 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none"
        />
      </div>

      {/* Logo Uploads */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FileUpload
          label="Logo (Light Mode)"
          accept="image/png,image/svg+xml,image/webp"
          maxSize={2 * 1024 * 1024}
          currentUrls={logoLight ? ['/api/public/branding/logo_light'] : []}
          onUpload={handleUpload('branding', 'branding.logo_light')}
        />
        <FileUpload
          label="Logo (Dark Mode)"
          accept="image/png,image/svg+xml,image/webp"
          maxSize={2 * 1024 * 1024}
          currentUrls={logoDark ? ['/api/public/branding/logo_dark'] : []}
          onUpload={handleUpload('branding', 'branding.logo_dark')}
        />
      </div>

      {/* Favicon */}
      <FileUpload
        label="Favicon"
        accept="image/png,image/x-icon,image/svg+xml"
        maxSize={500 * 1024}
        currentUrls={settings['branding.favicon'] ? ['/api/public/branding/favicon'] : []}
        onUpload={handleUpload('branding', 'branding.favicon')}
        className="max-w-sm"
      />

      {/* Hero Image */}
      <FileUpload
        label="Landing Page Hero Image"
        accept="image/png,image/jpeg,image/webp"
        maxSize={5 * 1024 * 1024}
        currentUrls={settings['branding.hero_image'] ? [settings['branding.hero_image']] : []}
        onUpload={handleUpload('landing_page')}
        className="max-w-lg"
      />

      {/* Live Preview */}
      <div className="border border-border-subtle rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-border-subtle">
          <span className="text-xs font-semibold text-text-secondary">Live Preview</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPreviewMode('light')}
              className={`px-3 py-1 text-xs rounded transition ${previewMode === 'light' ? 'bg-surface-elevated shadow-sm text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
            >
              Light
            </button>
            <button
              onClick={() => setPreviewMode('dark')}
              className={`px-3 py-1 text-xs rounded transition ${previewMode === 'dark' ? 'bg-surface-card text-white' : 'text-text-muted hover:text-text-primary'}`}
            >
              Dark
            </button>
          </div>
        </div>
        <div className={`p-6 ${previewMode === 'dark' ? 'bg-surface-elevated' : 'bg-surface-elevated'}`}>
          <div className={`flex items-center gap-3 p-3 rounded-lg ${previewMode === 'dark' ? 'bg-surface-card' : 'bg-surface border border-border-subtle'}`}>
            {(previewMode === 'dark' ? (logoDark || logoLight) : logoLight) ? (
              <img
                src={previewMode === 'dark'
                  ? (logoDark ? '/api/public/branding/logo_dark' : '/api/public/branding/logo_light')
                  : '/api/public/branding/logo_light'}
                alt="Logo preview"
                className="max-h-10 w-auto object-contain"
              />
            ) : (
              <span className={`text-lg font-bold ${previewMode === 'dark' ? 'text-white' : 'text-text-primary'}`}>
                {orgName}
              </span>
            )}
            <span className={`text-xs ${previewMode === 'dark' ? 'text-text-muted' : 'text-text-muted'}`}>
              ← Your logo appears here
            </span>
          </div>
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-xs font-semibold hover:bg-accent-light transition"
      >
        <Save className="w-4 h-4" />
        {saved ? 'Saved!' : 'Save Branding'}
      </button>
    </div>
  );
}
