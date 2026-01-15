/**
 * Routes TTS requests to the appropriate backend: local, http, openedai, or kokoro.
 * Exposes readiness, cancel, and interrupt controls.
 */

import type { TtsConfig } from "./types"
import { cancelHttpSpeak, checkHttpServer, isHttpReady, speakHttp } from "./engine-http"
import { cancelKokoroSpeak, checkKokoroServer, isKokoroReady, speakKokoro } from "./engine-kokoro"
import { cancelOpenedAISpeak, checkOpenedAIServer, isOpenedAIReady, speakOpenedAI } from "./engine-openedai"
import { cancelLocalSpeak, initLocalTts, interruptLocalSpeak, isLocalReady, speakLocal } from "./local"

export async function initTts(config: TtsConfig): Promise<boolean> {
  switch (config.backend) {
    case "kokoro":
      return checkKokoroServer(config)
    case "openedai":
      return checkOpenedAIServer(config)
    case "http":
      return checkHttpServer(config)
    default:
      return initLocalTts(config)
  }
}

export async function speak(text: string, config: TtsConfig): Promise<void> {
  switch (config.backend) {
    case "kokoro":
      try {
        await speakKokoro(text, config)
        return
      } catch (error) {
        if (config.fallbackToLocal && isLocalReady()) {
          await speakLocal(text, config)
          return
        }
        throw error
      }

    case "openedai":
      try {
        await speakOpenedAI(text, config)
        return
      } catch (error) {
        if (config.fallbackToLocal && isLocalReady()) {
          await speakLocal(text, config)
          return
        }
        throw error
      }

    case "http":
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

    default:
      await speakLocal(text, config)
  }
}

export function isReady(config: TtsConfig): boolean {
  switch (config.backend) {
    case "kokoro":
      return isKokoroReady() || (config.fallbackToLocal && isLocalReady())
    case "openedai":
      return isOpenedAIReady() || (config.fallbackToLocal && isLocalReady())
    case "http":
      return isHttpReady() || (config.fallbackToLocal && isLocalReady())
    default:
      return isLocalReady()
  }
}

export function cancelTts(config: TtsConfig): void {
  switch (config.backend) {
    case "kokoro":
      cancelKokoroSpeak()
      break
    case "openedai":
      cancelOpenedAISpeak()
      break
    case "http":
      cancelHttpSpeak()
      break
    default:
      cancelLocalSpeak()
  }
}

export function interruptTts(config: TtsConfig): void {
  switch (config.backend) {
    case "kokoro":
      cancelKokoroSpeak()
      break
    case "openedai":
      cancelOpenedAISpeak()
      break
    case "http":
      cancelHttpSpeak()
      break
    default:
      interruptLocalSpeak()
  }
}
