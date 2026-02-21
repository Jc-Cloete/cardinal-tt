import {DEFAULT_CONVERSATION_BREAK_LIMIT} from '../config'

export const getConversationBreakLimitMinutes = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CONVERSATION_BREAK_LIMIT
  }

  return parsed
}

export const isForceRefresh = (value: unknown): boolean => {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}
