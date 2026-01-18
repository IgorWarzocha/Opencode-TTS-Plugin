/**
 * Kokoro-FastAPI HTTP backend client.
 * Implements the OpenAI-compatible /v1/audio/speech endpoint for Kokoro TTS.
 * Supports chunked text with parallel synthesis for gapless playback.
 * See: https://github.com/remsky/Kokoro-FastAPI
 */

import { tmpdir } from "os"
import { join } from "path"
import { cancelAudioPlayback, playAudio, type ToastClient } from "./local/audio"
import { splitTextIntoChunks } from "./text"
import type { TtsConfig } from "./types"
import { cleanupFiles, createServerCheck, normalizeProviderOptions } from "./backends"

let cancelToken = 0
const serverCheck = createServerCheck()

/** Kokoro voices (same as local kokoro-js) */
export const KOKORO_VOICES = [
  "af_heart",
  "af_bella",
  "af_nicole",
  "af_sarah",
  "af_sky",
  "am_adam",
  "am_michael",
  "bf_emma",
  "bf_isabella",
  "bm_george",
  "bm_lewis",
] as const

export type KokoroVoice = (typeof KOKORO_VOICES)[number]

export async function checkKokoroServer(config: TtsConfig): Promise<boolean> {
  return serverCheck.check(config.httpUrl)
}

async function synthesizeChunk(
  text: string,
  index: number,
  config: TtsConfig,
  providerOptions: Record<string, unknown>
): Promise<string> {
  const response = await fetch(`${config.httpUrl}/v1/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: text,
      model: "kokoro",
      voice: config.voice || "af_heart",
      speed: config.speed || 1.0,
      response_format: config.httpFormat || "wav",
      ...providerOptions,
    }),
  })

  if (!response.ok) {
    throw new Error(`Kokoro HTTP error: ${response.status} ${response.statusText}`)
  }

  const audioBuffer = await response.arrayBuffer()
  const ext = config.httpFormat === "mp3" ? "mp3" : "wav"
  const audioPath = join(tmpdir(), `opencode-tts-${Date.now()}-${index}.${ext}`)

  await Bun.write(audioPath, audioBuffer)
  return audioPath
}

export async function speakKokoro(text: string, config: TtsConfig, client?: ToastClient): Promise<void> {
  if (!config.enabled) return
  const trimmed = text.trim()
  if (!trimmed) return
  if (!config.httpUrl) return

  const token = cancelToken
  const chunks = splitTextIntoChunks(trimmed)
  if (chunks.length === 0) return

  const providerOptions = await normalizeProviderOptions(config.providerOptions, client)
  const synthesisPromises = chunks.map((chunk, i) => synthesizeChunk(chunk, i, config, providerOptions))

  const files: string[] = []

  const playInOrder = async () => {
    for (let i = 0; i < synthesisPromises.length; i++) {
      if (token !== cancelToken) break

      const audioPath = await synthesisPromises[i]
      files.push(audioPath)

      if (token !== cancelToken) break
      await playAudio(audioPath, client)
    }
  }

  await playInOrder().finally(async () => {
    await cleanupFiles(files)
  })
}

export function cancelKokoroSpeak(): void {
  cancelToken += 1
  cancelAudioPlayback()
}

export function isKokoroReady(): boolean {
  return serverCheck.state.available
}

export function resetKokoroCheck(): void {
  serverCheck.reset()
}
