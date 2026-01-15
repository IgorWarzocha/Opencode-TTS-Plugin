/**
 * Orchestrates local TTS playback with chunked audio generation.
 * Switches between direct model use and subprocess pooling.
 */

import { unlink } from "fs/promises"
import { splitTextIntoChunks } from "../text"
import { AVAILABLE_VOICES, type TtsConfig, type VoiceName } from "../types"
import { cancelAudioPlayback, playAudio, writeTempWav } from "./audio"
import { loadLocalModel, type KokoroModel } from "./model"
import { createWorkerPool, type WorkerPool } from "./pool"
import { isValidVoice } from "./validate"

let pool: WorkerPool | null = null
let poolReady = false
let poolInit: Promise<boolean> | null = null
let localModel: KokoroModel | null = null
let localInit: Promise<boolean> | null = null
let cancelToken = 0

export async function initLocalTts(config: TtsConfig): Promise<boolean> {
  if (config.maxWorkers <= 0) {
    if (localModel) return true
    if (localInit) return localInit

    localInit = loadLocalModel().then((model: KokoroModel) => {
      localModel = model
      return true
    })
    return localInit
  }

  if (poolReady && pool) return true
  if (poolInit) return poolInit

  pool = createWorkerPool(config)
  poolInit = pool.ready.then(() => {
    poolReady = true
    return true
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

  const chunks = splitTextIntoChunks(trimmed)
  if (chunks.length === 0) return

  const files: string[] = []
  if (token !== cancelToken) return

  if (config.maxWorkers <= 0 && localModel) {
    const model = localModel
    const playDirect = async () => {
      for (let i = 0; i < chunks.length; i++) {
        if (!config.enabled || token !== cancelToken) break
        const audio = await model.generate(chunks[i], {
          voice: isValidVoice(config.voice) ? config.voice : "af_heart",
          speed: config.speed || 1.0,
        })
        const samples = audio.audio as Float32Array
        const filePath = await writeTempWav(samples, 24000, i)
        files.push(filePath)
        if (!config.enabled || token !== cancelToken) break
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
      if (!config.enabled || token !== cancelToken) break
      const result = await tasks[i]
      files.push(result.path)
      if (!config.enabled || token !== cancelToken) break
      await playAudio(result.path)
    }
  }

  await playFromWorkers().finally(async () => {
    await cleanupFiles(files)
  })
}

async function cleanupFiles(files: string[]): Promise<void> {
  if (files.length === 0) return
  await Promise.allSettled(files.map((file) => unlink(file).catch(() => {})))
}
