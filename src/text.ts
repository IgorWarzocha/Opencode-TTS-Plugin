/**
 * src/text.ts
 * Extracts text content and parses TTS command strings.
 * Normalizes command arguments for consistent toggle behavior.
 */

export const extractTextPart = (parts: Array<{ type: string; text?: string }>): string => {
  for (const part of parts) {
    if (part.type === "text" && part.text) {
      return part.text
    }
  }
  return ""
}

export const parseTtsCommand = (text: string): string | null => {
  const trimmed = text.trim()
  if (!trimmed.startsWith("/tts")) return null
  const tail = trimmed.slice(4).trim()
  if (tail.startsWith(":")) {
    return tail.slice(1).trim()
  }
  return tail
}

export const normalizeCommandArgs = (raw: string): string => {
  const cleaned = raw.trim().toLowerCase()
  if (cleaned.startsWith(":")) return cleaned.slice(1).trim()
  return cleaned
}
