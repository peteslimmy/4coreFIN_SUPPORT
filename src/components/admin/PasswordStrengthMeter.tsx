import { useMemo } from 'react';
import { Check, X } from 'lucide-react';

interface PasswordStrengthMeterProps {
  password: string;
  minLength?: number;
}

interface Criterion {
  label: string;
  test: (pw: string) => boolean;
}

export default function PasswordStrengthMeter({ password, minLength = 8 }: PasswordStrengthMeterProps) {
  const criteria: Criterion[] = useMemo(() => [
    { label: `${minLength}+ characters`, test: (pw) => pw.length >= minLength },
    { label: 'Uppercase & lowercase', test: (pw) => /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
    { label: 'At least one number', test: (pw) => /[0-9]/.test(pw) },
    { label: 'Special character (!@#$%^&*)', test: (pw) => /[!@#$%^&*(),.?":{}|<>]/.test(pw) },
  ], [minLength]);

  const results = criteria.map((c) => ({ ...c, passed: c.test(password) }));
  const passedCount = results.filter((r) => r.passed).length;
  const strength = password.length === 0 ? 0 : (passedCount / criteria.length) * 100;

  const colorMap: Record<number, string> = {
    0: 'bg-border-subtle',
    25: 'bg-error',
    50: 'bg-warning',
    75: 'bg-warning',
    100: 'bg-success',
  };

  const closestThreshold = [0, 25, 50, 75, 100].reduce((prev, curr) =>
    Math.abs(curr - strength) < Math.abs(prev - strength) ? curr : prev
  );

  if (!password) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-surface-hover rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${colorMap[closestThreshold]}`}
            style={{ width: `${strength}%` }}
          />
        </div>
        <span className="text-[10px] font-bold text-text-muted w-8 text-right">{Math.round(strength)}%</span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {results.map((r) => (
          <div key={r.label} className="flex items-center gap-1.5">
            {r.passed ? (
              <Check className="w-3 h-3 text-success" />
            ) : (
              <X className="w-3 h-3 text-text-muted" />
            )}
            <span className={`text-[10px] ${r.passed ? 'text-success font-medium' : 'text-text-muted'}`}>
              {r.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}


