import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../cn';

/** Button: Kind Primary/Secondary/Ghost/Danger × Size S (28) / M (32) — Penpot "Button". */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      kind: {
        primary: 'bg-brand text-on-brand hover:bg-brand-hover',
        secondary: 'border border-line-strong bg-surface text-fg hover:bg-hover',
        ghost: 'text-fg-secondary hover:bg-subtle hover:text-fg',
        danger: 'bg-danger text-fg-inverse hover:opacity-90',
      },
      size: {
        s: 'h-7 px-2.5 text-body',
        m: 'h-8 px-3 text-body',
        icon: 'size-7',
      },
    },
    defaultVariants: { kind: 'secondary', size: 's' },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, kind, size, asChild, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      className={cn(buttonVariants({ kind, size }), className)}
      {...(asChild ? {} : { type: type ?? 'button' })}
      {...props}
    />
  );
}
