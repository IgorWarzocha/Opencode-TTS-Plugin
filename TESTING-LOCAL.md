# Local Testing Guide - OpenCode TTS Plugin

To thoroughly test the multi-backend and profile features, you should have both the local Bun environment and external GPU-accelerated TTS servers running (via Docker).

## 1. Prerequisites

- **Bun**: The primary runtime for the plugin.
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```
- **Docker & NVIDIA Container Toolkit**: Required for GPU acceleration in containers.
- **NVIDIA GPU**: Required for external backends (local backend remains CPU-only).

## 2. External Backend Servers (Docker)

To test the "http" backend and OpenAI-compatible API support, pull and run these images:

### Kokoro-FastAPI (Recommended)
This is the primary target for HTTP testing. It provides an OpenAI-compatible `/v1/audio/speech` endpoint.

- **GPU Version**:
  ```bash
  docker run -d --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest
  ```

### OpenedAI-Speech (XTTS-v2)
To test generic OpenAI-compatible support with different languages and `providerOptions`:
```bash
docker run -d --gpus all -p 8000:8000 ghcr.io/matatonic/openedai-speech:latest
```

## 3. Plugin Setup

1. **Install dependencies**:
   ```bash
   bun install
   ```
2. **Compile the plugin**:
   ```bash
   npm run build
   ```

## 4. Automation Scripts

We've provided scripts in the `scripts/` directory to automate this:

- **Setup Environment**: `./scripts/setup-test-env.sh` (Pulls GPU images and installs deps)
- **Start Kokoro**: `./scripts/start-kokoro.sh` (Starts Kokoro-FastAPI on port 8880)
- **Start OpenedAI**: `./scripts/start-openedai.sh` (Starts OpenedAI-Speech on port 8000)
- **Stop All**: `./scripts/stop-servers.sh` (Stops all test containers)

**Note:** Run only one server at a time if you are concerned about GPU VRAM usage.

### Troubleshooting

**Error: `could not select device driver "" with capabilities: [[gpu]]`**
This means Docker cannot access your GPU. Ensure you have the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) installed and have configured the Docker daemon:

```bash
# Arch Linux
sudo pacman -S nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
# A reboot may be required after installing the toolkit or kernel updates.
```

## 5. Testing Profiles

Modify your `~/.config/opencode/tts.jsonc` to include test profiles:

```jsonc
{
  "activeProfile": "default",
  "fallbackToLocal": true,
  "profiles": {
    "default": {
      "backend": "local",
      "voice": "af_heart"
    },
    "gpu-kokoro": {
      "backend": "http",
      "httpUrl": "http://localhost:8880",
      "voice": "af_bella"
    },
    "xtts-polish": {
      "backend": "http",
      "httpUrl": "http://localhost:8000",
      "voice": "alloy",
      "providerOptions": {
        "language": "pl"
      }
    }
  }
}
```

## 6. Runtime Verification

Once the plugin is loaded in OpenCode, use the following commands to verify switching:

- `/tts profile gpu-kokoro` -> Should switch to the FastAPI server.
- `/tts profile default` -> Should switch back to local CPU (zero-conf).
- `/tts on` / `/tts off` -> Verify global toggle.
