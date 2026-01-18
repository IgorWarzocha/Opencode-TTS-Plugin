/**
 * Provides the high-level speakText helper for message playback.
 * Coordinates cleanup, interruption, and backend invocation.
 */

import type { TtsConfig } from "./types"
import { cancelTts, interruptTts, isReady, speak } from "./engine"
import { TOAST_DURATIONS } from "./constants"

export type SpeakerDependencies = {
  config: TtsConfig
  getLastSpokenMessageID: () => string | null
  setLastSpokenMessageID: (id: string | null) => void
  getLatestMessage: () => { id: string | null; text: string | null }
  client: {
    tui: {
      showToast: (options: {
        body: {
          title?: string
          message: string
          variant: "info" | "success" | "warning" | "error"
          duration?: number
        }
      }) => Promise<unknown>
    }
  }
}

export const createSpeaker = (deps: SpeakerDependencies) => {
  const { config, setLastSpokenMessageID, getLatestMessage, client } = deps

  const speakText = async (messageID: string, text: string): Promise<void> => {
    const lastSpokenMessageID = deps.getLastSpokenMessageID()
    if (lastSpokenMessageID === messageID) return
    if (!config.enabled) {
      cancelTts(config)
      return
    }
    if (!isReady(config)) return

    if (lastSpokenMessageID && lastSpokenMessageID !== messageID) {
      interruptTts(config)
    }

    setLastSpokenMessageID(messageID)

    const cleanText = text
      .replace(/```[\s\S]*?```/g, " code block ")
      .replace(/[#*_`]/g, "")
      .trim()

    if (cleanText.length === 0) return
    try {
      await speak(cleanText, config, client)
    } catch {
      await client.tui.showToast({
        body: {
          title: "TTS Reader",
          message: "Failed to synthesize speech (all backends failed)",
          variant: "error",
          duration: TOAST_DURATIONS.error,
        },
      })
    }
  }

  const speakLatest = (): void => {
    const latest = getLatestMessage()
    if (config.enabled && latest.id && latest.text && deps.getLastSpokenMessageID() !== latest.id) {
      void speakText(latest.id, latest.text)
    }
  }

  return { speakText, speakLatest }
}
