/**
 * Manual test script for TTS playback.
 * Tests both direct playAudio and the speakHttp logic.
 */

import { playAudio, type ToastClient } from "../src/local/audio"
import { speakHttp } from "../src/engine-http"
import { loadConfig } from "../src/config"

async function test() {
  console.log("--- Starting TTS End-to-End Test ---")
  console.log("Platform:", process.platform)

  const config = await loadConfig()
  console.log("Config loaded:", JSON.stringify(config, null, 2))

  // Typed mock client for toast notifications
  const mockClient: ToastClient = {
    tui: {
      showToast: async (options) => {
        console.log("TOAST:", JSON.stringify(options.body, null, 2))
      }
    }
  }

  // 1. Test basic playAudio with a non-existent file to trigger fallbacks and toast
  console.log("\n1. Testing playAudio with missing file (should trigger fallbacks/toast)...")
  try {
    await playAudio("/tmp/non-existent-file.wav", mockClient)
  } catch (e: unknown) {
    console.log("Caught expected error:", (e as Error).message)
  }

  // 2. Test HTTP backend if available
  console.log("\n2. Testing HTTP backend (speakHttp)...")
  config.enabled = true
  config.backend = "http"
  config.httpUrl = "http://localhost:8880"
  
  try {
    const text = "Hello world! This is a test of the robust audio playback system."
    console.log(`Sending to ${config.httpUrl}: "${text}"`)
    await speakHttp(text, config, mockClient)
    console.log("HTTP playback success!")
  } catch (e: unknown) {
    console.error("HTTP playback failed:", (e as Error).message)
  }

  console.log("\n--- Test Complete ---")
}

test()
