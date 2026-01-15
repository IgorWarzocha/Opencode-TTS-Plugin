# OpenCode TTS Plugin

Simple TTS for OpenCode using [Kokoro TTS](https://huggingface.co/hexgrad/Kokoro-82M).

## Status

**Experimental.** This plugin is still in testing. For now, it is intended for **power users only** - I need feedback. Confirmed working on TUI, unsure about the other flavours.

## Features

- Speaks assistant responses in message or idle mode
- Local CPU or HTTP GPU backend
- Toggle via `/tts-on` and `/tts-off`
- Cross-platform playback
- 11 voice options

TTS only runs for **main sessions**. Child/subagent sessions are ignored. Messages do not overlap; a new message cuts off the previous audio.

![opencode-tts](https://github.com/user-attachments/assets/3483ee28-1d4f-435f-8ce2-e09e65330a88)

## Quick Start

### Local CPU Mode (Default - zero config)

TTS starts **disabled** by default. Enable it with `/tts-on` once the plugin is loaded.

Add the path manually to your `opencode.json`, pointing at wherever you copied the plugin:

```json
{
  "plugin": ["file:///home/igorw/Work/opencode/.opencode/plugin/tts-reader/src/index.ts"]
}
```

Copy the `command` folder to `.opencode/command/` - global or project-specific.

On first use, the plugin downloads the Kokoro TTS model (~87MB). You'll see a toast notification when ready.

### GPU Mode (Faster)

1. Start the Kokoro-FastAPI server with GPU:

```bash
# NVIDIA GPU (CUDA)
docker run -d --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest

# CPU fallback (no GPU)
docker run -d -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest
```

2. Configure the plugin to use HTTP backend by editing `~/.config/opencode/tts.jsonc` or switching profiles:

```bash
/tts:profile kokoro-gpu
```

## Requirements

### System Compatibility

- **Linux** - Tested on Omarchy
- **macOS** - Should work (afplay built-in)
- **Windows** - Should work (PowerShell built-in, ffmpeg recommended)

### Audio Player

The plugin uses cascading fallbacks to find an available audio player. It tries OS-bundled tools first, then common third-party options:

**Linux (tried in order):**
1. `ffplay` (from ffmpeg - most compatible with HTTP engine)
2. `mpv` (if installed)
3. `paplay` (PulseAudio)
4. `aplay` (ALSA)

**macOS (tried in order):**
1. `ffplay` (from ffmpeg)
2. `afplay` (built-in)

**Windows (tried in order):**
1. `ffplay` (from ffmpeg - recommended for HTTP engine)
2. `Media.SoundPlayer` (PowerShell built-in - strict WAV format)
3. `wmplayer` (Windows Media Player - if installed)

**Note on HTTP/GPU mode:** The HTTP engine returns WAV files that may not play with Windows' built-in Media.SoundPlayer. Installing ffmpeg is strongly recommended for Windows users using the HTTP backend.

**Installation:**
- **macOS**: `brew install ffmpeg`
- **Windows**: `winget install ffmpeg` (or `winget install ffmpeg.Gyan`)
- **Linux**: `sudo apt install ffmpeg`

### For HTTP/GPU Mode

- Docker with NVIDIA GPU support (nvidia-docker2)
- Or any machine running Kokoro-FastAPI (can be remote)

## Configuration

Defaults are stored at `~/.config/opencode/tts.jsonc` on first run. Edit that file to customize profiles and settings.

### Profile Switching

You can switch between defined profiles at runtime using the `/tts` command:
```bash
/tts profile openai
/tts profile kokoro-gpu
```

The plugin dynamically reloads command instructions from `.opencode/command/tts-on.md` if available in your project, or falls back to global/bundled defaults.

### Security Considerations

- **Trusted Backends**: The plugin sends text data to the configured `httpUrl`. Ensure you trust the backend server, especially when using remote APIs.
- **Provider Options**: The `providerOptions` field in profiles allows passing raw JSON to the backend. These are passed **without validation** and can override core fields like `model` or `voice`.
- **Authentication**: Use `httpHeaders` to securely pass API keys or Bearer tokens to remote providers.

### Config Format (JSONC)

```jsonc
// OpenCode TTS Reader configuration (JSONC)
{
  // Active profile name from the "profiles" object below
  "activeProfile": "default",
  // Enable/disable TTS at startup
  "enabled": false,
  // "message" (each response) or "idle" (session idle)
  "speakOn": "message",
  // Fallback to local (CPU) backend if HTTP fails
  "fallbackToLocal": true,
  // Max local worker processes (0 disables pool)
  "maxWorkers": 2,

  "profiles": {
    "default": {
      "backend": "local",
      "voice": "af_heart",
      "speed": 1.0
    },
    "kokoro-gpu": {
      "backend": "kokoro",
      "httpUrl": "http://localhost:8880",
      "voice": "af_heart",
      "speed": 1.0,
      "httpFormat": "wav"
    }
  }
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
