#!/usr/bin/env bash
set -euo pipefail

# E2E Test Script for Kokoro-FastAPI Container
# Tests the complete TTS pipeline: request → audio generation → playback

COLOR_RESET="\033[0m"
COLOR_GREEN="\033[32m"
COLOR_RED="\033[31m"
COLOR_YELLOW="\033[33m"
COLOR_BLUE="\033[34m"

log_info() { echo -e "${COLOR_BLUE}ℹ${COLOR_RESET} $1"; }
log_success() { echo -e "${COLOR_GREEN}✓${COLOR_RESET} $1"; }
log_error() { echo -e "${COLOR_RED}✗${COLOR_RESET} $1"; }
log_warn() { echo -e "${COLOR_YELLOW}⚠${COLOR_RESET} $1"; }

# Configuration
KOKORO_URL="${KOKORO_URL:-http://localhost:8880}"
TEST_OUTPUT_DIR="/tmp/kokoro-e2e-test"
VOICE="${TEST_VOICE:-af_heart}"
SPEED="${TEST_SPEED:-1.0}"

log_info "Kokoro E2E Test"
log_info "================"
log_info "URL: $KOKORO_URL"
log_info "Voice: $VOICE"
log_info "Speed: $SPEED"
echo ""

# Create output directory
mkdir -p "$TEST_OUTPUT_DIR"

# Test 1: Container Health Check
log_info "Test 1: Checking container health..."
if curl -s -f "$KOKORO_URL/v1/models" > /dev/null 2>&1; then
    log_success "Container is responding"
    MODELS=$(curl -s "$KOKORO_URL/v1/models")
    log_success "Available models: $(echo "$MODELS" | jq -r '.data[].id' | tr '\n' ' ')"
else
    log_error "Container is not responding at $KOKORO_URL"
    log_info "Starting container..."
    docker stop kokoro-cpu 2>/dev/null || true
    docker rm kokoro-cpu 2>/dev/null || true
    docker run -d --name kokoro-cpu -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest

    log_info "Waiting for container to start (10 seconds)..."
    sleep 10

    if curl -s -f "$KOKORO_URL/v1/models" > /dev/null 2>&1; then
        log_success "Container started successfully"
    else
        log_error "Failed to start container"
        docker logs kokoro-cpu --tail 20
        exit 1
    fi
fi
echo ""

# Test 2: Simple TTS Request
log_info "Test 2: Testing simple TTS request..."
TEST_TEXT="Hello, this is a test of the Kokoro text to speech system."
AUDIO_FILE="$TEST_OUTPUT_DIR/test-basic.wav"

# Save directly to file to avoid bash binary data issues
HTTP_CODE=$(curl -s -X POST "$KOKORO_URL/v1/audio/speech" \
    -H "Content-Type: application/json" \
    -o "$AUDIO_FILE" \
    -w "%{http_code}" \
    -d "{
        \"model\": \"kokoro\",
        \"voice\": \"$VOICE\",
        \"input\": \"$TEST_TEXT\",
        \"speed\": $SPEED,
        \"response_format\": \"wav\"
    }")

if [ "$HTTP_CODE" = "200" ] && [ -f "$AUDIO_FILE" ] && [ -s "$AUDIO_FILE" ]; then
    FILE_SIZE=$(stat -f%z "$AUDIO_FILE" 2>/dev/null || stat -c%s "$AUDIO_FILE" 2>/dev/null)

    # Verify WAV header using od
    HEADER=$(head -c 4 "$AUDIO_FILE" | od -A n -t x1 | tr -d ' ')
    if [ "$HEADER" = "52494646" ]; then  # "RIFF" in hex
        log_success "Received valid WAV audio: $AUDIO_FILE ($FILE_SIZE bytes)"

        # Show detailed WAV header
        WAV_HEADER=$(head -c 12 "$AUDIO_FILE" | od -A n -t x1 | tr -s ' ')
        log_info "WAV header (hex): $WAV_HEADER"
    else
        log_error "Response is not valid WAV data (header: $HEADER)"
        log_error "HTTP code: $HTTP_CODE"
        exit 1
    fi
else
    log_error "Failed to get audio from server (HTTP code: $HTTP_CODE)"
    if [ -f "$AUDIO_FILE" ]; then
        log_error "File content: $(head -c 100 "$AUDIO_FILE" | od -c | head -5)"
    fi
    exit 1
fi
echo ""

# Test 4: Audio Playback Test
log_info "Test 4: Testing audio playback..."

# Detect audio player
AUDIO_PLAYER=""
if command -v paplay &> /dev/null; then
    AUDIO_PLAYER="paplay"
elif command -v aplay &> /dev/null; then
    AUDIO_PLAYER="aplay"
elif command -v mpv &> /dev/null; then
    AUDIO_PLAYER="mpv --no-video"
elif command -v afplay &> /dev/null; then
    AUDIO_PLAYER="afplay"
else
    log_warn "No audio player found. Skipping playback test."
    log_info "Install paplay (PulseAudio) or aplay (ALSA) for Linux"
    log_info "Install afplay for macOS"
    AUDIO_PLAYER=""
fi

if [ -n "$AUDIO_PLAYER" ]; then
    log_info "Playing audio using: $AUDIO_PLAYER"
    if $AUDIO_PLAYER "$AUDIO_FILE" 2>&1; then
        log_success "Audio playback test completed"
        log_info "Did you hear the speech?"
    else
        log_error "Audio playback failed"
    fi
