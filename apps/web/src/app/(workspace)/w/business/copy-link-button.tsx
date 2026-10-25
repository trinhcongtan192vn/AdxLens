'use client';

import { Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@adxlens/ui';

/** "Share" của Business Dashboard: sao chép link trang (người nhận cần quyền trong workspace). */
export function CopyLinkButton({ label, copied }: { label: string; copied: string }) {
  return (
    <Button
      kind="secondary"
      size="s"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          toast.success(copied);
        } catch {
          /* trình duyệt chặn clipboard */
        }
      }}
    >
      <Share2 className="size-4" aria-hidden />
      {label}
    </Button>
  );
}
