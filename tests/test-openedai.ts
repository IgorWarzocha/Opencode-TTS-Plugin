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
    const text = "This is a long sentence that should be split into multiple chunks to test parallel synthesis. " +
                 "I want to ensure that there are no gaps between the audio segments and that everything plays correctly. " +
                 "OpenedAI Speech is a powerful backend that supports multiple languages and models."
    
    console.log(`\nSynthesizing and playing: "${text}"`)
    await speakOpenedAI(text, config, mockClient)
    console.log("\nOpenedAI playback success!")
  } catch (e: unknown) {
    const error = e as Error
    console.error("\nOpenedAI playback failed:", error.message)
    if (error.message.includes("ECONNREFUSED")) {
      console.log("HINT: Is OpenedAI running? Try: bash scripts/start-openedai.sh")
    }
  }

  console.log("\n--- Test Complete ---")
}

test()
