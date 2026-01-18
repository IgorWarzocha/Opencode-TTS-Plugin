/**
 * Extracts text content and parses TTS command strings.
 * Provides text chunking for progressive TTS playback.
 */

import { DEFAULT_CHUNK_LENGTH } from "./constants"

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
  return trimmed.slice(4).trim()
}

export const normalizeCommandArgs = (raw: string): string => {
  return raw.trim().toLowerCase()
}

/**
 * Splits text into chunks for progressive TTS playback.
 * Breaks at sentence boundaries, then by words if too long.
 */

export function splitTextIntoChunks(text: string, maxLength = DEFAULT_CHUNK_LENGTH): string[] {
  const parts = text.match(/[^.!?\n]+[.!?\n]*|[\n]+/g) || [text]
  const chunks: string[] = []

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    if (trimmed.length <= maxLength) {
      chunks.push(trimmed)
      continue
    }

    const words = trimmed.split(/\s+/)
    let current = ""

    for (const word of words) {
      if (!word) continue
      if (!current) {
        current = word
        continue
      }
      if (current.length + word.length + 1 <= maxLength) {
        current = `${current} ${word}`
        continue
      }
      chunks.push(current)
      current = word
    }

    if (current) {
      chunks.push(current)
    }
  }

  return chunks
}
