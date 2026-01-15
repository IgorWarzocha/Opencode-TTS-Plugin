import { AVAILABLE_VOICES, type VoiceName } from "../types"

export function isValidVoice(voice: string | undefined): voice is VoiceName {
  return typeof voice === "string" && AVAILABLE_VOICES.includes(voice as VoiceName)
}
