/**
 * Writes WAV audio to temp files and plays it through system players.
 * Tracks the active player process so playback can be interrupted.
 * Uses cascading fallbacks prioritizing OS-bundled tools, then common third-party options.
 */

import { tmpdir } from "os"
import { join } from "path"
import type { Subprocess } from "bun"

let currentProcess: Subprocess | null = null
let lastWorkingPlayer: string | null = null

export type ToastClient = {
  tui: {
    showToast: (options: {
      body: {
        title?: string
        message: string
        variant: "info" | "success" | "warning" | "error"
        duration?: number
      }
    }) => Promise<void>
  }
}

export async function writeTempWav(samples: Float32Array, sampleRate: number, index: number): Promise<string> {
  const filePath = join(tmpdir(), `opencode-tts-${Date.now()}-${index}.wav`)
  await writeWav(filePath, samples, sampleRate)
  return filePath
}

export async function playAudio(filePath: string, client?: ToastClient): Promise<void> {
  const platform = process.platform

  // macOS fallbacks: ffplay (robust) → afplay (built-in)
  if (platform === "darwin") {
    const players = [
      { cmd: ["ffplay", "-autoexit", "-nodisp", "-loglevel", "quiet", filePath], name: "ffplay" },
      { cmd: ["afplay", filePath], name: "afplay" },
    ]
    return await tryPlayers(players, platform, client)
  }

  // Windows fallbacks: ffplay (permissive) → Media.SoundPlayer (built-in, strict) → wmplayer
  if (platform === "win32") {
    const players = [
      {
        cmd: ["ffplay", "-autoexit", "-nodisp", "-loglevel", "quiet", filePath],
        name: "ffplay"
      },
      {
        cmd: ["powershell", "-c", `(New-Object Media.SoundPlayer '${filePath}').PlaySync()`],
        name: "Media.SoundPlayer"
      },
      {
        cmd: ["wmplayer", "/close", "/prefetch:1", filePath],
        name: "Windows Media Player"
      },
    ]
    return await tryPlayers(players, platform, client)
  }

  // Linux fallbacks: ffplay (robust) → mpv → paplay (PulseAudio) → aplay (ALSA)
  const players = [
    { cmd: ["ffplay", "-autoexit", "-nodisp", "-loglevel", "quiet", filePath], name: "ffplay" },
    { cmd: ["mpv", "--no-video", "--no-terminal", filePath], name: "mpv" },
    { cmd: ["paplay", filePath], name: "paplay" },
    { cmd: ["aplay", filePath], name: "aplay" },
  ]
  return await tryPlayers(players, platform, client)
}

async function tryPlayers(
  players: Array<{ cmd: string[]; name: string }>,
  platform: string,
  client?: ToastClient
): Promise<void> {
  // Try each player in order
  const errors: string[] = []
  for (const player of players) {
    const status = await runCommand(player.cmd)
    if (status === 0) {
      return
    }
    errors.push(player.name)
  }

  // All players failed - show helpful error message
  const errorMsg = getInstallHelp(platform, errors)
  if (client?.tui) {
    try {
      await client.tui.showToast({
        body: {
          title: "TTS Audio Playback Failed",
          message: errorMsg,
          variant: "error",
          duration: 8000,
        },
      })
    } catch {
      // Ignore toast errors - TUI may not be available
    }
  }
  throw new Error(`All audio players failed: ${errors.join(", ")}`)
}

function getInstallHelp(platform: string, failedPlayers: string[]): string {
  if (platform === "darwin") {
    if (failedPlayers.includes("ffplay")) {
      return "TTS audio failed. Install ffmpeg: brew install ffmpeg"
    }
    return "TTS audio playback failed. Try: brew install ffmpeg"
  }

  if (platform === "win32") {
    if (failedPlayers.includes("ffplay")) {
      return "TTS audio failed. Install ffmpeg: winget install ffmpeg"
    }
    return "TTS audio playback failed. Try: winget install ffmpeg.Gyan"
  }

  if (platform === "linux") {
    if (failedPlayers.includes("paplay") && failedPlayers.includes("aplay")) {
      return "TTS audio failed. Install: sudo apt install pulseaudio-utils alsa-utils"
    }
    if (failedPlayers.includes("ffplay") && failedPlayers.includes("mpv")) {
      return "TTS audio failed. Install: sudo apt install ffmpeg"
    }
    return "TTS audio playback failed. Install: sudo apt install pulseaudio-utils alsa-utils ffmpeg"
  }

  return "TTS audio playback failed. Install ffmpeg or a system audio player"
}

export function cancelAudioPlayback(): void {
  if (!currentProcess) return
  currentProcess.kill()
  currentProcess = null
}

async function runCommand(cmd: string[]): Promise<number> {
  try {
    const proc = Bun.spawn(cmd, { stderr: "ignore", stdout: "ignore" }) as Subprocess
    currentProcess = proc
    const code = await proc.exited
    if (currentProcess === proc) {
      currentProcess = null
    }
    return code
  } catch {
    return 1 // Command failed to spawn (e.g. executable not found)
  }
}

async function writeWav(path: string, samples: Float32Array, sampleRate: number): Promise<void> {
  const numChannels = 1
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const dataSize = samples.length * bytesPerSample
  const fileSize = 36 + dataSize
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeString(view, 0, "RIFF")
  view.setUint32(4, fileSize, true)
  writeString(view, 8, "WAVE")
  writeString(view, 12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true)
  view.setUint16(32, numChannels * bytesPerSample, true)
  view.setUint16(34, bitsPerSample, true)
  writeString(view, 36, "data")
  view.setUint32(40, dataSize, true)

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }

  await Bun.write(path, new Uint8Array(buffer))
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}
