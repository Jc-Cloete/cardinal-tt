import type { ContentItem, ParsedResponseItemEntry, PreviewMessage } from '../types'

const extractMessageBlocks = (content: ContentItem[] = []): string[] => {
  const blocks: string[] = []

  for (const item of content) {
    if (item?.type === 'input_text' || item?.type === 'output_text' || item?.type === 'text') {
      if (typeof item?.text === 'string' && item.text.trim()) {
        blocks.push(item.text.trim())
      }
      continue
    }

    if (item?.type === 'image' || item?.type === 'input_image' || item?.type === 'local_image') {
      blocks.push('[image]')
    }
  }

  return blocks
}

export const parsePreviewMessages = (text: string): PreviewMessage[] =>
  text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line) as ParsedResponseItemEntry
      } catch {
        return null
      }
    })
    .filter((entry): entry is ParsedResponseItemEntry => entry !== null)
    .filter((entry) => entry?.type === 'response_item' && entry?.payload?.type === 'message')
    .map((entry, index) => ({
      id: `${entry?.timestamp || 'no-ts'}-${index}`,
      role: entry?.payload?.role || 'unlabeled',
      phase: entry?.payload?.phase || '',
      timestamp: entry?.timestamp || '',
      text: extractMessageBlocks(entry?.payload?.content || []).join('\n\n'),
    }))
    .filter((entry) => entry.text.trim().length > 0)
    .map((entry) => ({
      ...entry,
      lineCount: entry.text.split('\n').length,
    }))
