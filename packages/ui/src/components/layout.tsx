import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn';

/** Khối nền surface, viền thay bóng (design-system mục 1.3). */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-line bg-surface', className)} {...props} />;
}

export function CardHeader({
  title,
  actions,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 border-b border-line px-4 py-2.5',
        className,
      )}
    >
      <h2 className="text-h3 font-semibold text-fg">{title}</h2>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  breadcrumb,
  actions,
  children,
}: {
  title: ReactNode;
  breadcrumb?: ReactNode[];
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 pb-4">
      {breadcrumb?.length ? (
        <nav aria-label="breadcrumb" className="text-small text-fg-tertiary">
          {breadcrumb.map((b, i) => (
            <span key={i}>
              {i > 0 ? <span className="px-1">›</span> : null}
              {b}
            </span>
          ))}
        </nav>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-h1 font-semibold text-fg">{title}</h1>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** Dòng nguồn số liệu: "Khớp Meta · cập nhật … · attribution · tiền tệ · múi giờ" (U2). */
export function SourceFootnote({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={cn('text-caption text-fg-tertiary', className)}>{children}</p>;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-10 text-center', className)}>
      {icon ? <div className="text-fg-tertiary [&_svg]:size-6">{icon}</div> : null}
      <p className="text-h3 font-semibold text-fg">{title}</p>
      {description ? <p className="max-w-md text-body text-fg-secondary">{description}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-sm bg-subtle', className)} />;
}

/** Tile KPI nhỏ gọn, luôn kèm so sánh kỳ trước (design-system KPI Stat). */
export function KpiStat({
  label,
  value,
  delta,
  compare,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  compare?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-36 flex-col gap-0.5 px-4 py-2.5', className)}>
      <span className="text-caption font-medium uppercase tracking-wide text-fg-tertiary">
        {label}
      </span>
      <span className="num text-kpi font-semibold text-fg">{value}</span>
      {delta || compare ? (
        <span className="flex items-center gap-1.5 text-small text-fg-tertiary">
          {delta}
          {compare}
        </span>
      ) : null}
    </div>
  );
}
