'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Làm mới dữ liệu trang (Server Component) định kỳ, giữ nguyên trạng thái trên trình duyệt. Dùng khi đồng bộ đang chạy ở
 * nền để số liệu hiện dần; bỏ qua khi tab đang ẩn.
 */
export function AutoRefresh({ everyMs = 15_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, everyMs);
    return () => clearInterval(id);
  }, [everyMs, router]);
  return null;
}
