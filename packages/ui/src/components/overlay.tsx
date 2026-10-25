'use client';

import { X } from 'lucide-react';
import { Dialog as D, Tooltip as T, DropdownMenu as M } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../cn';

/** Dialog shell: bóng lg, nền surface. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  closeLabel,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
  className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-inverse/40" />
        <D.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-line bg-surface shadow-lg',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <D.Title className="text-h2 font-semibold text-fg">{title}</D.Title>
              {description ? (
                <D.Description className="text-body text-fg-secondary">{description}</D.Description>
              ) : null}
            </div>
            <D.Close aria-label={closeLabel} className="rounded-sm p-1 text-fg-tertiary hover:bg-subtle">
              <X className="size-4" />
            </D.Close>
          </div>
          <div className="overflow-y-auto px-4 py-3">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Drawer shell 480px bên phải: giữ ngữ cảnh bảng (ux-requirements mục 7). */
export function Drawer({
  open,
  onOpenChange,
  title,
  children,
  footer,
  closeLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-inverse/30" />
        <D.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(480px,100vw)] flex-col border-l border-line bg-surface shadow-lg">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <D.Title className="text-h2 font-semibold text-fg">{title}</D.Title>
            <D.Close aria-label={closeLabel} className="rounded-sm p-1 text-fg-tertiary hover:bg-subtle">
              <X className="size-4" />
            </D.Close>
          </div>
          <D.Description className="sr-only">{title}</D.Description>
          <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Tooltip nền đảo (bg/inverse). */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <T.Provider delayDuration={200}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content sideOffset={4} className="z-50 rounded-sm bg-inverse px-2 py-1 text-small text-fg-inverse">
            {content}
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}

export const Menu = {
  Root: M.Root,
  Trigger: M.Trigger,
  Content: ({ children, className }: { children: ReactNode; className?: string }) => (
    <M.Portal>
      <M.Content
        sideOffset={4}
        align="end"
        className={cn('z-50 min-w-48 rounded-md border border-line bg-surface p-1 shadow-lg', className)}
      >
        {children}
      </M.Content>
    </M.Portal>
  ),
  Item: ({
    children,
    onSelect,
    className,
  }: {
    children: ReactNode;
    onSelect?: (e: Event) => void;
    className?: string;
  }) => (
    <M.Item
      onSelect={onSelect}
      className={cn(
        'flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2 text-body text-fg outline-none data-[highlighted]:bg-subtle [&_svg]:size-4 [&_svg]:text-fg-tertiary',
        className,
      )}
    >
      {children}
    </M.Item>
  ),
  Separator: () => <M.Separator className="my-1 h-px bg-line" />,
  Label: ({ children }: { children: ReactNode }) => (
    <M.Label className="px-2 py-1 text-caption text-fg-tertiary">{children}</M.Label>
  ),
};
