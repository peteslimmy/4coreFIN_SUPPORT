/**
 * Barrel + compatibility primitives for the UI kit.
 * Provides shadcn-style named exports used by feature pages on top of the
 * existing default-export components in this folder.
 */
import { createContext, useContext, useState, type ReactNode, type ChangeEvent } from 'react';
import type * as React from 'react';
import ButtonBase from './Button';
import BadgeBase from './Badge';
import InputBase from './Input';
import TextareaBase from './Textarea';
import { useApp } from '../../context/AppContext';

type WithKey<T> = T & { key?: React.Key };

/* ------------------------------- Button ------------------------------- */

interface CompatButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children?: ReactNode;
  variant?: 'primary' | 'secondary' | 'outlined' | 'ghost' | 'danger' | 'outline' | 'destructive' | 'default';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  loading?: boolean;
}

export function Button({ isLoading, loading, variant = 'primary', size = 'md', ...props }: CompatButtonProps) {
  const mappedVariant =
    variant === 'outline' ? 'outlined'
    : variant === 'destructive' ? 'danger'
    : variant;
  return <ButtonBase {...props} loading={isLoading ?? loading} variant={mappedVariant} size={size} />;
}

/* -------------------------------- Badge -------------------------------- */

interface CompatBadgeProps {
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'outline' | 'destructive' | 'secondary' | 'default';
  size?: string;
  className?: string;
  children?: ReactNode;
}

export function Badge({ variant = 'neutral', size = 'md', className = '', children }: WithKey<CompatBadgeProps>) {
  const mappedVariant =
    variant === 'outline' ? 'neutral'
    : variant === 'destructive' ? 'error'
    : variant === 'secondary' ? 'info'
    : variant === 'default' ? 'info'
    : variant;
  return <BadgeBase variant={mappedVariant} size={size as never} className={className}>{children}</BadgeBase>;
}

/* ---------------------------- Input / Textarea --------------------------- */

type CompatInputProps = WithKey<React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; helperText?: string }>;

export function Input(props: CompatInputProps) {
  return <InputBase {...props} />;
}

type CompatTextareaProps = WithKey<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string; helperText?: string }>;

export function Textarea({ maxRows: _maxRows, ...props }: CompatTextareaProps & { maxRows?: number }) {
  return <TextareaBase {...props} />;
}

/* -------------------------------- Label --------------------------------- */

export function Label({ children, htmlFor, className = '', ...rest }: WithKey<{ children?: ReactNode; htmlFor?: string; className?: string } & Record<string, unknown>>) {
  return (
    <label htmlFor={htmlFor} className={`text-sm font-medium text-text-primary ${className}`} {...rest}>
      {children}
    </label>
  );
}

/* ------------------------------ Separator ------------------------------- */

export function Separator({ className = '' }: WithKey<{ className?: string }>) {
  return <div className={`h-px w-full bg-border-subtle ${className}`} role="separator" />;
}

/* --------------------------------- Tabs --------------------------------- */

const TabsContext = createContext<{ value: string; setValue: (v: string) => void } | null>(null);

export function Tabs({ defaultValue = '', value, onValueChange, className = '', children }: WithKey<{
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  className?: string;
  children: ReactNode;
}>) {
  const [internal, setInternal] = useState(defaultValue);
  const current = value !== undefined ? value : internal;
  return (
    <TabsContext.Provider value={{ value: current, setValue: (v) => { setInternal(v); onValueChange?.(v); } }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className = '', children }: WithKey<{ className?: string; children: ReactNode }>) {
  return (
    <div role="tablist" className={`flex gap-0.5 overflow-x-auto flex-nowrap rounded-lg bg-surface p-1 ${className}`}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children, className = '' }: WithKey<{ value: string; children: ReactNode; className?: string }>) {
  const ctx = useContext(TabsContext);
  const active = ctx?.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => ctx?.setValue(value)}
      className={`inline-flex items-center justify-center whitespace-nowrap px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 focus-ring ${
        active ? 'bg-primary-light text-primary-dark shadow-sm' : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children, className = '' }: WithKey<{ value: string; children: ReactNode; className?: string }>) {
  const ctx = useContext(TabsContext);
  if (ctx?.value !== value) return null;
  return (
    <div role="tabpanel" className={`mt-4 ${className}`}>
      {children}
    </div>
  );
}

/* --------------------------------- Table -------------------------------- */

export function Table({ className = '', children }: WithKey<{ className?: string; children: ReactNode }>) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse text-left text-sm ${className}`}>{children}</table>
    </div>
  );
}

export function TableHeader({ className = '', children }: WithKey<{ className?: string; children: ReactNode }>) {
  return <thead className={className}>{children}</thead>;
}

export function TableBody({ className = '', children }: WithKey<{ className?: string; children: ReactNode }>) {
  return <tbody className={className}>{children}</tbody>;
}

export function TableRow({ className = '', children, onClick }: WithKey<{ className?: string; children: ReactNode; onClick?: (e: React.MouseEvent<HTMLTableRowElement>) => void }>) {
  return (
    <tr onClick={onClick} className={`border-b border-border-subtle hover:bg-surface-hover/60 transition-colors ${className}`}>
      {children}
    </tr>
  );
}

