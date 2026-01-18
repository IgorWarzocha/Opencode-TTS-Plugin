/**
 * Shared HTTP backend helpers for OpenAI-compatible TTS endpoints.
 * Consolidates server checks, file cleanup, and provider option normalization.
 */

import { unlink } from "fs/promises"
import { SERVER_TIMEOUT_MS, TOAST_DURATIONS } from "../constants"
import type { ToastClient } from "../local"

export type ServerCheckState = {
  available: boolean
  checked: boolean
}

export const createServerCheck = () => {
  const state: ServerCheckState = { available: false, checked: false }

  const check = async (
    url?: string,
    headers?: Record<string, string>,
    fallbackUrl?: string
  ): Promise<boolean> => {
    if (state.checked) return state.available
    if (!url) return false

    try {
      const response = await fetch(fallbackUrl ?? `${url}/v1/models`, {
        method: "GET",
        headers: headers || {},
        signal: AbortSignal.timeout(SERVER_TIMEOUT_MS),
      })
      state.available = response.ok
    } catch {
      if (fallbackUrl) {
        state.available = false
      } else {
        try {
          const response = await fetch(url, {
            method: "HEAD",
            headers: headers || {},
            signal: AbortSignal.timeout(SERVER_TIMEOUT_MS),
          })
          state.available = response.ok
        } catch {
          state.available = false
        }
      }
    }

    state.checked = true
    return state.available
  }

  const reset = () => {
    state.available = false
    state.checked = false
  }

  return { state, check, reset }
}

export const cleanupFiles = async (files: string[]): Promise<void> => {
  if (files.length === 0) return
  await Promise.allSettled(files.map((file) => unlink(file).catch(() => {})))
}

export const normalizeProviderOptions = async (
  options: Record<string, unknown> | undefined,
  client?: ToastClient
): Promise<Record<string, unknown>> => {
  const providerOptions: Record<string, unknown> = { ...(options || {}) }
  const speaker = providerOptions.speaker_wav

  if (typeof speaker !== "string") return providerOptions

  try {
    const file = Bun.file(speaker)
    if (!(await file.exists())) return providerOptions
    const arrayBuffer = await file.arrayBuffer()
    providerOptions.speaker_wav = Buffer.from(arrayBuffer).toString("base64")
  } catch {
    if (client?.tui) {
      await client.tui.showToast({
        body: {
          title: "TTS Reader",
          message: `Unable to read speaker_wav file: ${speaker}`,
          variant: "warning",
          duration: TOAST_DURATIONS.warning,
        },
      })
    }
  }

  return providerOptions
}
