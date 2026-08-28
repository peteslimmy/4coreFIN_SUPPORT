import DynamicFormStep from '../forms/DynamicFormStep';
import type { FormFieldValue } from '../../types/forms';
import type { BuFormConfig } from '../../types/forms';

interface TransactionInfoStepProps {
  buFormConfig: BuFormConfig;
  txValues: Record<string, FormFieldValue>;
  txErrors: Record<string, string>;
  category: string;
  paymentChannels: string[];
  onChange: (id: string, value: FormFieldValue) => void;
  onValidation: (errs: Record<string, string>) => void;
}

export default function TransactionInfoStep({ buFormConfig, txValues, txErrors, category, paymentChannels, onChange, onValidation }: TransactionInfoStepProps) {
  return (
    <div className="space-y-4">
      <DynamicFormStep
        config={buFormConfig}
        values={txValues}
        errors={txErrors}
        context={{ category }}
        paymentChannels={paymentChannels}
        onChange={onChange}
        onValidation={onValidation}
      />
      {Object.keys(txErrors).length > 0 && (
        <div role="alert" className="mt-2 rounded-md bg-error/10 border border-error/20 px-3 py-2 text-xs text-error">
          <span className="font-medium">Please correct the highlighted transaction fields:</span>
          <ul className="list-disc list-inside mt-1 space-y-0.5">
            {Object.entries(txErrors).filter(([, v]) => v).map(([k, v]) => {
              const msg = v as string;
              return <li key={k}>{msg || k + ' is required'}</li>;
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
