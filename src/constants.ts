/**
 * Centralizes shared numeric constants for the TTS plugin.
 * Keeps timeout and duration values consistent across backends and UI feedback.
 */

export const DEFAULT_CHUNK_LENGTH = 240
export const SERVER_TIMEOUT_MS = 3000
export const TOAST_DURATIONS = {
  success: 2000,
  error: 3000,
  warning: 7000,
  audio: 8000,
} as const
