/**
 * Writes WAV audio to temp files and plays it through system players.
 * Tracks the active player process so playback can be interrupted.
 */

import { tmpdir } from "os"
import { join } from "path"
import type { Subprocess } from "bun"

let currentProcess: Subprocess | null = null

export async function writeTempWav(samples: Float32Array, sampleRate: number, index: number): Promise<string> {
  const filePath = join(tmpdir(), `opencode-tts-${Date.now()}-${index}.wav`)
  await writeWav(filePath, samples, sampleRate)
  return filePath
}

export async function playAudio(filePath: string): Promise<void> {
  const platform = process.platform

  if (platform === "darwin") {
    await runCommand(["afplay", filePath])
    return
  }

  if (platform === "win32") {
    await runCommand(["ffplay", "-autoexit", "-nodisp", "-loglevel", "quiet", filePath])
    return
  }

  const players = [
    ["paplay", filePath],
    ["aplay", filePath],
    ["mpv", "--no-video", "--no-terminal", filePath],
  ]

  for (const cmd of players) {
    const status = await runCommand(cmd)
    if (status === 0) return
  }
}

export function cancelAudioPlayback(): void {
  if (!currentProcess) return
  currentProcess.kill()
  currentProcess = null
}

async function runCommand(cmd: string[]): Promise<number> {
  const proc = Bun.spawn(cmd, { stderr: "ignore", stdout: "ignore" }) as Subprocess
  currentProcess = proc
  const code = await proc.exited
  if (currentProcess === proc) {
    currentProcess = null
  }
  return code
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
