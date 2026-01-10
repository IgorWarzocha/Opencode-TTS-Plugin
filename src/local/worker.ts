/**
 * TTS generator worker that can run as a worker thread or standalone process.
 * In process mode, it reads JSON lines from stdin and writes results to stdout.
 * Writes WAV files in the worker to avoid large message transfers.
 */

import { parentPort } from "worker_threads"
import { writeTempWav } from "./audio"
import type { VoiceName } from "../types"

type GenerateMessage = {
  type: "generate"
  id: number
  text: string
  voice: VoiceName
  speed: number
}

type ReadyMessage = {
  type: "ready"
}

type ResultMessage = {
  type: "result"
  id: number
  path: string
}

type DebugMessage = {
  type: "debug"
  id: number
  message: string
}

type ErrorMessage = {
  type: "error"
  id: number
  message: string
}

type OnnxConfig = {
  executionMode?: "parallel" | "sequential"
  intraOpNumThreads?: number
  interOpNumThreads?: number
}

type OnnxEnv = {
  onnx?: OnnxConfig
  backends?: { onnx?: OnnxConfig }
}

type Outgoing = ReadyMessage | ResultMessage | DebugMessage | ErrorMessage

type LogWriter = {
  send: (message: Outgoing) => void
}

const isProcess = process.argv.includes("--process")
const port = parentPort

const writeProcessMessage = (message: Outgoing) => {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

const writeWorkerMessage = (message: Outgoing) => {
  if (!port) return
  port.postMessage(message)
}

const writer: LogWriter = {
  send: isProcess ? writeProcessMessage : writeWorkerMessage,
}

if (!isProcess && !port) {
  throw new Error("TTS worker requires parent port")
}

const transformers = await import("@huggingface/transformers")
const env = transformers.env as OnnxEnv
const onnx = env.onnx || (env.backends && env.backends.onnx)
if (onnx) {
  onnx.executionMode = "sequential"
  onnx.intraOpNumThreads = 1
  onnx.interOpNumThreads = 1
}

const kokoro = await import("kokoro-js")
const model = await kokoro.KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
  dtype: "q8",
  device: "cpu",
})

writer.send({ type: "ready" } satisfies ReadyMessage)

const handleGenerate = async (message: GenerateMessage) => {
  const audio = await model.generate(message.text, {
    voice: message.voice,
    speed: message.speed,
  })
  const samples = audio.audio as Float32Array
  const path = await writeTempWav(samples, 24000, message.id)
  writer.send({ type: "result", id: message.id, path })
}

const handleError = (message: GenerateMessage, error: unknown) => {
  const reason = error instanceof Error ? error.message : "TTS worker error"
  writer.send({ type: "error", id: message.id, message: reason })
}

if (isProcess) {
  process.stdin.setEncoding("utf8")
  let buffer = ""
  process.stdin.on("data", (chunk) => {
    buffer += chunk
    const parts = buffer.split("\n")
    buffer = parts.pop() ?? ""
    for (const line of parts) {
      if (!line.trim()) continue
      const message = JSON.parse(line) as GenerateMessage
      if (!message || message.type !== "generate") continue
      handleGenerate(message).catch((error) => handleError(message, error))
    }
  })
} else if (port) {
  port.on("message", (message: GenerateMessage) => {
    if (!message || message.type !== "generate") return
    handleGenerate(message).catch((error) => handleError(message, error))
  })
}
