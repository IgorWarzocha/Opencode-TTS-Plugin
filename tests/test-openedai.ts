/**
 * Manual test script for OpenedAI backend synthesis.
 * Tests parallel synthesis and gapless playback logic.
 */

import { speakOpenedAI } from "../src/engine-openedai"
import { loadConfig } from "../src/config"
import type { ToastClient } from "../src/local/audio"

async function test() {
  console.log("--- Starting OpenedAI Backend Test ---")
  console.log("Platform:", process.platform)

  const config = await loadConfig()
  
  // Configure for OpenedAI testing
  config.enabled = true
  config.backend = "openedai"
  config.httpUrl = "http://localhost:8000" // Default for scripts/start-openedai.sh
  config.voice = "alloy"
  config.speed = 1.0

  console.log("Test Config:", JSON.stringify({
    backend: config.backend,
    httpUrl: config.httpUrl,
    voice: config.voice
  }, null, 2))

  // Typed mock client for toast notifications
  const mockClient: ToastClient = {
    tui: {
      showToast: async (options) => {
        console.log("TOAST:", JSON.stringify(options.body, null, 2))
      }
    }
  }

  try {
    const text = "This is a test sentence for parallel synthesis. It should be split and played without gaps."
    
    console.log(`\nSynthesizing: "${text}"`)
    await speakOpenedAI(text, config, mockClient)
    console.log("\nSuccess!")
  } catch (e: unknown) {
    console.error("\nFailed:", (e as Error).message)
  }

  console.log("\n--- Test Complete ---")
}

test()
