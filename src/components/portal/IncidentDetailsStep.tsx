import { useApp } from '../../context/AppContext';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { NIGERIAN_BANK_OPTIONS } from '../../lib/formConfigs';

interface IncidentDetailsStepProps {
  partner: string;
  category: string;
  bankName: string;
  onChange: (field: string, value: string) => void;
}

export default function IncidentDetailsStep({ partner, category, bankName, onChange }: IncidentDetailsStepProps) {
  const { currentUser, partners, categories } = useApp();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Input label="Mapped Business Unit (Auto-detected)" value={currentUser.bu} disabled />
      <Select label="Payment Partner" value={partner} onChange={(e) => onChange('partner', e.target.value)} options={partners.map(p => ({ value: p, label: p }))} />
      <Select label="Issue Category" value={category} onChange={(e) => onChange('category', e.target.value)} options={categories.map(c => ({ value: c.name, label: c.name }))} />
      <Select
        label="Bank"
        value={bankName}
        onChange={(e) => onChange('bankName', e.target.value)}
        options={NIGERIAN_BANK_OPTIONS}
        helperText="Choose N/A if no bank is involved, or BANK NOT LISTED if yours is missing."
      />
    </div>
  );
}
