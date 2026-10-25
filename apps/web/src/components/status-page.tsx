import Link from 'next/link';
import type { ReactNode } from 'react';
import { buttonVariants } from '@adxlens/ui';

/** Khung chung cho X01 404, X02 403, X03 lỗi chung, F-state. Không lộ thông tin nội bộ. */
export function StatusPage({
  code,
  title,
  body,
  homeLabel,
  extra,
}: {
  code: string;
  title: ReactNode;
  body: ReactNode;
  homeLabel: string;
  extra?: ReactNode;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="num text-display font-semibold text-fg-tertiary">{code}</p>
      <h1 className="text-h1 font-semibold text-fg">{title}</h1>
      <p className="max-w-md text-body text-fg-secondary">{body}</p>
      {extra}
      <Link href="/w" className={buttonVariants({ kind: 'primary', size: 'm' })}>
        {homeLabel}
      </Link>
    </div>
  );
}
