/**
 * Defines the TTS configuration and voice list for the plugin.
 * Aligns config defaults with the JSONC file written on first run.
 */

export type TtsBackend = "local" | "http"
export type TtsSpeakMode = "idle" | "message"

/** Options passed directly to the TTS provider (OpenAI-compatible) */
export interface ProviderOptions {
  [key: string]: unknown
}

/** Individual TTS profile configuration fields */
export interface TtsProfile {
  /** TTS backend: "local" for CPU (kokoro-js), "http" for generic OpenAI-compatible (GPU) */
  backend: TtsBackend
  /** HTTP server URL when backend is "http" (e.g., "http://localhost:8880") */
  httpUrl?: string
  /** Voice to use for synthesis */
  voice?: string
  /** Speech speed multiplier */
  speed?: number
  /** Response format for HTTP backend */
  httpFormat?: "wav" | "mp3" | "pcm"
  /** Language code for text processing */
  language?: string
  /** Provider-specific options passed to the backend */
  providerOptions?: ProviderOptions
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
