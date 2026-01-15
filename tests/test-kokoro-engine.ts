/**
 * Manual test script for Kokoro-FastAPI backend synthesis.
 * Tests the specific Kokoro-FastAPI engine implementation.
 */

import { speakKokoro } from "../src/engine-kokoro"
import { loadConfig } from "../src/config"
import type { ToastClient } from "../src/local/audio"

async function test() {
  console.log("--- Starting Kokoro-FastAPI Engine Test ---")
  console.log("Platform:", process.platform)

  const config = await loadConfig()
  
  // Configure for Kokoro-FastAPI testing
  config.enabled = true
  config.backend = "kokoro"
  config.httpUrl = "http://localhost:8880"
  config.voice = "af_heart"
  config.speed = 1.0

  console.log("Test Config:", JSON.stringify({
    backend: config.backend,
    httpUrl: config.httpUrl,
    voice: config.voice
  }, null, 2))

  // Typed mock client
  const mockClient: ToastClient = {
    tui: {
      showToast: async (options) => {
        console.log("TOAST:", JSON.stringify(options.body, null, 2))
      }
    }
  }

  try {
    const text = "Testing the Kokoro Fast-API backend. This backend is optimized for the Kokoro TTS model."
    
    console.log(`\nSynthesizing and playing: "${text}"`)
    await speakKokoro(text, config, mockClient)
    console.log("\nKokoro playback success!")
  } catch (e: unknown) {
    console.error("\nKokoro playback failed:", (e as Error).message)
  }

  console.log("\n--- Test Complete ---")
}

test()
