import { useState, useRef, type FormEvent, type ChangeEvent, type KeyboardEvent, useCallback } from 'react';
import { Lock, Mail, Shield, ShieldCheck, AlertCircle, Check, X } from 'lucide-react';
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
  'Major incident war rooms & provider portal',
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
      const success = await handleLogin(email.trim(), password.trim());
      if (success) {
        setSuccessAnim(true);
        setTimeout(() => {
          setSuccessAnim(false);
        }, 600);
      } else {
        setError('Invalid email or password.');
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
      <div className="relative flex min-h-screen overflow-hidden bg-app">
        {/* Brand panel — visible on md+ */}
        <aside className="relative hidden overflow-hidden p-10 text-white md:flex md:w-1/2 md:flex-col md:justify-between lg:w-[55%] lg:p-14">
          {/* Background: hero image, falling back to the brand gradient while loading/absent */}
          {imageLoading || !desktop ? (
            <div className="absolute inset-0 bg-gradient-to-br from-accent-dark via-accent to-accent-light" />
          ) : (
            <>
              <img
                src={desktop}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover"
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/45 to-black/65" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            </>
          )}
          <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
          <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-white/5 blur-3xl" aria-hidden="true" />

          <header className="relative z-10 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/25 bg-white/15 backdrop-blur-sm">
              <Shield className="h-5 w-5 text-white" />
            </span>
            <span className="text-lg font-bold tracking-tight">{orgName} Support</span>
          </header>

          <div className="relative z-10 mx-auto max-w-md text-center">
            <p className="text-caption font-semibold uppercase tracking-widest text-white/80">
              FinTech Incident Control &amp; Payment Operations Intelligence
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight lg:text-4xl">{orgName} Operations Hub</h2>
            <p className="mt-3 text-sm text-white/85">
              Manage incidents, evidence, and compliance from one command center.
            </p>
            <ul className="mt-6 space-y-3">
              {HIGHLIGHTS.map((item) => (
                <li key={item} className="flex items-center justify-center gap-2.5 text-sm text-white/90">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15">
                    <Check className="h-3 w-3 text-white" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <footer className="relative z-10 text-center text-xs text-white/70">
            © {year} {orgName} Support. All rights reserved.
          </footer>
        </aside>

        {/* Form panel */}
        <main className="relative flex flex-1 items-center justify-center p-4 md:p-8">
          <AuthBackground />

          <div className="relative z-10 w-full max-w-sm">
            <AuthLogo />
            <h1 className="text-center text-display font-bold text-text-primary">Sign in</h1>
            <p className="mt-1 text-center text-body-sm text-text-muted">Welcome back! Please sign in to continue</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
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
                    className={`h-12 w-full rounded-full border bg-surface pl-11 pr-12 text-sm text-text-primary outline-none transition-all duration-200 placeholder:text-text-muted focus:ring-2 focus:ring-accent/15 focus-ring disabled:cursor-not-allowed disabled:opacity-50 ${
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
                    className={`h-12 w-full rounded-full border bg-surface pl-11 pr-12 text-sm text-text-primary outline-none transition-all duration-200 placeholder:text-text-muted focus:ring-2 focus:ring-accent/15 focus-ring disabled:cursor-not-allowed disabled:opacity-50 ${
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
                  <Check className="pointer-events-none absolute inset-0 m-auto h-3 w-3 text-white opacity-0 transition-opacity duration-150 peer-checked:opacity-100" />
                </span>
                <span className="text-caption font-medium text-text-secondary">Remember me</span>
              </label>

              <button
                type="submit"
                disabled={loading || !email.trim() || !password.trim()}
                className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-gradient-to-r from-accent to-accent-light text-sm font-semibold text-white shadow-card transition-all duration-150 hover:shadow-card-hover hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white animate-spin" />
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
        </main>
      </div>
    </PageTransition>
  );
}
