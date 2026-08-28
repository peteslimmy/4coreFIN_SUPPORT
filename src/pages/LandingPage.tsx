import { Shield, ArrowRight } from 'lucide-react';
import { usePublicSettings } from '../hooks/useSettings';
import { useHeroImage } from '../hooks/useHeroImage';

export default function LandingPage() {
  const settings = usePublicSettings();
  const orgName = settings['branding.org_name'] || '4CoreFin';
  const { loading, desktop, mobile, altText } = useHeroImage();
  const year = new Date().getFullYear();

  return (
    <div className="relative min-h-screen overflow-hidden bg-app text-[#fff]">
      {/* Full-bleed background image (responsive desktop/mobile variants) */}
      <div className="absolute inset-0">
        {!loading && desktop ? (
          <>
            <img
              src={mobile || desktop}
              alt={altText}
              className="absolute inset-0 h-full w-full object-cover md:hidden"
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
            <img
              src={desktop}
              alt={altText}
              className="absolute inset-0 hidden h-full w-full object-cover md:block"
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-accent to-accent-light" />
        )}
        {/* Directional scrim: darkens text zones, keeps the image clearly visible */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/15 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex min-h-screen flex-col justify-between p-6 md:p-10">
        <header className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#fff]/25 bg-[#fff]/15 backdrop-blur-sm">
              <Shield className="h-5 w-5 text-[#fff]" />
            </span>
            <span className="text-lg font-bold tracking-tight text-[#fff]">{orgName}</span>
          </div>
          <a
            href="/auth/login"
            className="rounded-full border border-[#fff]/25 bg-[#000]/25 px-4 py-2 text-sm font-semibold text-[#fff] backdrop-blur-sm transition hover:bg-[#000]/40"
          >
            Sign in
          </a>
        </header>

        <main className="max-w-3xl">
          <p className="mb-4 text-caption font-semibold uppercase tracking-widest text-[#fff]/80">
            Payment Incident &amp; Operation Centre
          </p>
          <h1 className="text-3xl font-bold leading-tight text-[#fff] drop-shadow-lg sm:text-4xl md:text-6xl">
            {orgName}
          </h1>
          <h2 className="mt-2 text-xl font-semibold text-[#fff]/90 sm:text-2xl md:text-3xl">
            Incident Control &amp; Compliance Hub
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#fff]/85 sm:text-base md:text-lg">
            Declare, track, and resolve payment operations incidents — with full audit trails, major
            incident war rooms, and executive compliance reporting.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <a
              href="/auth/login"
              className="inline-flex items-center gap-2 rounded-lg bg-[#fff] px-6 py-3 text-sm font-semibold text-text-primary shadow-lg transition-all duration-150 hover:bg-[#fff]/90"
            >
              Sign In <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="/auth/forgot-password"
              className="inline-flex items-center gap-2 rounded-lg border border-[#fff]/30 bg-[#fff]/10 px-6 py-3 text-sm font-semibold text-[#fff] backdrop-blur-sm transition-all duration-150 hover:bg-[#fff]/20"
            >
              Forgot password?
            </a>
          </div>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#fff]/70">
          <span>
            © {year} {orgName} Support. All rights reserved.
          </span>
          <div className="flex items-center gap-4">
            <a href="/privacy-policy" className="transition hover:text-[#fff]">
              Privacy Policy
            </a>
            <span className="text-[#fff]/40">·</span>
            <span>Terms of Service</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
