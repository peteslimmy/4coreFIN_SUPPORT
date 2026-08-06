import { useState, type FormEvent } from 'react';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import AuthLogo from '../components/auth/AuthLogo';
import PageTransition from '../components/layout/PageTransition';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Please enter your email.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setSent(true);
      } else {
        setError(data.error || 'Failed to send reset email');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageTransition>
    <div className="min-h-screen bg-app flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <AuthLogo />
          <h1 className="text-display font-bold text-text-primary">Reset password</h1>
          <p className="text-body-sm text-text-muted mt-1">We'll send you a recovery link</p>
        </div>

        <div className="bg-surface-card border border-border-subtle rounded-xl p-5 shadow-card">
          {sent ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-success/15 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-6 h-6 text-success" />
              </div>
              <h3 className="text-h3 text-text-primary font-semibold mb-1">Check your inbox</h3>
              <p className="text-body text-text-muted">Recovery link sent to <strong className="text-text-primary">{email}</strong></p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="text-caption text-error bg-error-light border border-error/20 rounded-lg px-3 py-2">{error}</div>
              )}
              <div>
                <label className="block text-caption font-medium text-text-secondary mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all focus-ring"
                  />
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-accent hover:bg-accent-light text-white font-semibold py-2.5 rounded-lg transition-all duration-150 text-sm cursor-pointer disabled:opacity-50">
                {loading ? 'Sending...' : 'Send recovery link'}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <a href="/auth/login" className="inline-flex items-center gap-1.5 text-caption text-accent hover:text-accent-light font-medium transition">
              <ArrowLeft className="w-3 h-3" /> Back to sign in
            </a>
          </div>
        </div>
      </div>
    </div>
    </PageTransition>
  );
}
