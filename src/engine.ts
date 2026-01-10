/**
 * TTS engine router that dispatches to local or HTTP backends.
 * Keeps local generation separate to allow worker-based parallelism.
 * Exposes readiness checks for the plugin controller.
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

export async function speak(text: string, config: TtsConfig, $: unknown): Promise<void> {
  if (config.backend === "http") {
    await speakHttp(text, config, $)
    return
  }
  await speakLocal(text, config)
}

export function isReady(config: TtsConfig): boolean {
  if (config.backend === "http") {
    return isHttpReady()
  }
  return isLocalReady()
}

export function cancelTts(config: TtsConfig): void {
  if (config.backend === "http") return
  cancelLocalSpeak()
}

export function interruptTts(config: TtsConfig): void {
  if (config.backend === "http") return
  interruptLocalSpeak()
}
