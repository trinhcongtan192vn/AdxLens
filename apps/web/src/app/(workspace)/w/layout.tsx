import type { ReactNode } from 'react';
import { AppShell } from '@/components/workspace/app-shell';

/** Trang Workspace `/w/*` — cùng khung với mọi trang khác của app. */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
