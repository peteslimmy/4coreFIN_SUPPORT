import { useState, type FormEvent } from 'react';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import AuthLogo from '../components/auth/AuthLogo';
import AuthBackground from '../components/auth/AuthBackground';
import PageTransition from '../components/layout/PageTransition';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);

  const emailValid = emailTouched && email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const emailInvalid = emailTouched && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Please enter your email.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
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

  const handleClearEmail = () => {
    setEmail('');
    setEmailTouched(false);
  };

  return (
    <PageTransition>
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
        <a href="#forgot-form" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-[#fff] focus:rounded-lg focus:text-sm focus:font-semibold">
          Skip to form
        </a>
        <AuthBackground />
        <div className="relative z-10 w-full max-w-sm animate-fade-in-stagger">
          <div className="mb-6 text-center">
            <AuthLogo />
            <h1 id="forgot-heading" className="text-display font-bold text-text-primary">Reset password</h1>
            <p className="mt-1 text-body-sm text-text-muted">We'll send you a recovery link</p>
          </div>

          <div className="animate-slide-up">
            <div className="relative overflow-hidden rounded-2xl border border-border-subtle bg-surface-card p-6 shadow-card md:p-7">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent via-accent-light to-accent" aria-hidden="true" />
              {sent ? (
                <div className="text-center py-4 animate-fade-in-stagger">
                  <div className="w-12 h-12 bg-success/15 rounded-full flex items-center justify-center mx-auto mb-4 animate-check-pop">
                    <CheckCircle className="w-6 h-6 text-success" />
                  </div>
                  <h3 className="text-h3 text-text-primary font-semibold mb-1">Check your inbox</h3>
                  <p className="text-body text-text-muted">Recovery link sent to <strong className="text-text-primary">{email}</strong></p>
                </div>
              ) : (
                <form id="forgot-form" aria-labelledby="forgot-heading" onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div className="flex items-center gap-2 rounded-xl border border-error/20 bg-error-light px-3 py-2 animate-slide-in text-caption text-error" role="alert">
                      <CheckCircle className="h-4 w-4 shrink-0 text-error" />
                      <span>{error}</span>
                    </div>
                  )}
                  <div className={error ? 'animate-shake' : ''}>
                    <label className="block text-caption font-medium text-text-secondary mb-1">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onBlur={() => setEmailTouched(true)}
                        placeholder="you@company.com"
                        className={`w-full bg-surface border rounded-xl pl-9 pr-10 py-3 text-sm text-text-primary placeholder:text-text-muted focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all focus-ring ${
                          emailValid ? 'border-success focus:border-success' : emailInvalid ? 'border-error focus:border-error' : 'border-border'
                        }`}
                        aria-invalid={emailInvalid ? 'true' : undefined}
                      />
                      {email && !emailValid && (
                        <button
                          type="button"
                          onClick={handleClearEmail}
                          aria-label="Clear email"
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary focus-ring"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                      {emailValid && (
                        <CheckCircle className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />
                      )}
                    </div>
                    {emailInvalid && (
                      <p className="mt-1.5 pl-1 text-xs text-error">Please enter a valid email address.</p>
                    )}
                    {emailValid && (
                      <p className="mt-1.5 pl-1 text-xs text-success">Email looks good.</p>
                    )}
                  </div>
                  <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-accent to-accent-light text-[#fff] font-semibold py-3 rounded-xl transition-all duration-150 text-sm cursor-pointer disabled:opacity-50 hover:brightness-110 active:scale-[0.99] shadow-card hover:shadow-card-hover">
                    {loading ? 'Sending...' : 'Send recovery link'}
                  </button>
                </form>
              )}

              <div className="mt-6 text-center animate-fade-in-stagger" style={{ animationDelay: '200ms' }}>
                <a href="/auth/login" className="inline-flex items-center gap-1.5 text-caption text-accent hover:text-accent-light font-medium transition">
                  <ArrowLeft className="w-3 h-3" /> Back to sign in
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
