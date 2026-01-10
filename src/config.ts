/**
 * src/config.ts
 * Loads and validates the TTS JSONC configuration from the user's home directory.
 * Ensures defaults are written once and reused across sessions.
 */

import { mkdir } from "fs/promises"
import { homedir } from "os"
import * as path from "path"
import { DEFAULT_CONFIG, type TtsConfig } from "./types"

export const configPath = path.join(homedir(), ".config", "opencode", "tts.jsonc")

const stripJsonc = (raw: string): string => {
  const withoutComments = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  return withoutComments.replace(/,\s*([}\]])/g, "$1")
}

const template = `// OpenCode TTS Reader configuration (JSONC)
{
  // Enable/disable TTS at startup
  "enabled": ${DEFAULT_CONFIG.enabled},
  // "local" (CPU) or "http" (Kokoro-FastAPI)
  "backend": "${DEFAULT_CONFIG.backend}",
  // Kokoro-FastAPI URL when backend is http
  "httpUrl": "${DEFAULT_CONFIG.httpUrl}",
  // Response format: "wav", "mp3", or "pcm"
  "httpFormat": "${DEFAULT_CONFIG.httpFormat}",
  // "message" (each response) or "idle" (session idle)
  "speakOn": "${DEFAULT_CONFIG.speakOn}",
  // Voice ID
  "voice": "${DEFAULT_CONFIG.voice}",
  // Playback speed (0.5 - 2.0)
  "speed": ${DEFAULT_CONFIG.speed},
  // Max local worker processes (0 disables pool)
  "maxWorkers": ${DEFAULT_CONFIG.maxWorkers}
}
`

export async function loadConfig(): Promise<TtsConfig> {
  const file = Bun.file(configPath)
  const exists = await file.exists()
  if (!exists) {
    await mkdir(path.dirname(configPath), { recursive: true })
    await Bun.write(configPath, template)
    return { ...DEFAULT_CONFIG }
  }

  const raw = await file.text()
  const cleaned = stripJsonc(raw)
  const parsed = JSON.parse(cleaned) as Partial<TtsConfig>
  return { ...DEFAULT_CONFIG, ...parsed }
}
