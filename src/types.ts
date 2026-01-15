/**
 * Defines the TTS configuration and voice list for the plugin.
 * Aligns config defaults with the JSONC file written on first run.
 */

export type TtsBackend = "local" | "http" | "openedai" | "kokoro"
export type TtsSpeakMode = "idle" | "message"

/** Options passed directly to the TTS provider (OpenAI-compatible) */
export interface ProviderOptions {
  [key: string]: unknown
}

/** Individual TTS profile configuration fields */
export interface TtsProfile {
  /** TTS backend: "local" (kokoro-js CPU), "http" (generic OpenAI-compatible), "openedai" (OpenedAI-Speech), "kokoro" (Kokoro-FastAPI) */
  backend: TtsBackend
  /** HTTP server URL when backend is "http", "openedai", or "kokoro" (e.g., "http://localhost:8000") */
  httpUrl?: string
  /** Custom endpoint path (default: /v1/audio/speech) */
  httpEndpoint?: string
  /** Custom HTTP headers for auth (e.g., {"Authorization": "Bearer sk-xxx"}) */
  httpHeaders?: Record<string, string>
  /** Model name to use (default varies by backend) */
  model?: string
  /** Voice to use for synthesis */
  voice?: string
  /** Speech speed multiplier */
  speed?: number
  /** Response format for HTTP backend */
  httpFormat?: "wav" | "mp3" | "pcm"
  /** Language code for text processing */
  language?: string
  /** Provider-specific options passed to the request body */
  providerOptions?: ProviderOptions
  /** OpenedAI model: "tts-1" or "tts-1-hd" (openedai only, deprecated - use model instead) */
  openedaiModel?: "tts-1" | "tts-1-hd"
}

/** Complete configuration including runtime state and all profiles */
export type TtsConfig = TtsProfile & {
  /** Active profile name */
  activeProfile: string
  /** Profiles configuration */
  profiles: Record<string, TtsProfile>
  /** When to speak: "idle" (session idle) or "message" (each message completes) */
  speakOn: TtsSpeakMode
  /** Enable/disable TTS */
  enabled: boolean
  /** Fallback to local backend if HTTP fails */
  fallbackToLocal: boolean
  /** Max local worker processes (0 disables pool) */
  maxWorkers: number
}

export const DEFAULT_CONFIG: TtsConfig = {
  activeProfile: "default",
  profiles: {
    default: {
      backend: "local",
      voice: "af_heart",
      speed: 1.0,
    },
  },
  backend: "local", // Required by intersection but will be overwritten by active profile
  speakOn: "message",
  enabled: false,
  fallbackToLocal: true,
  maxWorkers: 2,
}

export const AVAILABLE_VOICES = [
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

export type VoiceName = (typeof AVAILABLE_VOICES)[number]
