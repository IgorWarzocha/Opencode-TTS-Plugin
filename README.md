# OpenCode TTS Plugin

Simple TTS for OpenCode using [Kokoro TTS](https://huggingface.co/hexgrad/Kokoro-82M).

## Status

**Experimental.** This plugin is still in testing and **not** on npm yet. It will be published later. For now, it is intended for **power users only** - I need feedback.

## Features

- Speaks assistant responses in message or idle mode
- Local CPU or HTTP GPU backend
- Toggle via `/tts:on` and `/tts:off`
- Cross-platform playback
- 11 voice options

TTS only runs for **main sessions**. Child/subagent sessions are ignored. Messages do not overlap; a new message cuts off the previous audio.

![opencode-tts](https://github.com/user-attachments/assets/3483ee28-1d4f-435f-8ce2-e09e65330a88)

## Quick Start

### Local CPU Mode (Default - zero config)

TTS starts **disabled** by default. Enable it with `/tts:on` once the plugin is loaded.

Add the path manually to your `opencode.json`, pointing at wherever you copied the plugin:

```json
{
  "plugin": ["file:///home/igorw/Work/opencode/.opencode/plugin/tts-reader/src/index.ts"]
}
```

Copy the `command` folder to `.opencode/command/` - global or project-specific.

On first use, the plugin downloads the Kokoro TTS model (~87MB). You'll see a toast notification when ready.

### GPU Mode (Faster) - currently untested

1. Start the Kokoro-FastAPI server with GPU:

```bash
# NVIDIA GPU (CUDA)
docker run -d --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest

# CPU fallback (no GPU)
docker run -d -p 8880:8880 ghcr.io/remsky/kokoro-fastapi:latest
```

2. Configure the plugin to use HTTP backend by editing `src/types.ts`:

```typescript
export const DEFAULT_CONFIG: TtsConfig = {
  backend: "http", // Use GPU server
  httpUrl: "http://localhost:8880",
  // ... rest of config
}
```

## Requirements

### System Compatibility

- **Linux** - Omarchy tested
- **macOS** / **Windows** - theoretical but untested

### Audio Player

The plugin needs an audio player to play the generated speech:

- **Linux**: `paplay` (PulseAudio), `aplay` (ALSA), or `mpv`
- **macOS**: `afplay` (built-in)
- **Windows**: PowerShell (built-in)

### For HTTP/GPU Mode

- Docker with NVIDIA GPU support (nvidia-docker2)
- Or any machine running Kokoro-FastAPI (can be remote)

## Configuration

Defaults are stored at `~/.config/opencode/tts.jsonc` on first run. Edit that file to customize:

```jsonc
// OpenCode TTS Reader configuration (JSONC)
{
  // Enable/disable TTS at startup
  "enabled": false,
  // "local" (CPU) or "http" (Kokoro-FastAPI)
  "backend": "local",
  // Kokoro-FastAPI URL when backend is http
  "httpUrl": "http://localhost:8880",
  // Response format: "wav", "mp3", or "pcm"
  "httpFormat": "wav",
  // "message" (each response) or "idle" (session idle)
  "speakOn": "message",
  // Voice ID
  "voice": "af_heart",
  // Playback speed (0.5 - 2.0)
  "speed": 1.0,
  // Max local worker processes (0 disables pool)
  "maxWorkers": 2,
}
```

## Available Voices

| Voice         | Description            |
| ------------- | ---------------------- |
| `af_heart`    | Female, warm (default) |
| `af_bella`    | Female, clear          |
| `af_nicole`   | Female, professional   |
| `af_sarah`    | Female, friendly       |
| `af_sky`      | Female, bright         |
| `am_adam`     | Male, neutral          |
| `am_michael`  | Male, deep             |
| `bf_emma`     | British female         |
| `bf_isabella` | British female         |
| `bm_george`   | British male           |
| `bm_lewis`    | British male           |

## Speak Modes

| Mode      | Behavior                                                    |
| --------- | ----------------------------------------------------------- |
| `message` | Speaks each assistant message as it completes (default)     |
| `idle`    | Speaks only the final message when the session becomes idle |

**Use `message`** for real-time feedback on every response.
**Use `idle`** for less frequent speech, only after the assistant finishes all work.

## How It Works

1. Plugin tracks the latest assistant message text via `message.part.updated` events
2. Depending on `speakOn` mode:
   - **message**: Speaks when `message.updated` fires with a completed assistant message
   - **idle**: Speaks when `session.idle` fires
3. Local backend uses Bun subprocesses (see `maxWorkers`)
4. Audio is played through your system's audio player
5. Text is cleaned (code blocks replaced with "code block", markdown stripped)

## License

MIT
