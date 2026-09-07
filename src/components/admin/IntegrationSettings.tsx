import { useState } from 'react';
import { useSettings } from '../../hooks/useSettings';
import { authorizedFetch } from '../../lib/api';
import { Save, Eye, EyeOff, Send } from 'lucide-react';

const SAVED_RESET_DELAY = 2000;

export default function IntegrationSettings() {
  const { settings, updateSettings } = useSettings();
  const [smtp, setSmtp] = useState({
    host: settings['smtp.host'] || '',
    port: settings['smtp.port'] || '',
    security: settings['smtp.security'] || 'tls',
    username: settings['smtp.username'] || '',
    password: settings['smtp.password'] || '',
    from_email: settings['smtp.from_email'] || '',
    from_name: settings['smtp.from_name'] || '',
    passwordRevealed: false,
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSaveSmtp = async () => {
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(smtp)) {
      if (typeof v !== 'string') continue;
      // Don't send masked values
      if (v.includes('••••')) continue;
      payload[`smtp.${k}`] = v;
    }
    await updateSettings(payload);
    setSaved(true);
    setTimeout(() => setSaved(false), SAVED_RESET_DELAY);
  };

  const handleTestSmtp = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await authorizedFetch('/api/admin/smtp/test', {
        method: 'POST',
      });
      const data = await res.json();
      setTestResult({ ok: res.ok, msg: data.message || data.error });
    } catch (e: unknown) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* SMTP Settings */}
      <div>
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">SMTP Configuration</h4>
        <p className="text-[11px] text-text-muted mb-4">Configure the outgoing email server used for notifications, password resets, and ticket alerts.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="smtp-host" className="text-xs font-medium text-text-secondary block mb-1">Host</label>
            <p className="text-[11px] text-text-muted mb-1">SMTP server address (e.g. smtp.gmail.com, smtp.sendgrid.net).</p>
            <input id="smtp-host" type="text" value={smtp.host} onChange={(e) => setSmtp(p => ({ ...p, host: e.target.value }))} className="w-full text-xs bg-surface border border-border-subtle rounded-lg px-3 py-2 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none" placeholder="smtp.gmail.com" />
          </div>
          <div>
            <label htmlFor="smtp-port" className="text-xs font-medium text-text-secondary block mb-1">Port</label>
            <p className="text-[11px] text-text-muted mb-1">Common ports: 587 (TLS), 465 (SSL), 25 (unsecured).</p>
            <input id="smtp-port" type="text" value={smtp.port} onChange={(e) => setSmtp(p => ({ ...p, port: e.target.value }))} className="w-full text-xs bg-surface border border-border-subtle rounded-lg px-3 py-2 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none" placeholder="587" />
          </div>
          <div>
            <label htmlFor="smtp-security" className="text-xs font-medium text-text-secondary block mb-1">Security</label>
            <p className="text-[11px] text-text-muted mb-1">TLS recommended for most providers. Use None only for local dev servers.</p>
            <select id="smtp-security" value={smtp.security} onChange={(e) => setSmtp(p => ({ ...p, security: e.target.value }))} className="w-full text-xs bg-surface border border-border-subtle rounded-lg px-3 py-2 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none">
              <option value="tls">TLS</option>
              <option value="ssl">SSL</option>
              <option value="none">None</option>
            </select>
          </div>
<div>
             <label htmlFor="smtp-password" className="text-xs font-medium text-text-secondary block mb-1">Password</label>
             <p className="text-[11px] text-text-muted mb-1">Stored encrypted. Use an app-specific password if 2FA is enabled.</p>
             <div className="flex items-center gap-1">
               <input
                 id="smtp-password"
                 type={smtp.passwordRevealed ? 'text' : 'password'}
                 value={smtp.password}
                 onChange={(e) => setSmtp(p => ({ ...p, password: e.target.value }))}
                 className="flex-1 text-xs bg-surface border border-border-subtle rounded-lg px-3 py-2 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none"
               />
               <button onClick={() => setSmtp(p => ({ ...p, passwordRevealed: !p.passwordRevealed }))} className="p-2 text-text-muted hover:text-text-secondary transition">
                 {smtp.passwordRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
               </button>
             </div>
           </div>
          <div>
            <label htmlFor="smtp-username" className="text-xs font-medium text-text-secondary block mb-1">Username</label>
            <p className="text-[11px] text-text-muted mb-1">Usually your full email address (e.g. you@gmail.com).</p>
            <input id="smtp-username" type="text" value={smtp.username} onChange={(e) => setSmtp(p => ({ ...p, username: e.target.value }))} className="w-full text-xs bg-surface border border-border-subtle rounded-lg px-3 py-2 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none" />
          </div>
          <div>
            <label htmlFor="smtp-from-email" className="text-xs font-medium text-text-secondary block mb-1">From Email</label>
            <p className="text-[11px] text-text-muted mb-1">Sender address shown in the "From" field of outgoing emails.</p>
            <input id="smtp-from-email" type="email" value={smtp.from_email} onChange={(e) => setSmtp(p => ({ ...p, from_email: e.target.value }))} className="w-full text-xs bg-surface border border-border-subtle rounded-lg px-3 py-2 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none" />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="smtp-from-name" className="text-xs font-medium text-text-secondary block mb-1">From Name</label>
            <p className="text-[11px] text-text-muted mb-1">Display name shown alongside the sender email (e.g. "4CoreFin Support").</p>
            <input id="smtp-from-name" type="text" value={smtp.from_name} onChange={(e) => setSmtp(p => ({ ...p, from_name: e.target.value }))} className="w-full max-w-md text-xs bg-surface border border-border-subtle rounded-lg px-3 py-2 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none" />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button onClick={handleSaveSmtp} className="flex items-center gap-2 px-4 py-2 bg-accent text-[#fff] rounded-lg text-xs font-semibold hover:bg-accent-light transition">
            <Save className="w-4 h-4" /> {saved ? 'Saved!' : 'Save SMTP'}
          </button>
          <button onClick={handleTestSmtp} disabled={testing} className="flex items-center gap-2 px-4 py-2 bg-success text-[#fff] rounded-lg text-xs font-semibold hover:bg-success-dark transition disabled:opacity-50">
            <Send className="w-4 h-4" /> {testing ? 'Testing...' : 'Send Test Email'}
          </button>
          {testResult && (
            <span className={`text-xs font-semibold ${testResult.ok ? 'text-success' : 'text-error'}`}>
              {testResult.msg}
            </span>
          )}
        </div>
      </div>

      {/* API Keys Placeholder */}
      <div>
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">API Keys</h4>
        <p className="text-xs text-text-muted bg-surface p-4 rounded-lg border border-border-subtle">
          API key management is available via the backend API. Use <code className="bg-surface-hover px-1 rounded">POST /api/admin/api-keys</code> to create keys, and <code className="bg-surface-hover px-1 rounded">POST /api/admin/api-keys/:id/reveal</code> to reveal masked values.
        </p>
      </div>

      {/* Webhooks Placeholder */}
      <div>
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">Webhooks</h4>
        <p className="text-xs text-text-muted bg-surface p-4 rounded-lg border border-border-subtle">
          Webhook management is available via the backend API. Use <code className="bg-surface-hover px-1 rounded">POST /api/admin/webhooks</code> to create webhooks for events like <code className="bg-surface-hover px-1 rounded">ticket.created</code>, <code className="bg-surface-hover px-1 rounded">sla.breach</code>, etc.
        </p>
      </div>
    </div>
  );
}
