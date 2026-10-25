import type { ReactNode } from 'react';
import { AppShell } from '@/components/workspace/app-shell';

/** Trang có từ giao diện cổ điển, nay dùng khung chung (giữ nguyên URL và tính năng). */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
