/**
 * Defines shared command tracking types for the TTS plugin.
 * Keeps command metadata consistent across modules.
 */

export type CommandState = {
  name: string
  args: string
} | null
