import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '../cn';

/** Control cao 28px; viền border/control (≥ 3:1); focus viền indigo 2px; lỗi viền đỏ kèm thông điệp. */
const control =
  'w-full rounded-md border border-line-control bg-surface px-2 text-body text-fg placeholder:text-fg-tertiary focus:border-line-focus focus:outline-2 focus:outline-line-focus disabled:cursor-not-allowed disabled:border-line disabled:bg-subtle disabled:text-fg-disabled aria-[invalid=true]:border-delta-neg';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, 'h-7', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'min-h-20 py-1.5', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, 'h-7 pr-6', className)} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <input
      type="checkbox"
      className={cn('size-4 rounded-xs border-line-control accent-[var(--color-brand-primary)]', className)}
      {...props}
    />
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-small font-medium text-fg-secondary', className)} {...props} />;
}

/** Nhãn + control + gợi ý/lỗi. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-small text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-small text-fg-tertiary">{hint}</p>
      ) : null}
    </div>
  );
}
