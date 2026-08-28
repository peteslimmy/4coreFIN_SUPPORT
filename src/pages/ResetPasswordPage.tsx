import { useState, type FormEvent } from 'react';
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import AuthLogo from '../components/auth/AuthLogo';
import AuthBackground from '../components/auth/AuthBackground';
import PasswordStrengthMeter from '../components/admin/PasswordStrengthMeter';
import { isPasswordValid } from '../components/admin/passwordStrength';
import PageTransition from '../components/layout/PageTransition';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Supabase recovery links deliver the access token in the URL hash fragment
  // (e.g. /auth/reset-password#access_token=...&type=recovery).
  const raw = window.location.hash || window.location.search || '';
  const params = new URLSearchParams(raw.startsWith('#') || raw.startsWith('?') ? raw.slice(1) : raw);
  const token = params.get('token') || params.get('access_token') || '';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid(password)) { setError('Password does not meet strength requirements'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (!token) { setError('Invalid or missing reset token'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
      } else {
        setError(data.error || 'Failed to reset password');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageTransition>
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <a href="#reset-form" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-[#fff] focus:rounded-lg focus:text-sm focus:font-semibold">
        Skip to form
      </a>
      <AuthBackground />
      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 text-center">
          <AuthLogo />
          <h1 id="reset-heading" className="text-display font-bold text-text-primary">Set new password</h1>
          <p className="mt-1 text-body-sm text-text-muted">Choose a strong password for your account</p>
        </div>

        <div className="animate-slide-up">
        <div className="relative overflow-hidden rounded-2xl border border-border-subtle bg-surface-card p-6 shadow-card md:p-7">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent via-accent-light to-accent" aria-hidden="true" />
          {success ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-success/15 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-6 h-6 text-success" />
              </div>
              <h3 className="text-h3 text-text-primary font-semibold mb-1">Password reset successful</h3>
              <p className="text-body text-text-muted mb-6">Your password has been updated.</p>
              <a href="/auth/login" className="text-sm text-accent hover:text-accent-light font-semibold transition">Sign in with new password</a>
            </div>
          ) : (
            <form id="reset-form" aria-labelledby="reset-heading" onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-caption font-medium text-text-secondary mb-1">New password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg pl-9 pr-10 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all focus-ring"
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <PasswordStrengthMeter password={password} />
              </div>
              <div>
                <label className="block text-caption font-medium text-text-secondary mb-1">Confirm password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all focus-ring"
                    required
                  />
                </div>
              </div>
              {error && <p className="text-caption text-error">{error}</p>}
              <button
                type="submit"
                disabled={loading || !isPasswordValid(password) || password !== confirm}
                className="w-full bg-accent hover:bg-accent-light text-[#fff] font-semibold py-2.5 rounded-lg transition-all duration-150 text-sm cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          )}
        </div>
        </div>
      </div>
    </div>
    </PageTransition>
  );
}
