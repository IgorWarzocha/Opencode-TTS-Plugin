# AGENTS.md - OpenCode TTS Plugin

A TypeScript OpenCode plugin for text-to-speech using Kokoro TTS with local CPU or HTTP GPU backends.

## Project Overview

**Type:** OpenCode Plugin (Bun runtime)
**Purpose:** Reads assistant messages aloud using Kokoro TTS
**Backends:** Local (kokoro-js) or HTTP (Kokoro-FastAPI)
**Status:** Experimental, power-user testing

**Structure:**
```
src/
├── index.ts           # Plugin entrypoint, event routing
├── engine.ts          # Backend router (local/http)
├── engine-http.ts     # HTTP backend client
├── local/             # Local backend (kokoro-js)
│   ├── speak.ts       # TTS orchestration
│   ├── pool.ts        # Worker pool management
│   ├── worker.ts      # Bun subprocess TTS worker
│   ├── model.ts       # Model download/cache
│   └── audio.ts       # Playback utilities
├── types.ts           # Configuration & voice types
├── config.ts          # JSONC config loader
├── text.ts            # Text cleaning & parsing
├── session.ts         # Child session detection
└── notice.ts          # Prompt injection for TTS mode
```

## Development Commands

```bash
# Build (clean + compile)
npm run build

# Type-check (lint)
npm run lint

# Clean build artifacts
npm run clean

# Prepare for publish
npm run prepublishOnly
```

**Note:** No test framework is present. Add `bun test` or `vitest` before writing tests.

## Code Style Guidelines

### TypeScript Configuration

- **Target:** ESNext with bundler resolution
- **Runtime:** Bun (uses `Bun.file`, `Bun.write`)
- **Strict mode:** Enabled
- **Module:** ESNext imports

### Import Patterns

```typescript
// ✅ Type-only imports
import type { Plugin } from "@opencode-ai/plugin"
import type { TtsConfig } from "./types"

// ✅ Value imports
import { loadConfig } from "./config"

// ❌ Avoid mixed type/value imports without `import type`
```

### Module Structure

- **Barrel exports:** Use `index.ts` to re-export (see `src/local/index.ts`)
- **File headers:** Add JSDoc comments explaining file purpose
- **Minimal public surface:** Export only what's needed from entrypoint

```typescript
/**
 * Exposes the local TTS controls to the engine router.
 * Keeps the public surface minimal for the plugin entrypoint.
 */
export { cancelLocalSpeak, initLocalTts, interruptLocalSpeak, isLocalReady, speakLocal } from "./speak"
```

### Type Definitions

- **Prefer `type` for data shapes**, `interface` only for extensible public APIs
- **Use `as const` for literal arrays** to infer narrow types:

```typescript
export const AVAILABLE_VOICES = [
  "af_heart",
  "af_bella",
  // ...
] as const

export type VoiceName = (typeof AVAILABLE_VOICES)[number]
```

- **Document public interfaces with JSDoc:**

```typescript
export interface TtsConfig {
  /** TTS backend: "local" for CPU (kokoro-js), "http" for GPU (Kokoro-FastAPI) */
  backend: TtsBackend
  /** HTTP server URL when backend is "http" (e.g., "http://localhost:8880") */
  httpUrl: string
  // ...
}
```

### Async Patterns

- **Use async/await** over promise chaining
- **Silence void promises with `void`** for fire-and-forget:

```typescript
if (config.enabled && latestMessageID && latestMessageText) {
  void speakText(latestMessageID, latestMessageText)
}
```

### Error Handling

- **HTTP errors:** Try/catch around fetch, log warnings
- **Missing dependencies:** Check via `tsc --noEmit`
- **Runtime errors:** Show toast notifications via `client.tui.showToast`

### Event Handling (Plugin Architecture)

The plugin responds to OpenCode events in `src/index.ts`:

```typescript
return {
  "chat.message": async (input) => {
    // Track active session
    activeSessionID = input.sessionID
  },
  "experimental.chat.system.transform": async (_, output) => {
    // Inject TTS notice into system prompt
    if (config.enabled && ttsNotice) {
      output.system.push(ttsNotice)
    }
  },
  event: async ({ event }) => {
    // Route events to handlers
    if (event.type === "message.part.updated") { /* ... */ }
    if (event.type === "message.updated") { /* ... */ }
    if (event.type === "session.idle") { /* ... */ }
  },
}
```

**Key events:**
- `message.part.updated` → Track latest assistant text
- `message.updated` → Speak on completion (when `speakOn: "message"`)
- `session.idle` → Speak final message (when `speakOn: "idle"`)
- `tui.command.execute` → Handle `/tts-on` and `/tts-off`

### Configuration

- **Location:** `~/.config/opencode/tts.jsonc`
- **Format:** JSONC (comments allowed)
- **Default:** Written on first run if missing
- **Reloading:** Call `loadConfig()` to reload + merge with defaults

**Never commit user config.** The template is in `src/config.ts`.

### Text Processing

- Strip markdown syntax (#, *, _, `)
- Replace code blocks with placeholder: `.replace(/```[\s\S]*?```/g, " code block ")`
- Trim whitespace

### Worker Pool (Local Backend)

- Managed by `src/local/pool.ts`
- Spawns Bun subprocesses via `src/local/worker.ts`
- Max workers configurable via `config.maxWorkers` (default: 2)
- Set to `0` to disable pooling (spawn per request)

## Adding New Features

### New Voice

1. Add to `AVAILABLE_VOICES` in `src/types.ts`
2. Update README table

### New Backend

1. Create `src/engine-{backend}.ts`
2. Implement: `checkServer`, `speak`, readiness checks
3. Route in `src/engine.ts` switch statements

### New Command

1. Create `command/tts-{name}.md` (reference existing files)
2. Add parsing in `src/text.ts` if needed
3. Handle in `applyTtsCommand` in `src/index.ts`

## Debugging

- **Type errors:** Run `npm run lint`
- **Build output:** Check `dist/` folder
- **Runtime logs:** Check OpenCode logs for plugin errors
- **Config issues:** Inspect `~/.config/opencode/tts.jsonc`

## Testing Strategy

**Current:** No automated tests

**Recommended additions:**
1. Unit tests for text cleaning (`src/text.ts`)
2. Integration tests for config loading (`src/config.ts`)
3. Mock OpenCode client for event routing tests
4. Use `bun test` for native test runner

## Dependencies

**Runtime:**
- `kokoro-js` - Local TTS inference
- `@opencode-ai/plugin` - OpenCode plugin API (peer)

**Dev:**
- `typescript` - Compiler
- `@types/node` - Node types
- `@types/bun` - Bun types

## Distribution

- **Output:** `dist/` folder
- **Files published:** `dist/`, `README.md`, `LICENSE`
- **Access:** Public npm registry

## Agent Behavior

When running in a GitHub Action (CI/CD):
1. A dedicated branch is already checked out for you.
2. **Do NOT** create new branches (do not use `git checkout -b`).
3. Commit changes directly to the current branch.
4. The system will handle pushing and PR creation.
