/**
 * Reads the TTS mode notice from the command directory.
 * Strips frontmatter so only user-facing instructions remain.
 */

import * as path from "path"
import { homedir } from "os"

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

/**
 * Loads the TTS mode notice. Searches local repo, then global config,
 * then falls back to the plugin's bundled notice.
 */
export async function loadTtsNotice(pluginRoot: string): Promise<string> {
  const paths = [
    path.join(process.cwd(), ".opencode", "command", "tts-on.md"),
    path.join(homedir(), ".config", "opencode", "command", "tts-on.md"),
    path.join(pluginRoot, "command", "tts-on.md"),
  ]

  for (const filePath of paths) {
    try {
      const file = Bun.file(filePath)
      if (await file.exists()) {
        const text = await file.text()
        return stripFrontmatter(text)
      }
    } catch {
      // Continue to next path
    }
  }

  return ""
}
