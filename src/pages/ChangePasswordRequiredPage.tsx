import { useState, type FormEvent } from 'react';
import { Shield, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { authorizedFetch } from '../lib/api';
import PasswordStrengthMeter from '../components/admin/PasswordStrengthMeter';
import { isPasswordValid } from '../components/admin/passwordStrength';
import PageTransition from '../components/layout/PageTransition';
import BrandLogo from '../components/BrandLogo';

export default function ChangePasswordRequiredPage() {
  const { setMustChangePassword, showToast } = useApp();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isPasswordValid(newPassword)) {
      setError('Password does not meet strength requirements');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const res = await authorizedFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setMustChangePassword(false);
        showToast('Password changed. Welcome to 4CoreFinSupport.', 'success');
      } else {
        setError(data.error || 'Failed to change password');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageTransition>
    <div className="min-h-screen bg-app flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center mb-3">
            <BrandLogo
              imgClassName="max-h-14 w-auto object-contain"
              fallback={
                <div className="w-14 h-14 bg-surface-card rounded-2xl shadow-3 border border-border-subtle flex items-center justify-center">
                  <Shield className="w-7 h-7 text-accent" />
                </div>
              }
            />
          </div>
          <h1 className="text-display font-bold text-text-primary">Change your password</h1>
          <p className="text-body-sm text-text-muted mt-1 font-medium">A temporary password was emailed to you. Enter it below and create a new one to continue.</p>
        </div>

        <div className="bg-surface-card border border-border-subtle rounded-xl p-5 shadow-card">
          {error && (
            <div className="flex items-center gap-2 bg-error-light border border-error/20 rounded-lg px-3 py-2 mb-4">
              <AlertCircle className="w-4 h-4 text-error shrink-0" />
              <span className="text-caption text-error font-medium">{error}</span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-caption font-medium text-text-secondary mb-1">Current (temporary) password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type={showCurrentPw ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-surface border border-border rounded-lg pl-9 pr-10 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all focus-ring"
                  required
                />
                <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition">
                  {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-caption font-medium text-text-secondary mb-1">New password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type={showNewPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-surface border border-border rounded-lg pl-9 pr-10 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all focus-ring"
                  required
                />
                <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition">
                  {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <PasswordStrengthMeter password={newPassword} />
            </div>

            <div>
              <label className="block text-caption font-medium text-text-secondary mb-1">Confirm new password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type={showNewPw ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all focus-ring"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-accent-light text-white font-semibold py-2.5 rounded-lg transition-all duration-150 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
    </PageTransition>
  );
}
