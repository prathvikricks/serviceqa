import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variants: Record<Variant, string> = {
  // Primary carries the brand accent. --on-accent flips per theme, so the label
  // stays readable on both the dark-green and light-green fills.
  primary: 'bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-40',
  secondary:
    // Was hover:border-[#3f3f3f] — a dark-theme value bleeding into light.
    'bg-transparent text-text-primary border border-border hover:bg-hover hover:border-text-muted disabled:opacity-40',
  ghost: 'bg-transparent text-text-secondary hover:bg-hover hover:text-text-primary disabled:opacity-40',
  danger: 'bg-danger-solid text-white hover:bg-danger-solid-hover disabled:opacity-40',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[0.8rem]',
  md: 'h-9 px-4 text-[0.85rem]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        // whitespace-nowrap: without it a crowded action row wraps labels
        // mid-button ("Open" / "↗" on separate lines).
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] font-medium',
        // Focus ring was also hardcoded to a dark-theme grey.
        'transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-border',
        'disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}
