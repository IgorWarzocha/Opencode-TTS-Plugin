/**
 * src/engine-http.ts
 * Sends synthesis requests to a Kokoro-FastAPI server.
 * Saves the response to a temp file for playback.
 */

import { tmpdir } from "os"
import { join } from "path"
import { playAudio } from "./local/audio"
import type { TtsConfig } from "./types"

let serverAvailable = false
let serverChecked = false

export async function checkHttpServer(config: TtsConfig): Promise<boolean> {
  if (serverChecked) return serverAvailable

  const response = await fetch(`${config.httpUrl}/v1/models`, {
    method: "GET",
    signal: AbortSignal.timeout(3000),
  })
  serverAvailable = response.ok
  serverChecked = true
  return serverAvailable
}

export async function speakHttp(text: string, config: TtsConfig): Promise<void> {
  if (!config.enabled) return
  if (!text || text.trim().length === 0) return

  const response = await fetch(`${config.httpUrl}/v1/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "kokoro",
      voice: config.voice,
      input: text,
      speed: config.speed,
      response_format: config.httpFormat,
    }),
  })

  if (!response.ok) return

  const audioBuffer = await response.arrayBuffer()
  const ext = config.httpFormat === "mp3" ? "mp3" : "wav"
  const audioPath = join(tmpdir(), `opencode-tts-${Date.now()}.${ext}`)

  await Bun.write(audioPath, audioBuffer)
  await playAudio(audioPath)
}

export function isHttpReady(): boolean {
  return serverAvailable
}

export function resetHttpCheck(): void {
  serverChecked = false
  serverAvailable = false
}
