/**
 * Routes TTS requests to either the local or HTTP backend.
 * Exposes readiness, cancel, and interrupt controls.
 */

import type { TtsConfig } from "./types"
import { checkHttpServer, isHttpReady, speakHttp } from "./engine-http"
import { cancelLocalSpeak, initLocalTts, interruptLocalSpeak, isLocalReady, speakLocal } from "./local"

export async function initTts(config: TtsConfig): Promise<boolean> {
  if (config.backend === "http") {
    return checkHttpServer(config)
  }
  return initLocalTts(config)
}

export async function speak(text: string, config: TtsConfig): Promise<void> {
  if (config.backend === "http") {
    try {
      await speakHttp(text, config)
      return
    } catch (error) {
      if (config.fallbackToLocal && isLocalReady()) {
        await speakLocal(text, config)
        return
      }
      throw error
    }
  }
  await speakLocal(text, config)
}

export function isReady(config: TtsConfig): boolean {
  if (config.backend === "http") {
    return isHttpReady() || (config.fallbackToLocal && isLocalReady())
  }
  return isLocalReady()
}

export function cancelTts(config: TtsConfig): void {
  cancelLocalSpeak()
}

export function interruptTts(config: TtsConfig): void {
  interruptLocalSpeak()
}
