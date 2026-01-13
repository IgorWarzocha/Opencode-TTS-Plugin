/**
 * Reads the TTS mode notice from the command directory.
 * Strips frontmatter so only user-facing instructions remain.
 */

import * as path from "path"

const stripFrontmatter = (raw: string): string => {
  if (!raw) return ""
  if (raw.startsWith("---")) {
    const end = raw.indexOf("\n---", 3)
    if (end !== -1) {
      return raw.slice(end + 4).trim()
    }
  }
  return raw.trim()
}

export async function loadTtsNotice(pluginRoot: string): Promise<string> {
  const filePath = path.join(pluginRoot, "command", "tts-on.md")
  const text = await Bun.file(filePath).text()
  return stripFrontmatter(text)
}