export function TableHead({ className = '', children }: WithKey<{ className?: string; children?: ReactNode }>) {
  return <th className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted ${className}`}>{children}</th>;
}

export function TableCell({ className = '', children, colSpan }: WithKey<{ className?: string; children?: ReactNode; colSpan?: number }>) {
  return <td colSpan={colSpan} className={`px-3 py-2.5 align-middle ${className}`}>{children}</td>;
}

/* -------------------------- Switch / Checkbox --------------------------- */

interface CompatSwitchProps {
  id?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (e: { target: { checked: boolean } }) => void;
  disabled?: boolean;
  className?: string;
}

function SwitchImpl({ id, checked, defaultChecked = false, onChange, disabled, className = '' }: CompatSwitchProps) {
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isChecked = checked !== undefined ? checked : internalChecked;
  const toggle = () => {
    setInternalChecked(!isChecked);
    onChange?.({ target: { checked: !isChecked } });
  };
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={isChecked}
      disabled={disabled}
      onClick={toggle}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus-ring ${
        isChecked ? 'bg-primary' : 'bg-border-subtle'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          isChecked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
}

export { SwitchImpl as Switch };
export { SwitchImpl as SwitchComponent };

interface CompatCheckboxProps {
  id?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  indeterminate?: boolean;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function Checkbox({ id, checked, defaultChecked = false, indeterminate = false, onChange, disabled, className = '', 'aria-label': ariaLabel }: WithKey<CompatCheckboxProps>) {
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isChecked = checked !== undefined ? checked : internalChecked;
  return (
    <input
      ref={(el) => {
        if (el) el.indeterminate = indeterminate && !isChecked;
      }}
      type="checkbox"
      id={id}
      checked={isChecked}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => { setInternalChecked(e.target.checked); onChange?.(e); }}
      className={`h-4 w-4 shrink-0 rounded border-border accent-[var(--color-primary,#2563eb)] cursor-pointer ${className}`}
    />
  );
}

/* ----------------------------- DropdownMenu ----------------------------- */

const DropdownMenuContext = createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null);

export function DropdownMenu({ children }: WithKey<{ children: ReactNode }>) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block">{children}</div>
    </DropdownMenuContext.Provider>
  );
}

export function DropdownMenuTrigger({ children }: WithKey<{ children?: ReactNode; asChild?: boolean }>) {
  const ctx = useContext(DropdownMenuContext);
  return <span onClick={() => ctx?.setOpen(!ctx.open)}>{children}</span>;
}

export function DropdownMenuContent({ children, align = 'start' }: WithKey<{ children: ReactNode; align?: 'start' | 'end' }>) {
  const ctx = useContext(DropdownMenuContext);
  if (!ctx?.open) return null;
  return (
    <div className={`absolute z-50 mt-1 min-w-[10rem] rounded-lg border border-border-subtle bg-surface-elevated py-1 shadow-lg ${align === 'end' ? 'right-0' : 'left-0'}`}>
      {children}
    </div>
  );
}

export function DropdownMenuItem({ children, onClick }: WithKey<{ children: ReactNode; onClick?: () => void }>) {
  const ctx = useContext(DropdownMenuContext);
  return (
    <button
      type="button"
      onClick={() => { onClick?.(); ctx?.setOpen(false); }}
      className="flex w-full items-center px-3 py-2 text-sm text-text-primary hover:bg-surface-hover transition-colors"
    >
      {children}
    </button>
  );
}

/* -------------------------------- Select -------------------------------- */

const SelectContext = createContext<{ value: string; setValue: (v: string) => void } | null>(null);

export function Select({ value, onValueChange, defaultValue = '', children }: WithKey<{
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  children: ReactNode;
}>) {
  const [internal, setInternal] = useState(defaultValue);
  return (
    <SelectContext.Provider value={{ value: value !== undefined ? value : internal, setValue: (v) => { setInternal(v); onValueChange?.(v); } }}>
      <div>{children}</div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ className = '', children }: WithKey<{ className?: string; children?: ReactNode }>) {
  return <div className={`inline-flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm min-w-[10rem] ${className}`}>{children}</div>;
}

export function SelectValue({ placeholder }: WithKey<{ placeholder?: string }>) {
  const ctx = useContext(SelectContext);
  return <span>{ctx?.value || placeholder || ''}</span>;
}

export function SelectContent({ children }: WithKey<{ children: ReactNode }>) {
  return <ul className="mt-1 rounded-lg border border-border-subtle bg-surface-elevated py-1 shadow-lg">{children}</ul>;
}

export function SelectItem({ value, children }: WithKey<{ value: string; children: ReactNode }>) {
  const ctx = useContext(SelectContext);
  return (
    <li
      onClick={() => ctx?.setValue(value)}
      className={`cursor-pointer px-3 py-2 text-sm hover:bg-surface-hover ${ctx?.value === value ? 'bg-primary-light text-primary-dark' : ''}`}
    >
      {children}
    </li>
  );
}

export function SelectSeparator() {
  return <li className="my-1 h-px bg-border-subtle" role="separator" />;
}

/* -------------------------------- Slider -------------------------------- */

export function Slider({ value, onChange, min = 0, max = 100, step = 1, className = '' }: WithKey<{
  value?: number[];
  onChange?: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}>) {
  const v = Array.isArray(value) ? value[0] : value ?? min;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={v}
      onChange={(e) => onChange?.([Number(e.target.value)])}
      className={`accent-[var(--color-primary,#2563eb)] ${className}`}
    />
  );
}

/* -------------------------------- Toast --------------------------------- */

export function useToast(): { toast: { success: (m: string) => void; error: (m: string) => void; info: (m: string) => void; warning: (m: string) => void } } {
  const { showToast } = useApp();
  return {
    toast: {
      success: (m: string) => showToast(m, 'success'),
      error: (m: string) => showToast(m, 'error'),
      info: (m: string) => showToast(m, 'info'),
      warning: (m: string) => showToast(m, 'warning'),
    },
  };
}

export { default as ToastContainer } from './Toast';

/* --------------------- Re-export existing components -------------------- */

export { default as Modal } from './Modal';
export { default as Skeleton } from './Skeleton';
export { default as EmptyState } from './EmptyState';
