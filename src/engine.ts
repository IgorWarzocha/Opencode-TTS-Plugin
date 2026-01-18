/**
 * Routes TTS requests to the appropriate backend: local, http, openedai, or kokoro.
 * Exposes readiness, cancel, and interrupt controls.
 */

import type { TtsConfig } from "./types"
import { cancelHttpSpeak, checkHttpServer, isHttpReady, speakHttp } from "./engine-http"
import { cancelKokoroSpeak, checkKokoroServer, isKokoroReady, speakKokoro } from "./engine-kokoro"
import { cancelOpenedAISpeak, checkOpenedAIServer, isOpenedAIReady, speakOpenedAI } from "./engine-openedai"
import { cancelLocalSpeak, initLocalTts, interruptLocalSpeak, isLocalReady, speakLocal, type ToastClient } from "./local"

export type BackendHandler = {
  init: (config: TtsConfig) => Promise<boolean>
  speak: (text: string, config: TtsConfig, client?: ToastClient) => Promise<void>
  isReady: (config: TtsConfig) => boolean
  cancel: () => void
  interrupt: () => void
}

const createBackendRegistry = (): Record<TtsConfig["backend"], BackendHandler> => ({
  local: {
    init: initLocalTts,
    speak: speakLocal,
    isReady: () => isLocalReady(),
    cancel: () => cancelLocalSpeak(),
    interrupt: () => interruptLocalSpeak(),
  },
  http: {
    init: checkHttpServer,
    speak: speakHttp,
    isReady: (config) => isHttpReady() || (config.fallbackToLocal && isLocalReady()),
    cancel: () => cancelHttpSpeak(),
    interrupt: () => cancelHttpSpeak(),
  },
  openedai: {
    init: checkOpenedAIServer,
    speak: speakOpenedAI,
    isReady: (config) => isOpenedAIReady() || (config.fallbackToLocal && isLocalReady()),
    cancel: () => cancelOpenedAISpeak(),
    interrupt: () => cancelOpenedAISpeak(),
  },
  kokoro: {
    init: checkKokoroServer,
    speak: speakKokoro,
    isReady: (config) => isKokoroReady() || (config.fallbackToLocal && isLocalReady()),
    cancel: () => cancelKokoroSpeak(),
    interrupt: () => cancelKokoroSpeak(),
  },
})

const backendRegistry = createBackendRegistry()

export async function initTts(config: TtsConfig): Promise<boolean> {
  return backendRegistry[config.backend].init(config)
}

export async function speak(text: string, config: TtsConfig, client?: ToastClient): Promise<void> {
  const backend = backendRegistry[config.backend]
  try {
    await backend.speak(text, config, client)
    return
  } catch (error) {
    if (config.fallbackToLocal && isLocalReady() && config.backend !== "local") {
      await backendRegistry.local.speak(text, config, client)
      return
    }
    throw error
  }
}

export function isReady(config: TtsConfig): boolean {
  return backendRegistry[config.backend].isReady(config)
}

export function cancelTts(config: TtsConfig): void {
  backendRegistry[config.backend].cancel()
}

export function interruptTts(config: TtsConfig): void {
  backendRegistry[config.backend].interrupt()
}
