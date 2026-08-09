import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from './Button'
import { overlayMotion, panelMotion } from '../../lib/motion'

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={onClose}
          {...overlayMotion}
        >
          <motion.div
            className="flex max-h-[85vh] w-full max-w-md flex-col rounded-[var(--radius-lg)] border border-border bg-surface shadow-lg"
            onClick={(e) => e.stopPropagation()}
            {...panelMotion}
          >
            <div className="shrink-0 border-b border-border-light px-5 py-4">
              <h3 className="text-sm font-semibold">{title}</h3>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-text-secondary">
              {children}
            </div>
            {footer && (
              <div className="flex shrink-0 justify-end gap-2 border-t border-border-light px-5 py-3">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  pendingLabel,
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title?: string
  message: ReactNode
  confirmLabel?: string
  pendingLabel?: string
  danger?: boolean
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={pending ? () => {} : onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? pendingLabel ?? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      {message}
    </Modal>
  )
}
