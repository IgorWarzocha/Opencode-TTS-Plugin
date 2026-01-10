/**
 * Local TTS pipeline for streaming playback.
 * Splits text into small chunks and queues them on a worker pool.
 * Plays chunks sequentially while other workers continue generating.
 */

import { unlink } from "fs/promises"
import type { TtsConfig } from "../types"
import { cancelAudioPlayback, playAudio, writeTempWav } from "./audio"
import { createWorkerPool, type WorkerPool } from "./pool"

type OnnxConfig = {
  executionMode?: "parallel" | "sequential"
  intraOpNumThreads?: number
  interOpNumThreads?: number
}

type OnnxEnv = {
  onnx?: OnnxConfig
  backends?: { onnx?: OnnxConfig }
}

let pool: WorkerPool | null = null
let poolReady = false
let poolInit: Promise<boolean> | null = null
let localModel: any = null
let localInit: Promise<boolean> | null = null
let cancelToken = 0

const initLocalModel = async (): Promise<any | null> => {
  try {
    const transformers = await import("@huggingface/transformers")
    const env = transformers.env as OnnxEnv
    const onnx = env.onnx || (env.backends && env.backends.onnx)
    if (onnx) {
      onnx.executionMode = "parallel"
      onnx.intraOpNumThreads = 1
      onnx.interOpNumThreads = 1
    }

    const kokoro = await import("kokoro-js")
    return await kokoro.KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
      dtype: "q8",
      device: "cpu",
    })
  } catch {
    return null
  }
}

export async function initLocalTts(config: TtsConfig): Promise<boolean> {
  if (config.maxWorkers <= 0) {
    if (localModel) return true
    if (localInit) return localInit

    localInit = initLocalModel().then((model) => {
      localModel = model
      return model !== null
    })
    return localInit
  }

  if (poolReady && pool) return true
  if (poolInit) return poolInit

  pool = createWorkerPool(config)
  poolInit = pool.ready
    .then(() => {
      poolReady = true
      return true
    })
    .catch(() => {
      poolReady = false
      pool = null
      return false
    })

  return poolInit
}

export function isLocalReady(): boolean {
  if (localModel) return true
  return poolReady
}

export function cancelLocalSpeak(): void {
  cancelToken += 1
  cancelAudioPlayback()
  if (pool) {
    pool.shutdown()
    pool = null
    poolReady = false
    poolInit = null
  }
}

export function interruptLocalSpeak(): void {
  cancelToken += 1
  cancelAudioPlayback()
}

export async function speakLocal(text: string, config: TtsConfig): Promise<void> {
  if (!config.enabled) return
  const trimmed = text.trim()
  if (!trimmed) return

  const token = cancelToken
  const ready = await initLocalTts(config)
  if (!ready) return
  if (token !== cancelToken) return

  const chunks = splitText(trimmed)
  if (chunks.length === 0) {
    return
  }

  const files: string[] = []

  if (token !== cancelToken) {
    return
  }

  if (config.maxWorkers <= 0 && localModel) {
    const playDirect = async () => {
      for (let i = 0; i < chunks.length; i++) {
        if (!config.enabled || token !== cancelToken) {
          break
        }
        const audio = await localModel.generate(chunks[i], {
          voice: config.voice,
          speed: config.speed,
        })
        const samples = audio.audio as Float32Array
        const filePath = await writeTempWav(samples, 24000, i)
        files.push(filePath)
        if (!config.enabled || token !== cancelToken) {
          break
        }
        await playAudio(filePath)
      }
    }

    await playDirect().finally(async () => {
      await cleanupFiles(files)
    })
    return
  }

  const activePool = pool
  if (!activePool || token !== cancelToken) return

  const tasks = chunks.map((chunk) => {
    return activePool.enqueue(chunk, config)
  })

  const playFromWorkers = async () => {
    for (let i = 0; i < tasks.length; i++) {
      if (!config.enabled || token !== cancelToken) {
        break
      }
      const result = await tasks[i]
      files.push(result.path)
      if (!config.enabled || token !== cancelToken) {
        break
      }
      await playAudio(result.path)
    }
  }

  await playFromWorkers().finally(async () => {
    await cleanupFiles(files)
  })
}

function splitText(text: string): string[] {
  const maxLength = 240
  const parts = text.match(/[^.!?\n]+[.!?\n]*|[\n]+/g) || [text]
  const chunks: string[] = []

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    if (trimmed.length <= maxLength) {
      chunks.push(trimmed)
      continue
    }

    const words = trimmed.split(/\s+/)
    let current = ""

    for (const word of words) {
      if (!word) continue
      if (!current) {
        current = word
        continue
      }
      if (current.length + word.length + 1 <= maxLength) {
        current = `${current} ${word}`
        continue
      }
      chunks.push(current)
      current = word
    }

    if (current) {
      chunks.push(current)
    }
  }

  return chunks
}

async function cleanupFiles(files: string[]): Promise<void> {
  if (files.length === 0) return
  await Promise.all(files.map((file) => unlink(file).catch(() => {})))
}
