export type FormFieldType = 'text' | 'number' | 'currency' | 'select' | 'date' | 'textarea' | 'file';

export type FormFieldValue = string | number | boolean;

export interface FormFieldValidation {
  min?: number;
  max?: number;
  pattern?: string;
  message?: string;
}

export interface FormFieldDefinition {
  id: string;
  label: string;
  type: FormFieldType;
  options?: string[];
  placeholder?: string;
  required: boolean;
  enabled: boolean;
  duplicateKey: boolean;
  order: number;
  helpText?: string;
  validation?: FormFieldValidation;
  showIf?: {
    field: string;
    equals: string | number | boolean;
  };
}

export interface BuFormConfig {
  bu: string;
  fields: FormFieldDefinition[];
  version: number;
  updatedAt: string;
  updatedBy: string;
}

export interface TicketFormStageConfig {
  fields: FormFieldDefinition[];
}

export interface TicketFormConfig {
  stage1: TicketFormStageConfig;
  stage2: BuFormConfig;
  stage3: TicketFormStageConfig;
  version: number;
  updatedAt: string;
  updatedBy: string;
}

export interface DuplicateCandidate {
  ticketId: string;
  customerName: string;
  status: string;
  createdAt: string;
  matchedField: string;
  matchedValue: string;
  confidence: number;
  isExact: boolean;
}

export type DuplicateResolution = 'create_new' | 'merge_existing' | 'cancel';

export interface ParseFieldError {
  row: number;
  fieldId: string;
  message: string;
}

export interface ImportResult {
  fields: FormFieldDefinition[];
  errors: ParseFieldError[];
}

export interface MergeSummary {
  added: number;
  updated: number;
  unchanged: number;
  errors: string[];
  finalFieldCount: number;
}

export interface DuplicateCandidate {
  ticketId: string;
  customerName: string;
  status: string;
  createdAt: string;
  matchedField: string;
  matchedValue: string;
  confidence: number;
  isExact: boolean;
}
