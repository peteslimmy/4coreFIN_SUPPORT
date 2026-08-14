import { useEffect, useState, type ReactNode } from 'react';
import { usePublicSettings } from '../hooks/useSettings';

interface BrandLogoProps {
  imgClassName?: string;
  fallback?: ReactNode;
}

export default function BrandLogo({ imgClassName, fallback }: BrandLogoProps) {
  const settings = usePublicSettings();
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  );

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains('dark'));
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const lightSet = Boolean(settings['branding.logo_light']);
  const darkSet = Boolean(settings['branding.logo_dark']);
  const useDark = isDark && darkSet;
  const show = useDark ? 'logo_dark' : lightSet ? 'logo_light' : null;

  if (!show) return <>{fallback ?? null}</>;

  // Get logo size from settings (default 32px)
  const logoSize = Number(settings['branding.logo_size']) || 32;

  // Add cache-busting timestamp to prevent browser caching issues
  const getBrandingUrl = (path: string): string => {
    const timestamp = new Date().getTime();
    return `/api/public/branding/${path}?v=${timestamp}`;
  };

  return (
    <img
      src={getBrandingUrl(show === 'logo_dark' ? 'logo_dark' : 'logo_light')}
      alt={settings['branding.org_name'] || '4CoreFin'}
      className={`object-contain ${imgClassName ?? ''}`}
      style={
        imgClassName
          ? undefined
          : { maxHeight: `${logoSize}px`, height: 'auto', width: 'auto' }
      }
    />
  );
}
