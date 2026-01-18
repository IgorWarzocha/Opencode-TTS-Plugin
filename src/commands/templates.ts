/**
 * Defines embedded command templates for slash command registration.
 * Keeps command bodies consistent with the reference markdown files.
 */

import { TTS_COMMAND_MARKER } from "./markers"

export type CommandTemplate = {
  description: string
  template: string
}

export const COMMAND_TEMPLATES: Record<string, CommandTemplate> = {
  "tts-on": {
    description: "Switch TTS on",
    template: [
      "Text to speech mode is now ACTIVATED.",
      "",
      "You MUST NOT output complex assistant messages in this mode, as it will be hard to understand. You MUST use natural, conversation language",
      "",
      "Strictly prohibited in assistant messages:",
      "",
      "- Outputting code - you MUST write the code using your tools.",
      "- Outputting html links - these will be extremely hard to understand.",
      "- Outputting messages with special characters, you SHOULD only use basic interpunction.",
      "- Producing overly verbose messages - you SHOULD be concise.",
    ].join("\n"),
  },
  "tts-off": {
    description: "Switch TTS off",
    template: [
      "Text to speech mode is now DEACTIVATED.",
      "",
      "Resume standard output.",
      "",
      "You are now allowed to produce complex assistant messages:",
      "",
      "- Outputting code snippets - ALLOWED.",
      "- Outputting html links - ALLOWED.",
      "- Outputting messages with special characters and complex interpunction - ALLOWED.",
    ].join("\n"),
  },
  "tts-profile": {
    description: "Switch TTS profile",
    template: [TTS_COMMAND_MARKER, "", ""].join("\n"),
  },
}
