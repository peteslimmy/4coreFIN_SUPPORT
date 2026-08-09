import { useEffect, useState } from 'react';
import { usePublicSettings } from './useSettings';

export interface HeroImageData {
  id: string;
  title: string;
  alt_text: string;
  thumbnail_url: string | null;
  mobile_url: string | null;
  desktop_url: string | null;
}

export function useHeroImage(altFallback?: string) {
  const settings = usePublicSettings();
  const orgName = settings['branding.org_name'] || '4CoreFin';
  const legacyHeroImage = settings['branding.hero_image'];

  const [hero, setHero] = useState<HeroImageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/landing-page/images/hero', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setHero(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const desktop = hero?.desktop_url || hero?.thumbnail_url || legacyHeroImage;
  const mobile = hero?.mobile_url || desktop;
  const altText =
    hero?.alt_text || altFallback || `${orgName} — Enterprise Operations & Compliance Platform`;

  return { hero, loading, desktop, mobile, altText };
}
