/**
 * Loads and validates the TTS JSONC configuration from the user's home directory.
 * Ensures defaults are written once and reused across sessions.
 */

import { mkdir } from "fs/promises"
import { homedir } from "os"
import * as path from "path"
import { DEFAULT_CONFIG, type TtsConfig, type TtsProfile } from "./types"

export const configPath = path.join(homedir(), ".config", "opencode", "tts.jsonc")

const stripJsonc = (raw: string): string => {
  const withoutComments = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  return withoutComments.replace(/,\s*([}\]])/g, "$1")
}

const template = `// OpenCode TTS Reader configuration (JSONC)
{
  // Active profile from the "profiles" object below
  "activeProfile": "${DEFAULT_CONFIG.activeProfile}",
  // Enable/disable TTS at startup
  "enabled": ${DEFAULT_CONFIG.enabled},
  // "message" (each response) or "idle" (session idle)
  "speakOn": "${DEFAULT_CONFIG.speakOn}",
  // Fallback to local (CPU) backend if HTTP fails
  "fallbackToLocal": ${DEFAULT_CONFIG.fallbackToLocal},
  // Max local worker processes (0 disables pool)
  "maxWorkers": ${DEFAULT_CONFIG.maxWorkers},

  "profiles": {
    "default": {
      "backend": "local",
      "voice": "af_heart",
      "speed": 1.0
    },
    "openedai": {
      "backend": "openedai",
      // Required: HTTP server URL (e.g., http://localhost:8000)
      "httpUrl": "http://localhost:8000",
      "voice": "alloy",
      "openedaiModel": "tts-1",
      "speed": 1.0,
      "httpFormat": "wav"
    },
    "kokoro-gpu": {
      "backend": "kokoro",
      // Required: Kokoro-FastAPI server URL
      "httpUrl": "http://localhost:8880",
      "voice": "af_heart",
      "speed": 1.0,
      "httpFormat": "wav"
    },
    // Example: OpenAI API (or any OpenAI-compatible provider)
    "openai": {
      "backend": "http",
      // Required: OpenAI API base URL
      "httpUrl": "https://api.openai.com",
      "httpHeaders": {
        "Authorization": "Bearer sk-your-api-key-here"
      },
      "model": "tts-1",
      "voice": "alloy",
      "speed": 1.0,
      "httpFormat": "mp3",
      // Optional: provider-specific options passed to the request body
      // NOTE: These are passed directly without validation.
      "providerOptions": {
        // "response_format": "mp3"
      }
    }
  }
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

  const profiles = parsed.profiles || DEFAULT_CONFIG.profiles
  const activeProfileName = parsed.activeProfile || DEFAULT_CONFIG.activeProfile
  const profile = profiles[activeProfileName] || DEFAULT_CONFIG.profiles.default

  // Merge: Defaults -> Profile settings -> Top-level overrides
  const config: TtsConfig = {
    ...DEFAULT_CONFIG,
    ...profile,
    ...parsed,
    profiles, // Ensure profiles are preserved
  }

  return config
}

export function mergeConfig(base: TtsConfig, profile: TtsProfile, name: string): TtsConfig {
  return {
    ...base,
    ...profile,
    activeProfile: name,
    profiles: base.profiles // Preserve existing profiles map
  }
}
