/**
 * src/local/pool.ts
 * Manages Bun subprocesses for parallel TTS generation.
 * Streams JSON messages over stdin/stdout to avoid worker thread crashes.
 */

import { cpus } from "os"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import type { FileSink, Subprocess } from "bun"
import type { TtsConfig, VoiceName } from "../types"

type WorkerResult = { path: string }
type Task = {
  id: number
  text: string
  voice: VoiceName
  speed: number
  resolve: (result: WorkerResult) => void
  reject: (error: Error) => void
}
type ResultMessage = { type: "result"; id: number; path: string }
type ErrorMessage = { type: "error"; id: number; message: string }
type ReadyMessage = { type: "ready" }
type WorkerMessage = ResultMessage | ErrorMessage | ReadyMessage

type ProcessState = {
  proc: Subprocess<"pipe", "pipe", "pipe">
  stdin: FileSink
  stdout: ReadableStream<Uint8Array>
  busy: boolean
  ready: boolean
  failed: boolean
  task: Task | null
  buffer: string
}

export type WorkerPool = {
  ready: Promise<void>
  enqueue: (text: string, config: TtsConfig) => Promise<WorkerResult>
  shutdown: () => void
}

export function createWorkerPool(config: TtsConfig): WorkerPool {
  const maxWorkers = Math.max(1, config.maxWorkers)
  const count = Math.max(1, Math.min(cpus().length, maxWorkers))
  const tasks: Task[] = []
  const states: ProcessState[] = []
  let nextId = 0
  let readyResolved = false

  let resolveReady: () => void = () => {}
  let rejectReady: (error: Error) => void = () => {}
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })

  const workerPath = join(dirname(fileURLToPath(import.meta.url)), "worker.ts")

  const assign = () => {
    for (const state of states) {
      if (state.failed) continue
      if (!state.ready) continue
      if (state.busy) continue
      if (tasks.length === 0) return
      const task = tasks.shift()
      if (!task) return
      state.busy = true
      state.task = task
      const payload = JSON.stringify({
        type: "generate",
        id: task.id,
        text: task.text,
        voice: task.voice,
        speed: task.speed,
      })
      state.stdin.write(`${payload}\n`)
    }
  }

  const handleReady = () => {
    if (readyResolved) return
    readyResolved = true
    resolveReady()
  }

  const handleFailure = (error: Error) => {
    if (readyResolved) return
    rejectReady(error)
  }

  const failQueue = (error: Error) => {
    while (tasks.length > 0) {
      const task = tasks.shift()
      if (!task) continue
      task.reject(error)
    }
  }

  const handleMessage = (state: ProcessState, message: WorkerMessage) => {
    if (message.type === "ready") {
      state.ready = true
      handleReady()
      assign()
      return
    }

    const task = state.task
    state.task = null
    state.busy = false
    assign()
    if (!task) return
    if (message.type === "result") {
      task.resolve({ path: message.path })
      return
    }
    if (message.type === "error") {
      task.reject(new Error(message.message))
    }
  }

  const startReader = (state: ProcessState) => {
    const reader = state.stdout.getReader()
    const readLoop = (): void => {
      reader.read().then((result) => {
        if (result.done) return
        const chunk = new TextDecoder().decode(result.value)
        state.buffer += chunk
        const parts = state.buffer.split("\n")
        state.buffer = parts.pop() ?? ""
        for (const line of parts) {
          if (!line.trim()) continue
          const parsed = JSON.parse(line) as WorkerMessage
          handleMessage(state, parsed)
        }
        readLoop()
      })
    }
    readLoop()
  }

  const spawnProcess = () => {
    const proc = Bun.spawn(["bun", workerPath, "--process"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    }) as Subprocess<"pipe", "pipe", "pipe">

    const state: ProcessState = {
      proc,
      stdin: proc.stdin,
      stdout: proc.stdout,
      busy: false,
      ready: false,
      failed: false,
      task: null,
      buffer: "",
    }
    states.push(state)
    startReader(state)

    proc.exited.then(() => {
      state.failed = true
      handleFailure(new Error("worker process exited"))
      if (state.task) {
        state.task.reject(new Error("worker process exited"))
      }
      failQueue(new Error("worker process exited"))
    })
  }

  for (let i = 0; i < count; i++) {
    spawnProcess()
  }

  const enqueue = (text: string, config: TtsConfig): Promise<WorkerResult> => {
    return new Promise((resolve, reject) => {
      const task: Task = {
        id: nextId,
        text,
        voice: config.voice as VoiceName,
        speed: config.speed,
        resolve,
        reject,
      }
      nextId += 1
      tasks.push(task)
      assign()
    })
  }

  const shutdown = (): void => {
    while (tasks.length > 0) {
      const task = tasks.shift()
      if (!task) continue
      task.reject(new Error("pool shutdown"))
    }

    for (const state of states) {
      state.failed = true
      state.proc.kill()
    }
  }

  return { ready, enqueue, shutdown }
}
