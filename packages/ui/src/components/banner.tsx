import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../cn';

const tones = {
  info: { box: 'border-info-line bg-info-bg text-info', Icon: Info },
  warning: { box: 'border-warning-line bg-warning-bg text-warning', Icon: AlertTriangle },
  danger: { box: 'border-danger-line bg-danger-bg text-danger', Icon: XCircle },
  success: { box: 'border-success-line bg-success-bg text-success', Icon: CheckCircle2 },
} as const;

/** Banner: đặt đầu vùng nội dung, mỗi lần một cái (design-system Banner). */
export function Banner({
  tone,
  title,
  children,
  action,
  className,
}: {
  tone: keyof typeof tones;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = tones[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2 rounded-md border px-3 py-2', box, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex-1 text-body">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-fg-secondary">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