else
    log_warn "Skipping playback test - no audio player available"
    log_info "You can manually play the file: $AUDIO_FILE"
fi
echo ""

# Test 5: Different Voices
log_info "Test 5: Testing multiple voices..."
VOICES=("af_bella" "am_adam" "bf_emma")

for voice in "${VOICES[@]}"; do
    log_info "Testing voice: $voice"
    AUDIO_FILE="$TEST_OUTPUT_DIR/test-${voice}.wav"

    HTTP_CODE=$(curl -s -X POST "$KOKORO_URL/v1/audio/speech" \
        -H "Content-Type: application/json" \
        -o "$AUDIO_FILE" \
        -w "%{http_code}" \
        -d "{
            \"model\": \"kokoro\",
            \"voice\": \"$voice\",
            \"input\": \"This is a test for voice $voice\",
            \"speed\": 1.0,
            \"response_format\": \"wav\"
        }")

    if [ "$HTTP_CODE" = "200" ] && [ -f "$AUDIO_FILE" ] && [ -s "$AUDIO_FILE" ]; then
        FILE_SIZE=$(stat -f%z "$AUDIO_FILE" 2>/dev/null || stat -c%s "$AUDIO_FILE" 2>/dev/null)
        log_success "✓ Voice $voice: $FILE_SIZE bytes"
    else
        log_error "✗ Voice $voice: Failed (HTTP code: $HTTP_CODE)"
    fi
done
echo ""

# Test 6: Speed Variations
log_info "Test 6: Testing speed variations..."
SPEEDS=(0.5 1.0 1.5 2.0)

for speed in "${SPEEDS[@]}"; do
    log_info "Testing speed: $speed"
    AUDIO_FILE="$TEST_OUTPUT_DIR/test-speed-${speed}.wav"

    HTTP_CODE=$(curl -s -X POST "$KOKORO_URL/v1/audio/speech" \
        -H "Content-Type: application/json" \
        -o "$AUDIO_FILE" \
        -w "%{http_code}" \
        -d "{
            \"model\": \"kokoro\",
            \"voice\": \"$VOICE\",
            \"input\": \"This is a speed test\",
            \"speed\": $speed,
            \"response_format\": \"wav\"
        }")

    if [ "$HTTP_CODE" = "200" ] && [ -f "$AUDIO_FILE" ] && [ -s "$AUDIO_FILE" ]; then
        FILE_SIZE=$(stat -f%z "$AUDIO_FILE" 2>/dev/null || stat -c%s "$AUDIO_FILE" 2>/dev/null)
        log_success "✓ Speed $speed: $FILE_SIZE bytes"
    else
        log_error "✗ Speed $speed: Failed (HTTP code: $HTTP_CODE)"
    fi
done
echo ""

# Test 7: Edge Cases
log_info "Test 7: Testing edge cases..."

# Empty text
log_info "Testing empty text..."
EMPTY_FILE="$TEST_OUTPUT_DIR/test-empty.wav"
HTTP_CODE=$(curl -s -X POST "$KOKORO_URL/v1/audio/speech" \
    -H "Content-Type: application/json" \
    -o "$EMPTY_FILE" \
    -w "%{http_code}" \
    -d '{"model": "kokoro", "voice": "af_heart", "input": "", "speed": 1.0}')

# Server might return 400 or 200 for empty input
if [ "$HTTP_CODE" != "200" ] || [ ! -s "$EMPTY_FILE" ]; then
    log_success "Empty text handled correctly (HTTP code: $HTTP_CODE)"
else
    log_warn "Empty text produced audio file"
fi

# Very long text
log_info "Testing long text..."
LONG_TEXT="This is a test. "$(printf "%.0s" {1..100}) # Repetitive text
LONG_FILE="$TEST_OUTPUT_DIR/test-long.wav"

HTTP_CODE=$(curl -s -X POST "$KOKORO_URL/v1/audio/speech" \
    -H "Content-Type: application/json" \
    -o "$LONG_FILE" \
    -w "%{http_code}" \
    -d "{
        \"model\": \"kokoro\",
        \"voice\": \"$VOICE\",
        \"input\": \"$LONG_TEXT\",
        \"speed\": 1.0,
        \"response_format\": \"wav\"
    }")

if [ "$HTTP_CODE" = "200" ] && [ -f "$LONG_FILE" ] && [ -s "$LONG_FILE" ]; then
    FILE_SIZE=$(stat -f%z "$LONG_FILE" 2>/dev/null || stat -c%s "$LONG_FILE" 2>/dev/null)
    log_success "Long text handled correctly ($FILE_SIZE bytes)"
else
    log_error "Long text failed (HTTP code: $HTTP_CODE)"
fi
echo ""

# Summary
log_info "================"
log_info "Test Summary"
log_info "================"
log_success "All tests completed!"
log_info "Output files saved to: $TEST_OUTPUT_DIR"
log_info ""
log_info "To manually test playback:"
log_info "  paplay $TEST_OUTPUT_DIR/test-basic.wav"
log_info ""
log_info "To view container logs:"
log_info "  docker logs -f kokoro-cpu"
log_info ""
log_info "To stop the container:"
log_info "  docker stop kokoro-cpu && docker rm kokoro-cpu"
