/**
 * Applies TTS command changes to runtime configuration.
 * Handles profile switching and toggling enabled state.
 */

import { loadConfig } from "../config"
import { resetHttpCheck } from "../engine-http"
import { resetKokoroCheck } from "../engine-kokoro"
import { resetOpenedAICheck } from "../engine-openedai"
import { initTts, cancelTts } from "../engine"
import { loadTtsNotice } from "../notice"
import type { TtsConfig } from "../types"
import { TOAST_DURATIONS } from "../constants"

export type CommandDependencies = {
  client: {
    tui: {
      showToast: (options: {
        body: {
          title?: string
          message: string
          variant: "info" | "success" | "warning" | "error"
          duration?: number
        }
      }) => Promise<unknown>
    }
  }
  pluginRoot: string
  config: TtsConfig
  setNotice: (notice: string) => void
  speakLatest: () => void
}

export const createCommandHandler = (deps: CommandDependencies) => {
  const { client, pluginRoot, config, setNotice, speakLatest } = deps

  const apply = async (name: string, args: string): Promise<void> => {
    if (name === "tts-profile" || args.startsWith("profile ")) {
      const profileName = name === "tts-profile" ? args.trim() : args.slice(8).trim()
      const loaded = await loadConfig()
      const profiles = loaded.profiles

      if (!profiles || !profiles[profileName]) {
        await client.tui.showToast({
          body: {
            title: "TTS Reader",
            message: `Profile '${profileName}' not found in tts.jsonc`,
            variant: "warning",
            duration: TOAST_DURATIONS.warning,
          },
        })
        return
      }

      const profileToApply = profiles[profileName]
      if (!profileToApply.backend) {
        await client.tui.showToast({
          body: {
            title: "TTS Reader",
            message: `Profile '${profileName}' is missing required 'backend' field`,
            variant: "warning",
            duration: TOAST_DURATIONS.warning,
          },
        })
        return
      }

      const needsUrl = ["http", "openedai", "kokoro"].includes(profileToApply.backend)
      if (needsUrl && !profileToApply.httpUrl) {
        await client.tui.showToast({
          body: {
            title: "TTS Reader",
            message: `Profile '${profileName}' requires 'httpUrl' for ${profileToApply.backend} backend`,
            variant: "warning",
            duration: TOAST_DURATIONS.warning,
          },
        })
        return
      }

      resetHttpCheck()
      resetKokoroCheck()
      resetOpenedAICheck()

      const wasEnabled = config.enabled
      Object.assign(config, loaded, profileToApply)
      config.activeProfile = profileName
      config.enabled = wasEnabled
      setNotice(await loadTtsNotice(pluginRoot))

      await initTts(config)

      await client.tui.showToast({
        body: {
          title: "TTS Reader",
          message: `Switched to profile: ${profileName}`,
          variant: "success",
          duration: TOAST_DURATIONS.success,
        },
      })
      return
    }

    const wantsOn = name === "tts-on" || args.includes("on") || args.includes("enable")
    const wantsOff = name === "tts-off" || args.includes("off") || args.includes("disable")

    let nextEnabled = config.enabled
    if (wantsOn) nextEnabled = true
    if (wantsOff) nextEnabled = false
    if (!wantsOn && !wantsOff && (name === "tts-toggle" || args.includes("toggle"))) nextEnabled = !config.enabled
    if (!wantsOn && !wantsOff && name === "tts") nextEnabled = !config.enabled

    const previous = {
      backend: config.backend,
      maxWorkers: config.maxWorkers,
      httpUrl: config.httpUrl,
    }

    const loaded = await loadConfig()
    Object.assign(config, loaded)
    config.enabled = nextEnabled
    setNotice(await loadTtsNotice(pluginRoot))

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
        resetKokoroCheck()
      }
      await initTts(config)
    }

    if (config.enabled) {
      speakLatest()
    }

    const status = config.enabled ? "enabled" : "disabled"
    if (name !== "tts-on" && name !== "tts-off" && name !== "tts-profile") {
      await client.tui.showToast({
        body: {
          title: "TTS Reader",
          message: `TTS ${status}`,
          variant: config.enabled ? "success" : "warning",
          duration: config.enabled ? TOAST_DURATIONS.success : TOAST_DURATIONS.warning,
        },
      })
    }
  }

  return { apply }
}
