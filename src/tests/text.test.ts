import { expect, test, describe } from "bun:test";
import { parseTtsCommand, normalizeCommandArgs } from "../text";

describe("Text Processing", () => {
  test("parseTtsCommand correctly identifies commands", () => {
    expect(parseTtsCommand("/tts on")).toBe("on");
    expect(parseTtsCommand("/tts off")).toBe("off");
    expect(parseTtsCommand("/tts profile polish")).toBe("profile polish");
    expect(parseTtsCommand("/tts profile default")).toBe("profile default");
    expect(parseTtsCommand("just some text")).toBe(null);
  });

  test("normalizeCommandArgs handles various formats", () => {
    expect(normalizeCommandArgs(" ON")).toBe("on");
    expect(normalizeCommandArgs("off")).toBe("off");
    expect(normalizeCommandArgs("Profile Polish")).toBe("profile polish");
  });
});
