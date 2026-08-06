import { useState, type FormEvent } from 'react';
import { Shield, Lock, Mail, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import PageTransition from '../components/layout/PageTransition';

export default function LoginPage() {
  const { handleLogin } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const success = await handleLogin(email.trim(), password.trim());
      if (!success) setError('Invalid email or password.');
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageTransition>
    <div className="min-h-screen bg-app flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-surface-card rounded-2xl mb-3 shadow-3 border border-border-subtle">
            <Shield className="w-7 h-7 text-accent" />
          </div>
          <h1 className="text-display font-bold text-text-primary">4CoreFinSupport</h1>
          <p className="text-body-sm text-text-muted mt-1 font-medium">Enterprise Payment Operations</p>
        </div>

        {/* Card */}
        <div className="bg-surface-card border border-border-subtle rounded-xl p-5 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 bg-error-light border border-error/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 text-error shrink-0" />
                <span className="text-caption text-error font-medium">{error}</span>
              </div>
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

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-caption font-medium text-text-secondary">Password</label>
                <a href="/auth/forgot-password" className="text-caption text-accent hover:text-accent-light font-medium transition">
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all focus-ring"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-accent-light text-white font-semibold py-2.5 rounded-lg transition-all duration-150 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="flex items-center gap-2 justify-center mt-6 text-caption text-text-muted">
            <Lock className="w-3 h-3" />
            <span>TLS 1.3 Encrypted</span>
            <span className="w-1 h-1 rounded-full bg-text-muted" />
            <span>GAID 2025 Compliant</span>
          </div>
        </div>
      </div>
    </div>
    </PageTransition>
  );
}
