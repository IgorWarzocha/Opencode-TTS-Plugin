/**
 * Initializes the TTS plugin and routes events to the local or HTTP backend.
 * Manages command toggles, session scoping, and prompt injection for TTS mode.
 */

import type { Plugin } from "@opencode-ai/plugin"
import * as path from "path"
import * as url from "url"
import { loadConfig } from "./config"
import { cancelTts, interruptTts, initTts, isReady, speak } from "./engine"
import { resetHttpCheck } from "./engine-http"
import { resetKokoroCheck } from "./engine-kokoro"
import { resetOpenedAICheck } from "./engine-openedai"
import { loadTtsNotice } from "./notice"
import { createSessionGuard } from "./session"
import { normalizeCommandArgs, parseTtsCommand } from "./text"
import type { TtsConfig } from "./types"

export const TtsReaderPlugin: Plugin = async ({ client }) => {
  const pluginRoot = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "..")
  const config: TtsConfig = await loadConfig()
  const ttsNotice = await loadTtsNotice(pluginRoot)
  const isChildSession = createSessionGuard(client)

  const promptState = {
    buffer: "",
    skipCommandExecuted: false,
  }

  let activeSessionID: string | null = null
  let latestMessageID: string | null = null
  let latestMessageText: string | null = null
  let lastSpokenMessageID: string | null = null

  setTimeout(async () => {
    const success = await initTts(config)
    const backendLabel = config.backend === "http" ? "HTTP (GPU)" : "Local (CPU)"
    const modeLabel = config.speakOn === "message" ? "per-message" : "on-idle"

    if (success) {
      await client.tui.showToast({
        body: {
          title: "TTS Reader",
          message: `${backendLabel} backend ready (${modeLabel})`,
          variant: "success",
          duration: 3000,
        },
      })
      return
    }

    const helpMsg =
      config.backend === "http"
        ? `Cannot reach ${config.httpUrl}. Start server: docker run -d --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest`
        : "Failed to load TTS. Run: cd .opencode/plugin/tts-reader && bun install"

    await client.tui.showToast({
      body: {
        title: "TTS Reader",
        message: helpMsg,
        variant: "warning",
        duration: 7000,
      },
    })
  }, 5000)

  const applyTtsCommand = async (args: string): Promise<void> => {
    if (args.startsWith("profile ")) {
      const profileName = args.slice(8).trim()
      const loaded = await loadConfig()
      const profiles = loaded.profiles || config.profiles
      
      if (!profiles[profileName]) {
        await client.tui.showToast({
          body: {
            title: "TTS Reader",
            message: `Profile '${profileName}' not found in tts.jsonc`,
            variant: "warning",
            duration: 3000,
          },
        })
        return
      }

      const profileToApply = profiles[profileName]
      resetHttpCheck()
      resetKokoroCheck()
      resetOpenedAICheck()
      
      // Update our live config object
      const wasEnabled = config.enabled
      Object.assign(config, loaded, profileToApply)
      config.activeProfile = profileName
      config.enabled = wasEnabled

      await initTts(config)
      
      await client.tui.showToast({
        body: {
          title: "TTS Reader",
          message: `Switched to profile: ${profileName}`,
          variant: "success",
          duration: 2000,
        },
      })
      return
    }

    const wantsOn = args.includes("on") || args.includes("enable")
    const wantsOff = args.includes("off") || args.includes("disable")

    let nextEnabled = config.enabled
    if (wantsOn) nextEnabled = true
    if (wantsOff) nextEnabled = false
    if (!wantsOn && !wantsOff) nextEnabled = !config.enabled

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
        resetHttpCheck()
        resetOpenedAICheck()
      }
      await initTts(config)
    }

    if (config.enabled && latestMessageID && latestMessageText && lastSpokenMessageID !== latestMessageID) {
      void speakText(latestMessageID, latestMessageText)
    }

    const status = config.enabled ? "enabled" : "disabled"
    await client.tui.showToast({
      body: {
        title: "TTS Reader",
        message: `TTS ${status}`,
        variant: config.enabled ? "success" : "warning",
        duration: 2000,
      },
    })
  }

  const speakText = async (messageID: string, text: string): Promise<void> => {
    if (lastSpokenMessageID === messageID) return
    if (!config.enabled) {
      cancelTts(config)
      return
    }
    if (!isReady(config)) return

    if (lastSpokenMessageID && lastSpokenMessageID !== messageID) {
      interruptTts(config)
    }

    lastSpokenMessageID = messageID

    const cleanText = text
      .replace(/```[\s\S]*?```/g, " code block ")
      .replace(/[#*_`]/g, "")
      .trim()

    if (cleanText.length === 0) return
    try {
      await speak(cleanText, config)
    } catch (e) {
      await client.tui.showToast({
        body: {
          title: "TTS Reader",
          message: "Failed to synthesize speech (all backends failed)",
          variant: "error",
          duration: 3000,
        },
      })
    }
  }

  return {
    "chat.message": async (input) => {
      activeSessionID = input.sessionID
    },
    "experimental.chat.system.transform": async (_, output) => {
      if (!config.enabled) return
      if (!ttsNotice) return
      if (!activeSessionID) return
      const isChild = await isChildSession(activeSessionID)
      if (isChild) return
      output.system.push(ttsNotice)
    },
    event: async ({ event }) => {
      if (event.type === "message.part.updated") {
        const part = event.properties.part
        const isChild = await isChildSession(part.sessionID)
        if (isChild) return
        if (part.type !== "text" || part.synthetic || part.ignored) return
        latestMessageID = part.messageID
        latestMessageText = part.text
        return
      }

      if (event.type === "tui.prompt.append") {
        promptState.buffer = `${promptState.buffer}${event.properties.text}`
        return
      }

      if (event.type === "tui.command.execute") {
        const command = event.properties.command.trim()
        if (command === "prompt.clear") {
          promptState.buffer = ""
          return
        }
        if (command === "prompt.submit") {
          const args = parseTtsCommand(promptState.buffer)
          promptState.buffer = ""
          if (args !== null) {
            await applyTtsCommand(args)
            return
          }
        }
        if (command.startsWith("tts")) {
          promptState.skipCommandExecuted = true
          await applyTtsCommand(normalizeCommandArgs(command.slice(3)))
          return
        }
      }

      if (config.speakOn === "message" && event.type === "message.updated") {
        const msg = event.properties.info
        const isChild = await isChildSession(msg.sessionID)
        if (isChild) return
        if (msg.role !== "assistant" || !msg.time.completed) return
        if (!latestMessageID || !latestMessageText) return
        if (latestMessageID !== msg.id) return
        await speakText(msg.id, latestMessageText)
        return
      }

      if (config.speakOn === "idle" && event.type === "session.idle") {
        const isChild = await isChildSession(event.properties.sessionID)
        if (isChild) return
        if (!latestMessageID || !latestMessageText) return
        await speakText(latestMessageID, latestMessageText)
        return
      }

      if (event.type === "command.executed" && event.properties.name.startsWith("tts")) {
        if (promptState.skipCommandExecuted) {
          promptState.skipCommandExecuted = false
          return
        }
        const name = event.properties.name.trim().toLowerCase()
        const argsFromName = name.startsWith("tts:") ? name.slice(4).trim() : ""
        const args = argsFromName || event.properties.arguments.trim().toLowerCase()
        await applyTtsCommand(args)
      }
    },
  }
}
