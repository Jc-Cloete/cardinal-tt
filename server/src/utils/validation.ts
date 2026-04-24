type FieldSelector = string | readonly string[]

type RuntimeInput =
  | Record<string, unknown>
  | {
      [key: string]: unknown
    }

export class HttpValidationError extends Error {
  readonly status = 400
}

export const failValidation = (message: string): never => {
  throw new HttpValidationError(message)
}

const selectorsFor = (selector: FieldSelector): readonly string[] =>
  typeof selector === 'string' ? [selector] : selector

const firstValue = (source: RuntimeInput | undefined, selector: FieldSelector): unknown => {
  if (!source) {
    return undefined
  }

  for (const key of selectorsFor(selector)) {
    const value = source[key]
    if (value !== undefined && value !== null) {
      return value
    }
  }

  return undefined
}

const normalizeString = (value: unknown): string => {
  const rawValue = Array.isArray(value) ? value[0] : value
  return String(rawValue ?? '').trim()
}

export const readOptionalString = (
  source: RuntimeInput | undefined,
  selector: FieldSelector,
  fallback = '',
): string => {
  const value = normalizeString(firstValue(source, selector))
  return value || fallback
}

export const readRequiredString = (
  source: RuntimeInput | undefined,
  selector: FieldSelector,
  message: string,
): string => {
  const value = readOptionalString(source, selector)
  if (!value) {
    failValidation(message)
  }

  return value
}

export const readRequiredStrings = <Fields extends Record<string, FieldSelector>>(
  source: RuntimeInput | undefined,
  fields: Fields,
  message: string,
): { [Key in keyof Fields]: string } => {
  const values = Object.fromEntries(
    Object.entries(fields).map(([outputKey, selector]) => [
      outputKey,
      readOptionalString(source, selector),
    ]),
  ) as { [Key in keyof Fields]: string }

  if (Object.values(values).some((value) => !value)) {
    failValidation(message)
  }

  return values
}

export const readBoundedInteger = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  const parsed = Number.parseInt(normalizeString(value), 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(min, Math.min(parsed, max))
}

export const readOptionalInteger = (
  source: RuntimeInput | undefined,
  selector: FieldSelector,
): number | undefined => {
  const value = readOptionalString(source, selector)
  if (!value) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const readRequiredInteger = (
  source: RuntimeInput | undefined,
  selector: FieldSelector,
  message: string,
): number => {
  const parsed = readOptionalInteger(source, selector)
  if (parsed !== undefined) {
    return parsed
  }

  return failValidation(message)
}

export const readRequiredIsoRange = (
  source: RuntimeInput | undefined,
  fromSelector: FieldSelector,
  toSelector: FieldSelector,
  message: string,
): { fromIso: string; toIso: string } => {
  const fromMs = Date.parse(readOptionalString(source, fromSelector))
  const toMs = Date.parse(readOptionalString(source, toSelector))
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    failValidation(message)
  }

  const startMs = Math.min(fromMs, toMs)
  const endMs = Math.max(fromMs, toMs)
  return {
    fromIso: new Date(startMs).toISOString(),
    toIso: new Date(endMs).toISOString(),
  }
}
