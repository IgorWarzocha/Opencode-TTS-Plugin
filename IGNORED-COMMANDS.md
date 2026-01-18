# Ignored execution commands

Use this pattern when you need a slash command that executes locally and MUST NOT reach the model.

## Why this works

The TTS plugin watches for a special marker in command files. When the marker is the only content, the plugin handles the command locally and aborts the prompt flow before the model runs.

## Steps

1. Create a command file in `.opencode/command/`.
2. Use only the marker in the body so the model has no extra text to consume.
3. Handle the command in the plugin and throw to stop the LLM call.

## Command file example

```md
---
description: Switch TTS profile
---

[TTS_COMMAND]
```

## Plugin handling checklist

- Detect the marker in `chat.message`.
- Execute the local action.
- Send any feedback with `client.session.prompt({ noReply: true, parts: [{ ignored: true }] })`.
- `throw new Error("__TTS_COMMAND_HANDLED__")` to block the LLM.

## Notes

- Keep the command file body empty except for the marker.
- For commands that SHOULD reach the model, include normal text in the command file instead of using a marker-only body.
