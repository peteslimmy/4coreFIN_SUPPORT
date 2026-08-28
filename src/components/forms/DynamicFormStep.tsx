import type { FormFieldValue, BuFormConfig, FormFieldDefinition } from '../../types/forms';
import { validateFieldValue, isFieldVisible } from '../../lib/formConfigs';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import { formatCurrencyInput } from '../../lib/currencyFormat';

interface DynamicFormStepProps {
  config: BuFormConfig | { fields: FormFieldDefinition[] };
  values: Record<string, FormFieldValue>;
  errors?: Record<string, string>;
  onChange: (id: string, value: FormFieldValue) => void;
  onValidation?: (errors: Record<string, string>) => void;
  context?: Record<string, FormFieldValue>;
  paymentChannels?: string[];
  optionSources?: Record<string, string[]>;
}

/** Live options for the `channel` field, overriding the stored defaults with the managed payment-channel list. */
function channelOptions(f: BuFormConfig['fields'][number], paymentChannels: string[] | undefined, optionSources: Record<string, string[]> | undefined): string[] {
  const fieldId = f.id;
  if (optionSources && fieldId in optionSources && optionSources[fieldId].length > 0) {
    return optionSources[fieldId];
  }
  if (fieldId === 'channel' && paymentChannels && paymentChannels.length > 0) {
    return paymentChannels;
  }
  return f.options || [];
}

export default function DynamicFormStep({ config, values, errors = {}, onChange, onValidation, context, paymentChannels, optionSources }: DynamicFormStepProps) {
  const allValues = { ...context, ...values };
  const visible = config.fields.filter(f => f.enabled && isFieldVisible(f, allValues));

  const renderField = (id: string, value: FormFieldValue, onChangeField: (v: FormFieldValue) => void, error?: string, disabled?: boolean) => {
    const f = config.fields.find(field => field.id === id);
    if (!f) return null;
    const label = `${f.label}${f.required ? ' *' : ''}`;
    switch (f.type) {
      case 'textarea':
        return <Textarea label={label} rows={3} placeholder={f.placeholder} value={String(value ?? '')} onChange={(e) => onChangeField(e.target.value)} error={error} required={f.required} disabled={disabled} />;
      case 'select':
        return <Select label={label} value={String(value ?? '')} onChange={(e) => onChangeField(e.target.value)} options={channelOptions(f, paymentChannels, optionSources).map(o => ({ value: o, label: o }))} error={error} required={f.required} disabled={disabled} />;
      case 'date':
        return <Input label={label} type="date" value={String(value ?? '')} onChange={(e) => onChangeField(e.target.value)} error={error} required={f.required} disabled={disabled} />;
      case 'number':
        return <Input label={label} type="number" inputMode="numeric" placeholder={f.placeholder} value={String(value ?? '')} onChange={(e) => onChangeField(e.target.value === '' ? '' : Number(e.target.value))} error={error} required={f.required} disabled={disabled} />;
      case 'currency':
        return <Input label={label} type="text" inputMode="decimal" placeholder={f.placeholder || '0,000,000.00'} value={String(value ?? '')} onChange={(e) => onChangeField(formatCurrencyInput(e.target.value))} error={error} required={f.required} disabled={disabled} />;
      case 'file':
        return (
          <div className="col-span-1 sm:col-span-2">
            <label htmlFor={`field-${f.id}`} className="block text-xs font-semibold text-text-secondary mb-1.5">
              {f.label}{f.required ? ' *' : ''}
            </label>
            <input
              id={`field-${f.id}`}
              type="file"
              multiple
              disabled={disabled}
              className="block w-full text-sm text-text-primary file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-accent file:text-[#fff] file:text-xs file:font-semibold file:cursor-pointer hover:file:bg-accent-dark disabled:opacity-50"
            />
            {f.helpText && <p className="text-[11px] text-text-muted mt-1">{f.helpText}</p>}
          </div>
        );
      default:
        return <Input label={label} placeholder={f.placeholder} value={String(value ?? '')} onChange={(e) => onChangeField(e.target.value)} error={error} required={f.required} disabled={disabled} />;
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {visible.length === 0 && (
        <p className="col-span-1 sm:col-span-2 text-body-sm text-text-muted text-center py-4">
          No transaction fields configured for this business unit yet.
        </p>
      )}
      {visible.map((f) => {
        const error = errors[f.id] || validateFieldValue(f, values[f.id]) || undefined;
        return (
          <div key={f.id} className={f.type === 'textarea' ? 'col-span-1 sm:col-span-2' : ''}>
            {renderField(f.id, values[f.id], (v) => {
              onChange(f.id, v);
              const err = validateFieldValue(f, v);
              if (onValidation) onValidation({ [f.id]: err || '' });
            }, error)}</div>
        );
      })}
    </div>
  );
}
