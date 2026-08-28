import { useState, useCallback, ChangeEvent } from 'react';
import { useSettings } from '../../hooks/useSettings';
import { authorizedFetch } from '../../lib/api';
import FileUpload from '../ui/FileUpload';
import { Save, RefreshCw } from 'lucide-react';

const SUCCESS_RESET_DELAY = 3000;
const ERROR_RESET_DELAY = 5000;
const SAVED_RESET_DELAY = 2000;
const DEFAULT_ORG_NAME = '4CoreFin';

export default function BrandingSettings() {
  const { settings, updateSetting, refresh } = useSettings();
  const [orgName, setOrgName] = useState(settings['branding.org_name'] || DEFAULT_ORG_NAME);
  const [saved, setSaved] = useState(false);
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>('light');
  const [uploadStatus, setUploadStatus] = useState<{
    logoLight: 'idle' | 'loading' | 'success' | 'error';
    logoDark: 'idle' | 'loading' | 'success' | 'error';
    favicon: 'idle' | 'loading' | 'success' | 'error';
  }>({
    logoLight: 'idle',
    logoDark: 'idle',
    favicon: 'idle',
  });
  const [logoSize, setLogoSize] = useState(Number(settings['branding.logo_size']) || 32);

  const handleUpload = useCallback(
    (folder: string, settingKey?: string) => async (files: File[]): Promise<(string | null)[]> => {
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
          // Set uploading state
          setUploadStatus(prev => {
            const key = settingKey?.split('.').pop() as keyof typeof uploadStatus || 'logoLight';
            return { ...prev, [key]: 'loading' };
          });

          try {
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
                // Update status to success
                setUploadStatus(prev => {
                  const key = settingKey?.split('.').pop() as keyof typeof uploadStatus;
                  return { ...prev, [key]: 'success' };
                });
                // Reset status after 3 seconds
                setTimeout(() => {
                  setUploadStatus(prev => {
                    const key = settingKey?.split('.').pop() as keyof typeof uploadStatus;
                    return { ...prev, [key]: 'idle' };
                  });
                }, SUCCESS_RESET_DELAY);
              }
              results.push(`/api/public/branding/${settingKey?.split('.').pop()}`);
            } else {
              // Set error status
              setUploadStatus(prev => {
                const key = settingKey?.split('.').pop() as keyof typeof uploadStatus;
                return { ...prev, [key]: 'error' };
              });
              // Reset status after 5 seconds
setTimeout(() => {
                  setUploadStatus(prev => {
                    const key = settingKey?.split('.').pop() as keyof typeof uploadStatus;
                    return { ...prev, [key]: 'idle' };
                  });
                }, ERROR_RESET_DELAY);
              results.push(null);
            }
          } catch {
            // Set error status
            setUploadStatus(prev => {
              const key = settingKey?.split('.').pop() as keyof typeof uploadStatus;
              return { ...prev, [key]: 'error' };
            });
            // Reset status after 5 seconds
            setTimeout(() => {
              setUploadStatus(prev => {
                const key = settingKey?.split('.').pop() as keyof typeof uploadStatus;
                return { ...prev, [key]: 'idle' };
              });
            }, 5000);
            results.push(null);
          }
        }
      }
      return results;
    },
    [updateSetting]
  );

  const handleSave = async () => {
    await updateSetting('branding.org_name', orgName);
    setSaved(true);
    setTimeout(() => setSaved(false), SAVED_RESET_DELAY);
  };

  const handleLogoSizeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setLogoSize(value);
    updateSetting('branding.logo_size', String(value));
  };

  const handleRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const logoLight = settings['branding.logo_light'];
  const logoDark = settings['branding.logo_dark'];

  // Add cache-busting timestamp to URLs
  const getLogoUrl = (logoPath: string | null): string => {
    if (!logoPath) return '';
    // Add timestamp to prevent browser caching
    const timestamp = new Date().getTime();
    return `${logoPath}?v=${timestamp}`;
  };

  return (
    <div className="space-y-6">
      {/* Organization Name */}
      <div>
        <label htmlFor="org-name" className="text-xs font-medium text-text-secondary block mb-1">Organization Name</label>
        <input
          id="org-name"
          type="text"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          className="w-full max-w-md text-sm bg-surface-elevated border border-border-subtle rounded-lg px-3 py-2 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none"
        />
      </div>

      {/* Logo Uploads */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <FileUpload
            label="Logo (Light Mode)"
            accept="image/png,image/svg+xml,image/webp"
            maxSize={2 * 1024 * 1024}
            currentUrls={logoLight ? ['/api/public/branding/logo_light'] : []}
            onUpload={handleUpload('branding', 'branding.logo_light')}
          />
          <div className="flex items-center justify-between px-3">
            <span className="text-xs text-text-muted">
              {uploadStatus.logoLight === 'loading' && 'Uploading...'}
              {uploadStatus.logoLight === 'success' && 'Uploaded!'}
              {uploadStatus.logoLight === 'error' && 'Upload failed'}
            </span>
            <button
              onClick={handleRefresh}
              className="text-xs text-accent hover:text-accent-light hover:underline"
              title="Refresh branding settings"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="space-y-4">
          <FileUpload
            label="Logo (Dark Mode)"
            accept="image/png,image/svg+xml,image/webp"
            maxSize={2 * 1024 * 1024}
            currentUrls={logoDark ? ['/api/public/branding/logo_dark'] : []}
            onUpload={handleUpload('branding', 'branding.logo_dark')}
          />
          <div className="flex items-center justify-between px-3">
            <span className="text-xs text-text-muted">
              {uploadStatus.logoDark === 'loading' && 'Uploading...'}
              {uploadStatus.logoDark === 'success' && 'Uploaded!'}
              {uploadStatus.logoDark === 'error' && 'Upload failed'}
            </span>
            <button
              onClick={handleRefresh}
              className="text-xs text-accent hover:text-accent-light hover:underline"
              title="Refresh branding settings"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Logo Size Control */}
      <div className="space-y-4">
        <label htmlFor="logo-size" className="text-xs font-medium text-text-secondary block mb-1">
          Logo Size
        </label>
        <div className="flex items-center space-x-3">
          <input
            id="logo-size"
            type="range"
            min={16}
            max={128}
            step={2}
            value={logoSize}
            onChange={handleLogoSizeChange}
            className="flex-1 h-1"
          />
          <span className="text-xs font-mono text-text-secondary">{logoSize}px</span>
        </div>
      </div>

      {/* Favicon */}
      <div className="space-y-4">
        <FileUpload
          label="Favicon"
          accept="image/png,image/x-icon,image/svg+xml"
          maxSize={500 * 1024}
          currentUrls={settings['branding.favicon'] ? ['/api/public/branding/favicon'] : []}
          onUpload={handleUpload('branding', 'branding.favicon')}
          className="max-w-sm"
        />
        <div className="flex items-center justify-between px-3">
          <span className="text-xs text-text-muted">
            {uploadStatus.favicon === 'loading' && 'Uploading...'}
            {uploadStatus.favicon === 'success' && 'Uploaded!'}
            {uploadStatus.favicon === 'error' && 'Upload failed'}
          </span>
          <button
            onClick={handleRefresh}
            className="text-xs text-accent hover:text-accent-light hover:underline"
            title="Refresh branding settings"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

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
              className={`px-3 py-1 text-xs rounded transition ${previewMode === 'dark' ? 'bg-surface-card text-[#fff]' : 'text-text-muted hover:text-text-primary'}`}
            >
              Dark
            </button>
          </div>
        </div>
        <div className={`p-6 ${previewMode === 'dark' ? 'bg-surface-elevated' : 'bg-surface-elevated'}`}>
          <div className={`flex items-center gap-3 p-3 rounded-lg ${previewMode === 'dark' ? 'bg-surface-card' : 'bg-surface border border-border-subtle'}`}>
            {(previewMode === 'dark' ? (logoDark || logoLight) : logoLight) ? (
              <img
                src={getLogoUrl(previewMode === 'dark'
                  ? (logoDark ? '/api/public/branding/logo_dark' : '/api/public/branding/logo_light')
                  : '/api/public/branding/logo_light')}
                alt="Logo preview"
                className="max-h-10 w-auto object-contain"
                style={{ height: 'auto', width: 'auto' }}
              />
            ) : (
              <span className={`text-lg font-bold ${previewMode === 'dark' ? 'text-[#fff]' : 'text-text-primary'}`}>
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
        className="flex items-center gap-2 px-4 py-2 bg-accent text-[#fff] rounded-lg text-xs font-semibold hover:bg-accent-light transition"
      >
        <Save className="w-4 h-4" />
        {saved ? 'Saved!' : 'Save Branding'}
      </button>
    </div>
  );
}
