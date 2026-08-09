import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '../../lib/cn'
import { toastMotion } from '../../lib/motion'

type ToastTone = 'success' | 'danger' | 'info'
interface Toast {
  id: number
  message: string
  tone: ToastTone
}

interface ToastCtx {
  notify: (message: string, tone?: ToastTone) => void
}

const Ctx = createContext<ToastCtx | null>(null)

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = nextId++
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  return (
    <Ctx.Provider value={{ notify }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              className={cn(
                'rounded-[var(--radius-sm)] border px-4 py-2.5 text-sm shadow-md',
                t.tone === 'success' && 'border-success-border bg-success-bg text-success-fg',
                t.tone === 'danger' && 'border-danger-border bg-danger-bg text-danger-fg',
                t.tone === 'info' && 'border-info-border bg-info-bg text-info-fg',
              )}
              {...toastMotion}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
