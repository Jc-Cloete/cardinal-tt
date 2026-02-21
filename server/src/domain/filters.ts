import type { JsonRecord } from '../types'
import { asRecord, asString } from '../utils/json'

// Extract project cwd from session metadata envelope.
export const readProjectDirFromSessionMeta = (entry: JsonRecord): string | null => {
  if (asString(entry.type) !== 'session_meta') {
    return null
  }

  const payload = asRecord(entry.payload)
  const cwd = asString(payload?.cwd)
  return cwd?.trim() ? cwd.trim() : null
}

const containsExcludedTagPair = (entry: JsonRecord): boolean => {
  const texts: string[] = []

  const rootText = asString(entry.text)
  if (rootText) {
    texts.push(rootText)
  }

  const payload = asRecord(entry.payload)
  const payloadText = asString(payload?.text)
  if (payloadText) {
    texts.push(payloadText)
  }

  const payloadContent = payload?.content
  if (Array.isArray(payloadContent)) {
    for (const item of payloadContent) {
      const itemRecord = asRecord(item)
      const itemText = asString(itemRecord?.text)
      if (itemText) {
        texts.push(itemText)
      }
    }
  }

  const joined = texts.join('\n').toLowerCase()

  return (
    (joined.includes('<instructions>') && joined.includes('</instructions>')) ||
    (joined.includes('<environment_context>') && joined.includes('</environment_context>'))
  )
}

export const shouldExcludePreviewEntry = (entry: JsonRecord): boolean => {
  // Filter out internal transport/tooling frames so previews show user/assistant conversation content.
  const rootType = asString(entry.type)
  if (rootType === 'session_meta' || rootType === 'event_msg' || rootType === 'turn_context') {
    return true
  }

  const payload = asRecord(entry.payload)
  const payloadType = asString(payload?.type)
  if (
    rootType === 'response_item' &&
    (payloadType === 'function_call' ||
      payloadType === 'function_call_output' ||
      payloadType === 'reasoning')
  ) {
    return true
  }

  if (containsExcludedTagPair(entry)) {
    return true
  }

  const payloadMessage = asRecord(payload?.message)
  const role = asString(entry.role) || asString(payload?.role) || asString(payloadMessage?.role)
  return role === 'developer'
}
