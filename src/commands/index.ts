/**
 * Exposes command handling helpers for the plugin entrypoint.
 * Keeps command logic isolated from event routing.
 */

export { createCommandHandler } from "./tts-command"
export type { CommandDependencies } from "./tts-command"
export type { CommandState } from "./types"
export { TTS_COMMAND_MARKER } from "./markers"
