import { clientLogger } from '../observability/logger'

const httpLogger = clientLogger.child({ component: 'http' })

const readMethod = (init?: RequestInit): string => String(init?.method || 'GET').toUpperCase()

const runFetch = async (url: string, init?: RequestInit): Promise<Response> => {
  const startedAt = Date.now()
  const method = readMethod(init)

  try {
    const response = await fetch(url, init)
    httpLogger.log({
      event: 'client.http.request',
      level: response.ok ? 'info' : 'warn',
      outcome: response.ok ? 'success' : 'error',
      fields: {
        url,
        method,
        status_code: response.status,
        ok: response.ok,
        duration_ms: Date.now() - startedAt,
      },
    })

    return response
  } catch (error) {
    httpLogger.log({
      event: 'client.http.request',
      level: 'error',
      outcome: 'error',
      error: error instanceof Error ? error : String(error),
      fields: {
        url,
        method,
        status_code: null,
        ok: false,
        duration_ms: Date.now() - startedAt,
      },
    })
    throw error
  }
}

export const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await runFetch(url, init)
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

export const fetchText = async (url: string, init?: RequestInit): Promise<string> => {
  const response = await runFetch(url, init)
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return response.text()
}
