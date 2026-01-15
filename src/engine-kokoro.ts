/**
 * Kokoro-FastAPI HTTP backend client.
 * Implements the OpenAI-compatible /v1/audio/speech endpoint for Kokoro TTS.
 * Supports chunked text with parallel synthesis for gapless playback.
 * See: https://github.com/remsky/Kokoro-FastAPI
 */

import { unlink } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { cancelAudioPlayback, playAudio } from "./local/audio"
import { splitTextIntoChunks } from "./text"
import type { TtsConfig } from "./types"

let serverAvailable = false
let serverChecked = false
let cancelToken = 0

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
  if (serverChecked) return serverAvailable
  if (!config.httpUrl) return false

  try {
    const response = await fetch(`${config.httpUrl}/v1/models`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    })
    serverAvailable = response.ok
  } catch {
    serverAvailable = false
  }

  serverChecked = true
  return serverAvailable
}

async function synthesizeChunk(
  text: string,
  index: number,
  config: TtsConfig
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

export async function speakKokoro(text: string, config: TtsConfig): Promise<void> {
  if (!config.enabled) return
  const trimmed = text.trim()
  if (!trimmed) return
  if (!config.httpUrl) return

  const token = cancelToken
  const chunks = splitTextIntoChunks(trimmed)
  if (chunks.length === 0) return

  const synthesisPromises = chunks.map((chunk, i) => synthesizeChunk(chunk, i, config))

  const files: string[] = []

  const playInOrder = async () => {
    for (let i = 0; i < synthesisPromises.length; i++) {
      if (token !== cancelToken) break

      const audioPath = await synthesisPromises[i]
      files.push(audioPath)

      if (token !== cancelToken) break
      await playAudio(audioPath)
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
  return serverAvailable
}

export function resetKokoroCheck(): void {
  serverChecked = false
  serverAvailable = false
}

async function cleanupFiles(files: string[]): Promise<void> {
  if (files.length === 0) return
  await Promise.allSettled(files.map((f) => unlink(f).catch(() => {})))
}
