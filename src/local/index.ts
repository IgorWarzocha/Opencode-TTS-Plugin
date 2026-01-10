/**
 * Local TTS module entry for the plugin.
 * Exposes the worker-backed init, readiness, and speak functions.
 * Keeps the public surface small and stable for the engine router.
 */

export { cancelLocalSpeak, initLocalTts, interruptLocalSpeak, isLocalReady, speakLocal } from "./speak"
