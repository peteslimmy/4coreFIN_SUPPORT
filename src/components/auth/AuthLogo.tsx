import { Shield } from 'lucide-react';
import BrandLogo from '../BrandLogo';

export default function AuthLogo() {
  return (
    <div className="flex items-center justify-center mb-6">
      <BrandLogo
        imgClassName="max-h-12 w-auto object-contain"
        fallback={
          <div className="w-12 h-12 bg-accent rounded-2xl flex items-center justify-center shadow-3 border border-accent/20">
            <Shield className="w-6 h-6 text-white" />
          </div>
        }
      />
    </div>
  );
}
