/**
 * src/local/index.ts
 * Exposes the local TTS controls to the engine router.
 * Keeps the public surface minimal for the plugin entrypoint.
 */

export { cancelLocalSpeak, initLocalTts, interruptLocalSpeak, isLocalReady, speakLocal } from "./speak"
