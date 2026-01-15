import { expect, test, describe } from "bun:test";
import { mergeConfig } from "../config";
import { DEFAULT_CONFIG, type TtsConfig, type TtsProfile } from "../types";

describe("Config Management", () => {
  test("mergeConfig correctly applies profile settings", () => {
    const baseConfig: TtsConfig = { ...DEFAULT_CONFIG };
    const newProfile: TtsProfile = {
      backend: "http",
      httpUrl: "http://test-url",
      voice: "test-voice",
    };

    const merged = mergeConfig(baseConfig, newProfile, "test-profile");

    expect(merged.activeProfile).toBe("test-profile");
    expect(merged.backend).toBe("http");
    expect(merged.httpUrl).toBe("http://test-url");
    expect(merged.voice).toBe("test-voice");
    // Should preserve other defaults
    expect(merged.speakOn).toBe(DEFAULT_CONFIG.speakOn);
  });
});
