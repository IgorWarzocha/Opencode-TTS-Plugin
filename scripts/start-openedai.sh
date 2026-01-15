#!/bin/bash
# start-openedai.sh - Starts only OpenedAI-Speech (GPU)

echo "Starting OpenedAI-Speech..."

# Stop existing container
docker stop openedai-speech-test 2>/dev/null
docker rm openedai-speech-test 2>/dev/null

# Start OpenedAI on port 8000 with GPU
# Requires nvidia-container-toolkit installed on host
docker run -d \
  --name openedai-speech-test \
  --runtime=nvidia \
  --gpus all \
  -p 8000:8000 \
  ghcr.io/matatonic/openedai-speech:latest

echo "OpenedAI-Speech is booting up at http://localhost:8000"
echo "logs: docker logs -f openedai-speech-test"
