import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

const fieldClass =
  'w-full h-9 px-3 rounded-[var(--radius-sm)] bg-surface text-text-primary text-[0.85rem] ' +
  'border border-border placeholder:text-text-muted ' +
  // These were hardcoded dark-theme greys (#3f3f3f / #525252), so in light mode
  // hovering or focusing a field drew a near-black edge. Now token-driven.
  'hover:border-text-muted ' +
  'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent-border ' +
  'transition-colors duration-150'

export function Field({ label, children, hint }: { label?: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      {label && (
        <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-text-secondary">
          {label}
        </span>
      )}
      {children}
      {hint && <span className="block text-xs text-text-muted">{hint}</span>}
    </label>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, className)} {...props} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldClass, 'cursor-pointer', className)} {...props}>
      {children}
    </select>
  )
}
