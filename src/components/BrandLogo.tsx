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

  return (
    <img
      src={`/api/public/branding/${show === 'logo_dark' ? 'logo_dark' : 'logo_light'}`}
      alt={settings['branding.org_name'] || '4CoreFin'}
      className={imgClassName}
    />
  );
}
