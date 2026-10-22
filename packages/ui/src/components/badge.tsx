import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../cn';

/** Badge: Tone × Style (Subtle/Solid). Truyền đạt trạng thái bằng chữ, không chỉ bằng màu. */
export const badgeVariants = cva(
  'inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-caption font-medium',
  {
    variants: {
      tone: {
        neutral: '',
        success: '',
        warning: '',
        danger: '',
        info: '',
        brand: '',
      },
      variant: { subtle: 'border', solid: 'text-fg-inverse' },
    },
    compoundVariants: [
      { tone: 'neutral', variant: 'subtle', className: 'border-line bg-subtle text-fg-secondary' },
      {
        tone: 'success',
        variant: 'subtle',
        className: 'border-success-line bg-success-bg text-success',
      },
      {
        tone: 'warning',
        variant: 'subtle',
        className: 'border-warning-line bg-warning-bg text-warning',
      },
      {
        tone: 'danger',
        variant: 'subtle',
        className: 'border-danger-line bg-danger-bg text-danger',
      },
      { tone: 'info', variant: 'subtle', className: 'border-info-line bg-info-bg text-info' },
      {
        tone: 'brand',
        variant: 'subtle',
        className: 'border-brand-subtle bg-brand-subtle text-brand',
      },
      { tone: 'neutral', variant: 'solid', className: 'bg-fg-secondary' },
      { tone: 'success', variant: 'solid', className: 'bg-success' },
      { tone: 'warning', variant: 'solid', className: 'bg-warning' },
      { tone: 'danger', variant: 'solid', className: 'bg-danger' },
      { tone: 'info', variant: 'solid', className: 'bg-info' },
      { tone: 'brand', variant: 'solid', className: 'bg-brand' },
    ],
    defaultVariants: { tone: 'neutral', variant: 'subtle' },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, variant }), className)} {...props} />;
}
