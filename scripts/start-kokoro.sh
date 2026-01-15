#!/bin/bash
# start-kokoro.sh - Starts only Kokoro-FastAPI (GPU)

echo "🔊 Starting Kokoro-FastAPI..."

# Stop existing container
docker stop kokoro-tts-test 2>/dev/null
docker rm kokoro-tts-test 2>/dev/null

# Start Kokoro on port 8880 with GPU
# Requires nvidia-container-toolkit installed on host
docker run -d \
  --name kokoro-tts-test \
  --runtime=nvidia \
  --gpus all \
  -p 8880:8880 \
  ghcr.io/remsky/kokoro-fastapi-gpu:latest

echo "✨ Kokoro is booting up at http://localhost:8880"
echo "logs: docker logs -f kokoro-tts-test"
