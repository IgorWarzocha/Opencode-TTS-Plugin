/**
 * Generic OpenAI-compatible HTTP backend client.
 * Supports chunked text with parallel synthesis for gapless playback.
 * Handles providerOptions for advanced features like voice cloning.
 */

import { tmpdir } from "os"
import { join } from "path"
import { cancelAudioPlayback, playAudio, type ToastClient } from "./local/audio"
import { splitTextIntoChunks } from "./text"
import type { TtsConfig } from "./types"
import { cleanupFiles, createServerCheck, normalizeProviderOptions } from "./backends"

let cancelToken = 0
const serverCheck = createServerCheck()

export async function checkHttpServer(config: TtsConfig): Promise<boolean> {
  return serverCheck.check(config.httpUrl, config.httpHeaders)
}

async function synthesizeChunk(
  text: string,
  index: number,
  config: TtsConfig,
  providerOptions: Record<string, unknown>
): Promise<string> {
  const endpoint = config.httpEndpoint || "/v1/audio/speech"
  const url = `${config.httpUrl}${endpoint}`

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.httpHeaders || {}),
    },
    body: JSON.stringify({
      model: config.model || "tts-1",
      voice: config.voice || "alloy",
      input: text,
      speed: config.speed || 1.0,
      response_format: config.httpFormat || "wav",
      ...providerOptions,
    }),
  })

  if (!response.ok) {
    throw new Error(`HTTP backend error: ${response.status} ${response.statusText}`)
  }

  const audioBuffer = await response.arrayBuffer()
  const ext = config.httpFormat === "mp3" ? "mp3" : "wav"
  const audioPath = join(tmpdir(), `opencode-tts-${Date.now()}-${index}.${ext}`)

  await Bun.write(audioPath, audioBuffer)
  return audioPath
}

export async function speakHttp(text: string, config: TtsConfig, client?: ToastClient): Promise<void> {
  if (!config.enabled) return
  const trimmed = text.trim()
  if (!trimmed) return
  if (!config.httpUrl) return

  const token = cancelToken
  const chunks = splitTextIntoChunks(trimmed)
  if (chunks.length === 0) return

  const providerOptions = await normalizeProviderOptions(config.providerOptions, client)

  const synthesisPromises = chunks.map((chunk, i) =>
    synthesizeChunk(chunk, i, config, providerOptions)
  )

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

export function cancelHttpSpeak(): void {
  cancelToken += 1
  cancelAudioPlayback()
}

export function isHttpReady(): boolean {
  return serverCheck.state.available
}

export function resetHttpCheck(): void {
  serverCheck.reset()
}
