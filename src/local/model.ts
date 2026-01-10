/**
 * Loads the Kokoro model for local CPU synthesis.
 * Exposes a typed initializer for reuse across playback flows.
 */

type OnnxConfig = {
  executionMode?: "parallel" | "sequential"
  intraOpNumThreads?: number
  interOpNumThreads?: number
}

type OnnxEnv = {
  onnx?: OnnxConfig
  backends?: { onnx?: OnnxConfig }
}

type KokoroModule = typeof import("kokoro-js")
export type KokoroModel = Awaited<ReturnType<KokoroModule["KokoroTTS"]["from_pretrained"]>>

export async function loadLocalModel(): Promise<KokoroModel> {
  const transformers = await import("@huggingface/transformers")
  const env = transformers.env as OnnxEnv
  const onnx = env.onnx || (env.backends && env.backends.onnx)
  if (onnx) {
    onnx.executionMode = "parallel"
    onnx.intraOpNumThreads = 1
    onnx.interOpNumThreads = 1
  }

  const kokoro = await import("kokoro-js")
  return kokoro.KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
    dtype: "q8",
    device: "cpu",
  })
}
