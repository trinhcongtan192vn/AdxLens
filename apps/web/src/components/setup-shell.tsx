import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@adxlens/ui';

/** Bố cục luồng thiết lập F1 (Penpot S03, S04): logo + "Thiết lập · bước N/4", card ở giữa. */
export function SetupShell({
  stepLabel,
  width = 'md',
  children,
}: {
  stepLabel: string;
  width?: 'md' | 'lg';
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex h-12 items-center border-b border-line bg-surface px-6">
        <Link href="/w" className="flex items-center gap-2">
          <span className="size-6 rounded-md bg-brand" aria-hidden />
          <span className="text-h3 font-semibold text-brand">AdxLens</span>
        </Link>
        <div className="flex-1" />
        <span className="text-small text-fg-secondary">{stepLabel}</span>
      </header>
      <main
        className={cn(
          'mx-auto mt-12 rounded-lg border border-line bg-surface px-6 py-6',
          width === 'md' ? 'max-w-[560px]' : 'max-w-[880px]',
        )}
      >
        {children}
      </main>
    </div>
  );
}
