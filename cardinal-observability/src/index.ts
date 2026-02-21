export type WideEventPrimitive = string | number | boolean | null
export type WideEventValue = WideEventPrimitive | WideEventObject | WideEventArray
export type WideEventObject = { [key: string]: WideEventValue }
export type WideEventArray = WideEventValue[]

export type WideEventLevel = 'debug' | 'info' | 'warn' | 'error'
export type WideEventOutcome = 'success' | 'error'

export type WideEventRecord = {
  ts: string
  level: WideEventLevel
  service: string
  event: string
  fields: WideEventObject
}

type LogInput = {
  event: string
  level?: WideEventLevel
  fields?: WideEventObject
  outcome?: WideEventOutcome
  error?: Error | WideEventValue
}

type LoggerOptions = {
  service: string
  environment?: string
  minLevel?: WideEventLevel
  context?: WideEventObject
  enabled?: boolean
  sink?: (record: WideEventRecord) => void
}

export type WideEventLogger = {
  log: (input: LogInput) => void
  child: (context: WideEventObject) => WideEventLogger
  run<T>(input: Omit<LogInput, 'outcome' | 'error'>, fn: () => T): T
  runAsync<T>(input: Omit<LogInput, 'outcome' | 'error'>, fn: () => Promise<T>): Promise<T>
}

const levelWeight: Record<WideEventLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const defaultSink = (record: WideEventRecord): void => {
  const serialized = JSON.stringify(record)
  if (record.level === 'error') {
    console.error(serialized)
    return
  }
  if (record.level === 'warn') {
    console.warn(serialized)
    return
  }
  console.log(serialized)
}

const normalizeError = (value: Error | WideEventValue): WideEventObject => {
  if (value instanceof Error) {
    return {
      error_name: value.name,
      error_message: value.message,
      error_stack: value.stack || null,
    }
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as WideEventObject
  }

  return {
    error_message: String(value),
  }
}

const mergeFields = (left: WideEventObject, right?: WideEventObject): WideEventObject => ({
  ...left,
  ...(right || {}),
})

const createFallbackTraceId = (): string => {
  const seed = Math.floor(Math.random() * 1_000_000)
  return `trace-${Date.now()}-${seed}`
}

const readRuntimeEnv = (key: string): string | undefined => {
  if (typeof process === 'undefined') {
    return undefined
  }

  return process.env[key]
}

export const createTraceId = (): string => {
  const runtimeCrypto = globalThis.crypto
  if (runtimeCrypto && typeof runtimeCrypto.randomUUID === 'function') {
    return runtimeCrypto.randomUUID()
  }

  return createFallbackTraceId()
}

export const createWideEventLogger = (options: LoggerOptions): WideEventLogger => {
  const minimum = options.minLevel || 'info'
  const baseContext = {
    environment: options.environment || readRuntimeEnv('NODE_ENV') || 'development',
    ...(options.context || {}),
  }

  const enabled = options.enabled ?? readRuntimeEnv('CARDINAL_LOG_SILENT') !== '1'
  const sink = options.sink || defaultSink

  const shouldEmit = (level: WideEventLevel): boolean =>
    enabled && levelWeight[level] >= levelWeight[minimum]

  const write = (input: LogInput, parentContext: WideEventObject): void => {
    const level = input.level || 'info'
    if (!shouldEmit(level)) {
      return
    }

    const mergedFields = mergeFields(parentContext, input.fields)
    const eventFields: WideEventObject = {
      ...mergedFields,
      trace_id: mergedFields.trace_id || createTraceId(),
    }

    if (input.outcome) {
      eventFields.outcome = input.outcome
    }

    if (input.error) {
      Object.assign(eventFields, normalizeError(input.error))
    }

    sink({
      ts: new Date().toISOString(),
      level,
      service: options.service,
      event: input.event,
      fields: eventFields,
    })
  }

  const childFactory = (context: WideEventObject): WideEventLogger => {
    const combinedContext = mergeFields(baseContext, context)

    const run = <T>(input: Omit<LogInput, 'outcome' | 'error'>, fn: () => T): T => {
      const startedAt = Date.now()
      try {
        const result = fn()
        write(
          {
            event: input.event,
            level: input.level || 'info',
            outcome: 'success',
            fields: {
              ...(input.fields || {}),
              duration_ms: Date.now() - startedAt,
            },
          },
          combinedContext,
        )
        return result
      } catch (error) {
        write(
          {
            event: input.event,
            level: 'error',
            outcome: 'error',
            fields: {
              ...(input.fields || {}),
              duration_ms: Date.now() - startedAt,
            },
            error: error instanceof Error ? error : String(error),
          },
          combinedContext,
        )
        throw error
      }
    }

    const runAsync = async <T>(
      input: Omit<LogInput, 'outcome' | 'error'>,
      fn: () => Promise<T>,
    ): Promise<T> => {
      const startedAt = Date.now()
      try {
        const result = await fn()
        write(
          {
            event: input.event,
            level: input.level || 'info',
            outcome: 'success',
            fields: {
              ...(input.fields || {}),
              duration_ms: Date.now() - startedAt,
            },
          },
          combinedContext,
        )
        return result
      } catch (error) {
        write(
          {
            event: input.event,
            level: 'error',
            outcome: 'error',
            fields: {
              ...(input.fields || {}),
              duration_ms: Date.now() - startedAt,
            },
            error: error instanceof Error ? error : String(error),
          },
          combinedContext,
        )
        throw error
      }
    }

    return {
      log: (input: LogInput) => write(input, combinedContext),
      child: (contextValue: WideEventObject) =>
        childFactory(mergeFields(combinedContext, contextValue)),
      run,
      runAsync,
    }
  }

  return childFactory(baseContext)
}
