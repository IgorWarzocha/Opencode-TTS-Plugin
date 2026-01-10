/**
 * src/local/worker.ts
 * Runs Kokoro synthesis in a subprocess or worker thread.
 * Reads JSON requests, writes WAV output paths, and exits on errors.
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

type OnnxConfig = {
  executionMode?: "parallel" | "sequential"
  intraOpNumThreads?: number
  interOpNumThreads?: number
}

type OnnxEnv = {
  onnx?: OnnxConfig
  backends?: { onnx?: OnnxConfig }
}

type Outgoing = ReadyMessage | ResultMessage

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

writer.send({ type: "ready" })

const handleGenerate = async (message: GenerateMessage) => {
  const audio = await model.generate(message.text, {
    voice: message.voice,
    speed: message.speed,
  })
  const samples = audio.audio as Float32Array
  const path = await writeTempWav(samples, 24000, message.id)
  writer.send({ type: "result", id: message.id, path })
}

if (isProcess) {
  process.stdin.setEncoding("utf8")
  let buffer = ""
  process.stdin.on("data", (chunk) => {
    buffer += chunk
    const parts = buffer.split("\n")
    buffer = parts.pop() ?? ""
    for (const line of parts) {
      const message = JSON.parse(line) as GenerateMessage
      handleGenerate(message)
    }
  })
}

if (!isProcess && port) {
  port.on("message", (message: GenerateMessage) => {
    handleGenerate(message)
  })
}
