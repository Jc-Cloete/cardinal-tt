import {
  CheckCircledIcon,
  CrossCircledIcon,
  ExclamationTriangleIcon,
  InfoCircledIcon,
} from '@radix-ui/react-icons'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { clientLogger } from '../observability/logger'

type ToastLevel = 'success' | 'error' | 'info' | 'warning'

type ToastInput = {
  title: string
  description?: string
  level?: ToastLevel
  durationMs?: number
}

type ToastRecord = {
  id: number
  title: string
  description: string
  level: ToastLevel
}

type ToastContextValue = {
  show: (toast: ToastInput) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
  warning: (title: string, description?: string) => void
}

const DEFAULT_DURATION_MS = 4500
const toastLogger = clientLogger.child({ component: 'toast-provider' })
const ToastContext = createContext<ToastContextValue | null>(null)

const buildNextId = (): number => Date.now() + Math.floor(Math.random() * 10_000)

const getToastIcon = (level: ToastLevel): ReactNode => {
  if (level === 'success') {
    return <CheckCircledIcon aria-hidden />
  }
  if (level === 'error') {
    return <CrossCircledIcon aria-hidden />
  }
  if (level === 'warning') {
    return <ExclamationTriangleIcon aria-hidden />
  }
  return <InfoCircledIcon aria-hidden />
}

type ToastProviderProps = {
  children: ReactNode
}

export const ToastProvider = ({ children }: ToastProviderProps) => {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const removeToast = useCallback((id: number): void => {
    const timeoutId = timersRef.current.get(id)
    if (timeoutId) {
      clearTimeout(timeoutId)
      timersRef.current.delete(id)
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback(
    (toast: ToastInput): void => {
      const id = buildNextId()
      const level = toast.level ?? 'info'
      const durationMs = toast.durationMs ?? DEFAULT_DURATION_MS
      const record: ToastRecord = {
        id,
        title: toast.title.trim() || 'Notification',
        description: toast.description?.trim() || '',
        level,
      }

      setToasts((prev) => [record, ...prev].slice(0, 6))
      toastLogger.log({
        event: 'client.toast.show',
        fields: {
          toast_id: id,
          level,
          duration_ms: durationMs,
          has_description: Boolean(record.description),
        },
      })

      const timeoutId = setTimeout(() => {
        removeToast(id)
      }, durationMs)
      timersRef.current.set(id, timeoutId)
    },
    [removeToast],
  )

  const success = useCallback(
    (title: string, description?: string) => show({ title, description, level: 'success' }),
    [show],
  )

  const error = useCallback(
    (title: string, description?: string) => show({ title, description, level: 'error' }),
    [show],
  )

  const info = useCallback(
    (title: string, description?: string) => show({ title, description, level: 'info' }),
    [show],
  )

  const warning = useCallback(
    (title: string, description?: string) => show({ title, description, level: 'warning' }),
    [show],
  )

  useEffect(() => {
    return () => {
      for (const timeoutId of timersRef.current.values()) {
        clearTimeout(timeoutId)
      }
      timersRef.current.clear()
    }
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success,
      error,
      info,
      warning,
    }),
    [show, success, error, info, warning],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <output className="toast-viewport" aria-live="polite" aria-label="Notifications">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-item toast-${toast.level}`}>
            <div className="toast-icon">{getToastIcon(toast.level)}</div>
            <div className="toast-content">
              <p className="toast-title">{toast.title}</p>
              {toast.description ? <p className="toast-description">{toast.description}</p> : null}
            </div>
            <button
              type="button"
              className="toast-close"
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </output>
    </ToastContext.Provider>
  )
}

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}
