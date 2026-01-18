/**
 * Validates local TTS voice selections against the supported list.
 * Keeps pool and speak modules aligned with the same voice whitelist.
 */

import { AVAILABLE_VOICES, type VoiceName } from "../types"

export function isValidVoice(voice: string | undefined): voice is VoiceName {
  return typeof voice === "string" && AVAILABLE_VOICES.includes(voice as VoiceName)
}
