import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '../cn';

/** Bảng: hàng 32px, số căn phải tabular-nums, header nền subtle viết hoa, header dính. */
export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-body', className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('sticky top-0 z-10 bg-subtle', className)} {...props} />;
}

export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TR({
  className,
  selected,
  total,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { selected?: boolean; total?: boolean }) {
  return (
    <tr
      className={cn(
        'h-8 border-b border-line-subtle',
        selected ? 'bg-selected' : 'hover:bg-hover',
        total && 'font-semibold',
        className,
      )}
      {...props}
    />
  );
}

export function TH({ className, numeric, ...props }: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        'h-7 whitespace-nowrap px-2 text-caption font-semibold uppercase tracking-wide text-fg-secondary',
        numeric ? 'text-right' : 'text-left',
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  numeric,
  muted,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean; muted?: boolean }) {
  return (
    <td
      className={cn('px-2 py-1.5', numeric && 'num text-right', muted ? 'text-fg-tertiary' : 'text-fg', className)}
      {...props}
    />
  );
}
