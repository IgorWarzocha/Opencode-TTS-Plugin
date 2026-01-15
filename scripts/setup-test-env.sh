#!/bin/bash
# setup-test-env.sh - Prepares the environment for local TTS testing (GPU optimized)

echo "🚀 Preparing TTS testing environment..."

# 1. Install dependencies
echo "📦 Installing plugin dependencies..."
bun install

# 2. Build the plugin
echo "🏗️ Building plugin..."
npm run build

# 3. Pull Docker images
echo "🐳 Pulling Kokoro-FastAPI (GPU)..."
docker pull ghcr.io/remsky/kokoro-fastapi-gpu:latest

echo "🐳 Pulling Kokoro-FastAPI (CPU fallback)..."
docker pull ghcr.io/remsky/kokoro-fastapi-cpu:latest

echo "🐳 Pulling OpenedAI-Speech (Generic OpenAI-compatible)..."
docker pull ghcr.io/matatonic/openedai-speech:latest

echo "✅ Environment ready! Run ./scripts/start-test-servers.sh to start the GPU-accelerated backends."
