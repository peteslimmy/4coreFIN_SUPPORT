import { usePublicSettings } from '../../hooks/useSettings';
import { Shield } from 'lucide-react';

export default function AuthLogo() {
  const settings = usePublicSettings();
  const logo = settings['branding.logo_light'];
  const orgName = settings['branding.org_name'] || '4CoreFin';

  if (logo) {
    return (
      <div className="flex items-center justify-center mb-6">
        <img src={logo} alt={`${orgName} logo`} className="max-h-12 w-auto object-contain" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center mb-6">
      <div className="w-12 h-12 bg-accent rounded-2xl flex items-center justify-center shadow-3 border border-accent/20">
        <Shield className="w-6 h-6 text-white" />
      </div>
    </div>
  );
}
