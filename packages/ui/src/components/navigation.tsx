import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn';

/** Nav item sidebar: Default/Hover/Active. Đang chọn chỉ dùng indigo. */
export function navItemClass(active: boolean): string {
  return cn(
    'flex h-8 items-center gap-2 rounded-md px-2 text-body font-medium transition-colors [&_svg]:size-4',
    active
      ? 'bg-selected text-brand [&_svg]:text-brand'
      : 'text-fg-secondary hover:bg-subtle hover:text-fg [&_svg]:text-fg-tertiary',
  );
}

/** Tab item: gạch chân indigo khi active. */
export function tabItemClass(active: boolean): string {
  return cn(
    'inline-flex h-9 items-center border-b-2 px-3 text-body font-medium',
    active ? 'border-brand text-brand' : 'border-transparent text-fg-secondary hover:text-fg',
  );
}

export function TabBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="tablist" className={cn('flex gap-1 border-b border-line', className)}>
      {children}
    </div>
  );
}

/** Segmented item (On/Off). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex rounded-md border border-line bg-subtle p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-6 rounded-sm px-2 text-small font-medium',
            o.value === value ? 'bg-surface text-fg shadow-sm' : 'text-fg-secondary hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Filter chip: Default/Active. */
export function FilterChip({
  active,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-small font-medium',
        active ? 'border-brand bg-brand-subtle text-brand' : 'border-line bg-surface text-fg-secondary hover:bg-hover',
        className,
      )}
      {...props}
    />
  );
}

export function TextLink({ className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={cn('text-link hover:underline', className)} {...props} />;
}
