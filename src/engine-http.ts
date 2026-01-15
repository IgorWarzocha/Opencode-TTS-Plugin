/**
 * Generic OpenAI-compatible HTTP backend client.
 * Supports chunked text with parallel synthesis for gapless playback.
 * Handles providerOptions for advanced features like voice cloning.
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

export async function checkHttpServer(config: TtsConfig): Promise<boolean> {
  if (serverChecked) return serverAvailable
  if (!config.httpUrl) return false

  try {
    const modelsUrl = `${config.httpUrl}/v1/models`
    const response = await fetch(modelsUrl, {
      method: "GET",
      headers: config.httpHeaders || {},
      signal: AbortSignal.timeout(3000),
    })
    serverAvailable = response.ok
  } catch {
    try {
      const response = await fetch(config.httpUrl, {
        method: "HEAD",
        headers: config.httpHeaders || {},
        signal: AbortSignal.timeout(3000),
      })
      serverAvailable = response.ok
    } catch {
      serverAvailable = false
    }
  }

  serverChecked = true
  return serverAvailable
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

export async function speakHttp(text: string, config: TtsConfig): Promise<void> {
  if (!config.enabled) return
  const trimmed = text.trim()
  if (!trimmed) return
  if (!config.httpUrl) return

  const token = cancelToken
  const chunks = splitTextIntoChunks(trimmed)
  if (chunks.length === 0) return

  const providerOptions: Record<string, unknown> = { ...(config.providerOptions || {}) }

  if (
    typeof providerOptions.speaker_wav === "string" &&
    (await Bun.file(providerOptions.speaker_wav as string).exists())
  ) {
    try {
      const file = Bun.file(providerOptions.speaker_wav as string)
      const arrayBuffer = await file.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString("base64")
      providerOptions.speaker_wav = base64
    } catch (e) {
      console.warn(`[TTS] Failed to read speaker_wav file: ${providerOptions.speaker_wav}`, e)
    }
  }

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
      await playAudio(audioPath)
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
  return serverAvailable
}

export function resetHttpCheck(): void {
  serverChecked = false
  serverAvailable = false
}

async function cleanupFiles(files: string[]): Promise<void> {
  if (files.length === 0) return
  await Promise.allSettled(files.map((f) => unlink(f).catch(() => {})))
}
