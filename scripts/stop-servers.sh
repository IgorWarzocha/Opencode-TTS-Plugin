#!/bin/bash
# stop-servers.sh - Stops all test TTS servers

echo "🛑 Stopping test servers..."
docker stop kokoro-tts-test openedai-speech-test 2>/dev/null
docker rm kokoro-tts-test openedai-speech-test 2>/dev/null
echo "✅ Done."
