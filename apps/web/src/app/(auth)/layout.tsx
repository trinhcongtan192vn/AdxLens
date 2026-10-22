import Link from 'next/link';
import type { ReactNode } from 'react';

/** Khung màn xác thực A01–A07 (Penpot): logo giữa, card 380px trên nền canvas. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-10">
      <Link href="/" className="mb-6 flex items-center gap-2">
        <span className="size-6 rounded-md bg-brand" aria-hidden />
        <span className="text-h3 font-semibold text-brand">AdxLens</span>
      </Link>
      <div className="w-full max-w-[380px] rounded-lg border border-line bg-surface px-6 py-6">{children}</div>
    </div>
  );
}
