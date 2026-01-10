/**
 * TTS Reader Plugin for OpenCode.
 * Reads assistant messages aloud using Kokoro TTS.
 *
 * Features:
 * - Dual backend: local CPU (kokoro-js) or HTTP GPU (Kokoro-FastAPI)
 * - Two speak modes: "message" (each response) or "idle" (only final message on idle)
 * - Automatic model download for local backend (~87MB q8 quantized)
 * - Cross-platform audio playback
 */

import type { Plugin } from "@opencode-ai/plugin"
import { mkdir } from "fs/promises"
import { homedir } from "os"
import * as path from "path"
import * as url from "url"
import { cancelTts, interruptTts, speak, initTts, isReady } from "./engine"
import { DEFAULT_CONFIG, type TtsConfig } from "./types"

export const TtsReaderPlugin: Plugin = async ({ client, $ }) => {
  const pluginRoot = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "..")
  const configPath = path.join(homedir(), ".config", "opencode", "tts.jsonc")

  const stripJsonc = (raw: string): string => {
    const withoutComments = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    return withoutComments.replace(/,\s*([}\]])/g, "$1")
  }

  const defaultConfigText = `// OpenCode TTS Reader configuration (JSONC)
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

  const loadConfig = async (): Promise<TtsConfig> => {
    const file = Bun.file(configPath)
    const exists = await file.exists()
    if (!exists) {
      await mkdir(path.dirname(configPath), { recursive: true })
      await Bun.write(configPath, defaultConfigText)
      return { ...DEFAULT_CONFIG }
    }

    const raw = await file.text().catch(() => "")
    if (!raw) return { ...DEFAULT_CONFIG }

    const cleaned = stripJsonc(raw)
    try {
      const parsed = JSON.parse(cleaned) as Partial<TtsConfig>
      return { ...DEFAULT_CONFIG, ...parsed }
    } catch {
      return { ...DEFAULT_CONFIG }
    }
  }

  const config: TtsConfig = await loadConfig()

  const promptState = {
    buffer: "",
    skipCommandExecuted: false,
    lastToggleSource: "",
    lastToggleTime: 0,
  }

  const sessionCache = new Map<string, boolean>()
  let activeSessionID: string | null = null

  const resolveSessionInfo = (response: unknown): { parentID?: string } | null => {
    if (!response || typeof response !== "object") return null
    if ("data" in response && response.data && typeof response.data === "object") {
      return response.data as { parentID?: string }
    }
    return response as { parentID?: string }
  }

  const isChildSession = async (sessionID: string): Promise<boolean> => {
    const cached = sessionCache.get(sessionID)
    if (cached !== undefined) return cached

    const response = await client.session.get({ path: { id: sessionID } }).catch(() => undefined)
    const info = resolveSessionInfo(response)
    const isChild = Boolean(info && info.parentID)
    sessionCache.set(sessionID, isChild)
    return isChild
  }

  const extractNotice = (raw: string): string => {
    if (!raw) return ""
    if (raw.startsWith("---")) {
      const end = raw.indexOf("\n---", 3)
      if (end !== -1) {
        return raw.slice(end + 4).trim()
      }
    }
    return raw.trim()
  }

  const commandRoot = path.join(pluginRoot, "..", "..", "command")
  const ttsOnPath = path.join(commandRoot, "tts:on.md")
  const ttsModeNotice = extractNotice(
    await Bun.file(ttsOnPath)
      .text()
      .catch(() => ""),
  )

  // Track the latest message's text (overwritten on each new message)
  let latestMessageID: string | null = null
  let latestMessageText: string | null = null
  // Track which message we last spoke (prevents re-speaking same message)
  let lastSpokenMessageID: string | null = null

  // Initialize TTS in background after delay
  setTimeout(async () => {
    const success = await initTts(config)
    const backendLabel = config.backend === "http" ? "HTTP (GPU)" : "Local (CPU)"
    const modeLabel = config.speakOn === "message" ? "per-message" : "on-idle"

    if (success) {
      try {
        await client.tui.showToast({
          body: {
            title: "TTS Reader",
            message: `${backendLabel} backend ready (${modeLabel})`,
            variant: "success",
            duration: 3000,
          },
        })
      } catch {}
    } else {
      const helpMsg =
        config.backend === "http"
          ? `Cannot reach ${config.httpUrl}. Start server: docker run -d --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest`
          : "Failed to load TTS. Run: cd .opencode/plugin/tts-reader && bun install"

      try {
        await client.tui.showToast({
          body: {
            title: "TTS Reader",
            message: helpMsg,
            variant: "warning",
            duration: 7000,
          },
        })
      } catch {}
    }
  }, 5000)

  const extractTextPart = (parts: Array<{ type: string; text?: string }>): string => {
    for (const part of parts) {
      if (part.type === "text" && part.text) {
        return part.text
      }
    }
    return ""
  }

  const parseTtsCommand = (text: string): string | null => {
    const trimmed = text.trim()
    if (!trimmed.startsWith("/tts")) return null
    const tail = trimmed.slice(4).trim()
    if (tail.startsWith(":")) {
      return tail.slice(1).trim()
    }
    return tail
  }

  const applyTtsCommand = async (args: string): Promise<void> => {
    const wantsOn = args.includes("on") || args.includes("enable")
    const wantsOff = args.includes("off") || args.includes("disable")

    let nextEnabled = config.enabled
    if (wantsOn) {
      nextEnabled = true
    } else if (wantsOff) {
      nextEnabled = false
    } else {
      nextEnabled = !config.enabled
    }

    const previous = {
      backend: config.backend,
      maxWorkers: config.maxWorkers,
      httpUrl: config.httpUrl,
    }

    const loaded = await loadConfig()
    Object.assign(config, loaded)
    config.enabled = nextEnabled

    const backendChanged = config.backend !== previous.backend
    const maxWorkersChanged = config.maxWorkers !== previous.maxWorkers
    const httpUrlChanged = config.httpUrl !== previous.httpUrl

    if (!config.enabled) {
      cancelTts(config)
    }

    if (config.enabled) {
      if (backendChanged || maxWorkersChanged || httpUrlChanged) {
        cancelTts(config)
      }
      const ready = await initTts(config)
    }

    if (config.enabled && latestMessageID && latestMessageText && lastSpokenMessageID !== latestMessageID) {
      void speakText(latestMessageID, latestMessageText)
    }

    const status = config.enabled ? "enabled" : "disabled"

    try {
      await client.tui.showToast({
        body: {
          title: "TTS Reader",
          message: `TTS ${status}`,
          variant: config.enabled ? "success" : "warning",
          duration: 2000,
        },
      })
    } catch {}
  }

  // Helper to clean and speak text
  async function speakText(messageID: string, text: string): Promise<void> {
    if (lastSpokenMessageID === messageID) {
      return
    }
    if (!config.enabled) {
      cancelTts(config)
      return
    }
    if (!isReady(config)) {
      return
    }

    if (lastSpokenMessageID && lastSpokenMessageID !== messageID) {
      interruptTts(config)
    }

    if (lastSpokenMessageID && lastSpokenMessageID !== messageID) {
      interruptTts(config)
    }

    lastSpokenMessageID = messageID

    const cleanText = text
      .replace(/```[\s\S]*?```/g, " code block ")
      .replace(/[#*_`]/g, "")
      .trim()

    if (cleanText.length === 0) {
      return
    }

    try {
      await speak(cleanText, config, $)
    } catch (error) {
      // Silently ignore errors
    }
  }

  return {
    "chat.message": async (input) => {
      activeSessionID = input.sessionID
    },
    "experimental.chat.system.transform": async (_, output) => {
      if (!config.enabled) return
      if (!ttsModeNotice) return
      if (!activeSessionID) return
      const isChild = await isChildSession(activeSessionID)
      if (isChild) return
      output.system.push(ttsModeNotice)
    },
    event: async ({ event }) => {
      // Track latest assistant message text (streaming updates)
      if (event.type === "message.part.updated") {
        const part = event.properties.part
        const isChild = await isChildSession(part.sessionID)
        if (isChild) return
        if (part.type === "text" && !part.synthetic && !part.ignored) {
          latestMessageID = part.messageID
          latestMessageText = part.text
        }
      }

      if (event.type === "tui.prompt.append") {
        promptState.buffer = `${promptState.buffer}${event.properties.text}`
      }

      if (event.type === "tui.command.execute") {
        const command = event.properties.command.trim()
        if (command === "prompt.clear") {
          promptState.buffer = ""
        }
        if (command === "prompt.submit") {
          const args = parseTtsCommand(promptState.buffer)
          promptState.buffer = ""
          if (args !== null) {
            promptState.lastToggleSource = "tui.prompt.submit"
            promptState.lastToggleTime = Date.now()
            await applyTtsCommand(args)
            return
          }
        }
        if (command.startsWith("tts")) {
          const rawArgs = command.slice(3).trim().toLowerCase()
          const args = rawArgs.startsWith(":") ? rawArgs.slice(1).trim() : rawArgs
          promptState.skipCommandExecuted = true
          promptState.lastToggleSource = "tui.command.execute"
          promptState.lastToggleTime = Date.now()
          await applyTtsCommand(args)
        }
      }

      // "message" mode: speak when each assistant message completes
      if (config.speakOn === "message" && event.type === "message.updated") {
        const msg = event.properties.info
        const isChild = await isChildSession(msg.sessionID)
        if (isChild) return
        if (msg.role === "assistant" && msg.time.completed) {
          if (latestMessageID === msg.id && latestMessageText) {
            await speakText(msg.id, latestMessageText)
          }
        }
      }

      // "idle" mode: speak only the latest message when session goes idle
      if (config.speakOn === "idle" && event.type === "session.idle") {
        const isChild = await isChildSession(event.properties.sessionID)
        if (isChild) return
        if (latestMessageID && latestMessageText) {
          await speakText(latestMessageID, latestMessageText)
        }
      }

      if (event.type === "command.executed" && event.properties.name.startsWith("tts")) {
        if (promptState.skipCommandExecuted) {
          promptState.skipCommandExecuted = false
          return
        }
        const name = event.properties.name.trim().toLowerCase()
        const argsFromName = name.startsWith("tts:") ? name.slice(4).trim() : ""
        const args = argsFromName || event.properties.arguments.trim().toLowerCase()
        promptState.lastToggleSource = "command.executed"
        promptState.lastToggleTime = Date.now()
        await applyTtsCommand(args)
      }
    },
  }
}
