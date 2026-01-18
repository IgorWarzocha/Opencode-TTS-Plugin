/**
 * Initializes the TTS plugin and routes events to the local or HTTP backend.
 * Manages command toggles, session scoping, and prompt injection for TTS mode.
 */

import type { Plugin } from "@opencode-ai/plugin"
import type { Event, Part, UserMessage } from "@opencode-ai/sdk"
import * as path from "path"
import * as url from "url"
import { loadConfig } from "./config"
import { initTts } from "./engine"
import { loadTtsNotice } from "./notice"
import { createSessionGuard } from "./session"
import { normalizeCommandArgs, parseTtsCommand } from "./text"
import type { TtsConfig } from "./types"
import { TOAST_DURATIONS } from "./constants"
import { createCommandHandler, TTS_COMMAND_MARKER, type CommandState } from "./commands"
import { createSpeaker } from "./speaker"

export const TtsReaderPlugin: Plugin = async ({ client }) => {
  const pluginRoot = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "..")
  const config: TtsConfig = await loadConfig()
  const isChildSession = createSessionGuard(client)

  const promptState = {
    buffer: "",
  }

  let activeSessionID: string | null = null
  let latestMessageID: string | null = null
  let latestMessageText: string | null = null
  let lastSpokenMessageID: string | null = null
  let ttsNotice = await loadTtsNotice(pluginRoot)
  let lastCommand: CommandState = null

  const setNotice = (notice: string) => {
    ttsNotice = notice
  }

  const { speakText, speakLatest } = createSpeaker({
    config,
    getLastSpokenMessageID: () => lastSpokenMessageID,
    setLastSpokenMessageID: (id) => {
      lastSpokenMessageID = id
    },
    getLatestMessage: () => ({ id: latestMessageID, text: latestMessageText }),
    client,
  })

  const { apply: applyTtsCommand } = createCommandHandler({
    client,
    pluginRoot,
    config,
    setNotice,
    speakLatest,
  })

  setTimeout(async () => {
    const success = await initTts(config)
    const isGpuBackend = config.backend === "http" || config.backend === "kokoro" || config.backend === "openedai"
    const backendLabel = isGpuBackend ? "HTTP (GPU)" : "Local (CPU)"
    const modeLabel = config.speakOn === "message" ? "per-message" : "on-idle"

    if (success) {
      await client.tui.showToast({
        body: {
          title: "TTS Reader",
          message: `${backendLabel} backend ready (${modeLabel})`,
          variant: "success",
          duration: TOAST_DURATIONS.success,
        },
      })
      return
    }

    let helpMsg: string

    if (config.backend === "kokoro") {
      helpMsg = `Cannot reach ${config.httpUrl}. Start Kokoro-FastAPI:\n• uvicorn kokoro_fastapi.server:app --host 0.0.0.0 --port 8880\n• Or: docker run -d --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest`
    } else if (config.backend === "openedai") {
      helpMsg = `Cannot reach ${config.httpUrl}. Start OpenedAI-Speech server`
    } else if (config.backend === "http") {
      helpMsg = `Cannot reach ${config.httpUrl}. Start your HTTP TTS server or configure correct httpUrl in ~/.config/opencode/tts.jsonc`
    } else {
      helpMsg = "Failed to load TTS. Run: cd .opencode/plugin/tts-reader && bun install"
    }

    await client.tui.showToast({
      body: {
        title: "TTS Reader",
        message: helpMsg,
        variant: "warning",
        duration: TOAST_DURATIONS.warning,
      },
    })
  }, 5000)

  return {
    "chat.message": async (
      input: {
        sessionID: string
        agent?: string
        model?: { providerID: string; modelID: string }
        messageID?: string
        variant?: string
      },
      output: { message: UserMessage; parts: Part[] }
    ) => {
      activeSessionID = input.sessionID

      const hasMarker = output.parts.some((p) => p.type === "text" && p.text.includes(TTS_COMMAND_MARKER))
      if (!hasMarker) return

      if (lastCommand) {
        const { name, args } = lastCommand
        lastCommand = null

        await applyTtsCommand(name, args)

        if (name === "tts-profile") {
          await client.session.prompt({
            path: { id: input.sessionID },
            body: {
              noReply: true,
              agent: input.agent,
              model: input.model,
              parts: [{ type: "text", text: "TTS profile updated.", ignored: true }],
            },
          })

          throw new Error("__TTS_COMMAND_HANDLED__")
        }

        return
      }

      const fullText = output.parts.filter((p) => p.type === "text").map((p) => p.text).join(" ")
      const profileMatch = fullText.match(/\/tts-profile(?:\s+(.*))?/)
      const onMatch = fullText.match(/\/tts-on/)
      const offMatch = fullText.match(/\/tts-off/)

      const cleanedMarkerText = fullText.replaceAll(TTS_COMMAND_MARKER, "").trim()
      const markerOnly = cleanedMarkerText.length === 0

      const bufferedCommand = parseTtsCommand(promptState.buffer)
      const bufferedArgs = bufferedCommand?.startsWith("profile") ? bufferedCommand.slice("profile".length).trim() : null

      if (profileMatch || bufferedArgs !== null || markerOnly) {
        const rawArgs = profileMatch ? profileMatch[1] || "" : bufferedArgs || ""
        const args = normalizeCommandArgs(rawArgs)
        promptState.buffer = ""
        await applyTtsCommand("tts-profile", args)

        await client.session.prompt({
          path: { id: input.sessionID },
          body: {
            noReply: true,
            agent: input.agent,
            model: input.model,
            parts: [{ type: "text", text: "TTS profile updated.", ignored: true }],
          },
        })

        throw new Error("__TTS_COMMAND_HANDLED__")
      }

      if (onMatch) {
        await applyTtsCommand("tts-on", "")
        return
      }

      if (offMatch) {
        await applyTtsCommand("tts-off", "")
        return
      }
    },
    "experimental.chat.system.transform": async (_: { sessionID: string }, output: { system: string[] }) => {
      if (!config.enabled) return
      if (!ttsNotice) return
      if (!activeSessionID) return
      const isChild = await isChildSession(activeSessionID)
      if (isChild) return
      output.system.push(ttsNotice)
    },
    event: async ({ event }: { event: Event }) => {
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
      }

      if (event.type === "command.executed" && event.properties.name.startsWith("tts")) {
        const name = event.properties.name.trim().toLowerCase()
        const args = event.properties.arguments.trim().toLowerCase()
        if (name === "tts-profile") {
          lastCommand = { name, args }
          return
        }
        await applyTtsCommand(name, args)
        return
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
    },
  }
}
