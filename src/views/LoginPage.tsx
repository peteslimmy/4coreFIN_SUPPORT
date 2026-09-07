import { useState, useRef, type FormEvent, type ChangeEvent, type KeyboardEvent, useCallback } from 'react';
import { Lock, Mail, ShieldCheck, AlertCircle, Check, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { usePublicSettings } from '../hooks/useSettings';
import { useHeroImage } from '../hooks/useHeroImage';
import PasswordToggle from '../components/auth/PasswordToggle';
import AuthLogo from '../components/auth/AuthLogo';
import AuthBackground from '../components/auth/AuthBackground';
import PageTransition from '../components/layout/PageTransition';

const HIGHLIGHTS = [
  'Real-time incident ticketing & SLA tracking',
  'Major incident war rooms & partner portal',
  'Full audit trails & executive compliance reporting',
];

export default function LoginPage() {
  const { handleLogin } = useApp();
  const settings = usePublicSettings();
  const orgName = settings['branding.org_name'] || '4CoreFin';
  const { loading: imageLoading, desktop } = useHeroImage();
  const [rememberedEmail, setRememberedEmail] = useLocalStorage('4c_remembered_email', '');
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(Boolean(rememberedEmail));
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [successAnim, setSuccessAnim] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const year = new Date().getFullYear();

  const emailValid = emailTouched && email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const emailInvalid = emailTouched && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const result = await handleLogin(email.trim(), password.trim());
      if (result.ok) {
        setSuccessAnim(true);
        setTimeout(() => {
          setSuccessAnim(false);
        }, 600);
      } else {
        // Show the server's exact reason (invalid credentials, account
        // locked, suspended, network failure) instead of a generic message.
        setError(result.message || 'Invalid email or password.');
      }
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [email, password, handleLogin]);

  const handleEmailChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (error) setError('');
  }, [error]);

  const handlePasswordChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (error) setError('');
  }, [error]);

  const handlePasswordKey = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(e.getModifierState('CapsLock'));
  }, []);

  const handleRememberChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setRememberMe(checked);
    if (!checked) {
      setRememberedEmail('');
    } else if (email.trim()) {
      setRememberedEmail(email.trim());
    }
  }, [email, setRememberedEmail]);

  const handleClearEmail = useCallback(() => {
    setEmail('');
    setEmailTouched(false);
    emailRef.current?.focus();
  }, []);

  return (
    <PageTransition>
      <main className="relative flex min-h-screen overflow-hidden bg-app">
        {/* Skip link */}
        <a href="#login-form" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-[#fff] focus:rounded-lg focus:text-sm focus:font-semibold">
          Skip to login form
        </a>

        {/* Brand panel — visible on md+ */}
        <aside className="relative hidden overflow-hidden p-10 text-[#fff] md:flex md:w-1/2 md:flex-col md:justify-end min-w-0 lg:w-[55%] lg:p-14">
          {/* Background: hero image, falling back to the brand gradient while loading/absent */}
          {imageLoading || !desktop ? (
            <div className="absolute inset-0 bg-gradient-to-br from-accent-dark via-accent to-accent-light" />
          ) : (
            <>
              <img
                src={desktop}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover object-top"
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/35 to-black/55" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
            </>
          )}
          <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-surface-card/10 blur-3xl" aria-hidden="true" />
          <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-surface-card/5 blur-3xl" aria-hidden="true" />

          <div className="relative z-10 mx-auto w-full max-w-[28rem] text-center">
            <p className="mt-3 text-sm text-[#fff]/85 whitespace-nowrap animate-fade-in-stagger">
              Manage incidents, evidence, and compliance from one command center.
            </p>
            <ul className="mt-6 space-y-3">
              {HIGHLIGHTS.map((item, index) => (
                <li key={item} className="flex items-center justify-center gap-2.5 text-sm text-[#fff]/90 animate-fade-in-stagger" style={{ animationDelay: `${150 + index * 100}ms` }}>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-card/15">
                    <Check className="h-3 w-3 text-[#fff]" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <footer className="relative z-10 pt-10 text-center text-xs text-[#fff]/70 animate-fade-in-stagger" style={{ animationDelay: '500ms' }}>
            © {year} {orgName} Support. All rights reserved.
          </footer>
        </aside>

        {/* Form panel */}
        <section className="relative flex flex-1 min-w-0 items-center justify-center p-4 md:p-8" aria-labelledby="login-heading">
          <AuthBackground />

          <div className="relative z-10 w-full max-w-[24rem] animate-fade-in-stagger">
            <AuthLogo />
            <h1 id="login-heading" className="text-center text-display font-bold text-text-primary">Sign in</h1>
            <p className="mt-1 text-center text-body-sm text-text-muted">Welcome back! Please sign in to continue</p>

            <form id="login-form" onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-error/20 bg-error-light px-3 py-2 animate-slide-in" role="alert" aria-live="polite">
                  <AlertCircle className="h-4 w-4 shrink-0 text-error" />
                  <span className="text-caption font-medium text-error">{error}</span>
                </div>
              )}

              {successAnim && (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-success/20 bg-success/10 px-3 py-2 animate-slide-in" role="status">
                  <Check className="h-4 w-4 text-success animate-check-pop" />
                  <span className="text-caption font-medium text-success">Signing in...</span>
                </div>
              )}

              <div className={error ? 'animate-shake' : ''}>
                <label htmlFor="login-email" className="mb-1.5 block text-caption font-medium text-text-secondary">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                  <input
                    id="login-email"
                    ref={emailRef}
                    type="email"
                    value={email}
                    onChange={handleEmailChange}
                    onBlur={() => setEmailTouched(true)}
                    placeholder="you@company.com"
                    autoComplete="email"
                    autoFocus
                    disabled={loading}
                    className={`h-12 w-full rounded-xl border bg-surface pl-11 pr-12 text-sm text-text-primary outline-none transition-all duration-200 placeholder:text-text-muted focus:ring-2 focus:ring-accent/15 focus-ring disabled:cursor-not-allowed disabled:opacity-50 ${
                      emailValid ? 'border-success focus:border-success' : emailInvalid ? 'border-error focus:border-error' : 'border-border focus:border-accent'
                    }`}
                    aria-invalid={emailInvalid ? 'true' : undefined}
                    aria-describedby={emailValid ? 'email-valid' : emailInvalid ? 'email-error' : undefined}
                  />
                  {email && !emailValid && (
                    <button
                      type="button"
                      onClick={handleClearEmail}
                      aria-label="Clear email"
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary focus-ring"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  {emailValid && (
                    <Check className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-success" />
                  )}
                </div>
                {emailInvalid && (
                  <p id="email-error" className="mt-1.5 pl-4 text-xs text-error">Please enter a valid email address.</p>
                )}
                {emailValid && (
                  <p id="email-valid" className="mt-1.5 pl-4 text-xs text-success">Email looks good.</p>
                )}
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="login-password" className="text-caption font-medium text-text-secondary">
                    Password
                  </label>
                  <a href="/auth/forgot-password" className="text-caption font-medium text-accent transition hover:text-accent-light">
                    Forgot password?
                  </a>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                  <input
                    id="login-password"
                    type={passwordVisible ? 'text' : 'password'}
                    value={password}
                    onChange={handlePasswordChange}
                    onKeyDown={handlePasswordKey}
                    onKeyUp={handlePasswordKey}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    disabled={loading}
                    className={`h-12 w-full rounded-xl border bg-surface pl-11 pr-12 text-sm text-text-primary outline-none transition-all duration-200 placeholder:text-text-muted focus:ring-2 focus:ring-accent/15 focus-ring disabled:cursor-not-allowed disabled:opacity-50 ${
                      password ? 'border-accent focus:border-accent' : 'border-border focus:border-accent'
                    }`}
                  />
                  <PasswordToggle visible={passwordVisible} onToggle={() => setPasswordVisible(v => !v)} />
                </div>
                {capsLock && (
                  <p className="mt-1.5 flex items-center gap-1.5 pl-4 text-caption font-medium text-warning">
                    <AlertCircle className="h-3 w-3" /> Caps Lock is on
                  </p>
                )}
              </div>

              <div className="flex items-center gap-4 py-1">
                <div className="h-px flex-1 bg-border" aria-hidden="true" />
                <span className="text-overline">Secure access</span>
                <div className="h-px flex-1 bg-border" aria-hidden="true" />
              </div>

              <label htmlFor="login-remember" className="flex cursor-pointer select-none items-center gap-2.5">
                <span className="relative inline-flex h-4 w-4 shrink-0">
                  <input
                    id="login-remember"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={handleRememberChange}
                    disabled={loading}
                    className="peer h-4 w-4 cursor-pointer appearance-none rounded border-2 border-border bg-surface-card transition-all duration-150 checked:border-accent checked:bg-accent focus-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <Check className="pointer-events-none absolute inset-0 m-auto h-3 w-3 text-[#fff] opacity-0 transition-opacity duration-150 peer-checked:opacity-100" />
                </span>
                <span className="text-caption font-medium text-text-secondary">Remember me</span>
              </label>

              <button
                type="submit"
                disabled={loading || !email.trim() || !password.trim()}
                className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-light text-sm font-semibold text-[#fff] shadow-card transition-all duration-150 hover:shadow-card-hover hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 border-2 border-[#fff]/30 border-t-[#fff] animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            <div className="mt-6 flex items-center justify-center gap-2 border-t border-border-subtle pt-5 text-caption text-text-muted">
              <Lock className="h-3 w-3" />
              <span>TLS 1.3 Encrypted</span>
              <span className="h-1 w-1 rounded-full bg-text-muted" />
              <ShieldCheck className="h-3 w-3" />
              <span>GAID 2025 Compliant</span>
            </div>
          </div>
        </section>
      </main>
    </PageTransition>
  );
}


