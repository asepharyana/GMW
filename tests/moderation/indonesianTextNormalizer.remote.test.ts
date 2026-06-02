import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../../src/config";

const mocks = vi.hoisted(() => ({
  openaiCreate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: mocks.openaiCreate,
      },
    };
  },
}));

describe("detectIndonesianBadwords primary AI", () => {
  beforeEach(() => {
    mocks.openaiCreate.mockReset();
    config.AI_LLM_API_KEY = "test-primary-key";
  });

  it("calls primary AI and caches the result", async () => {
    mocks.openaiCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ flags: ["harassment"] }),
          },
        },
      ],
    });

    const { detectIndonesianBadwords } = await import(
      "../../src/moderation/indonesianTextNormalizer"
    );

    const first = await detectIndonesianBadwords("squad jump soalnya");
    const second = await detectIndonesianBadwords("squad jump soalnya");

    expect(first).toEqual(["harassment"]);
    expect(second).toEqual(["harassment"]);
    expect(mocks.openaiCreate).toHaveBeenCalledTimes(1);
  });

  it("returns empty array when primary AI fails", async () => {
    mocks.openaiCreate.mockRejectedValue(new Error("API down"));

    const { detectIndonesianBadwords } = await import(
      "../../src/moderation/indonesianTextNormalizer"
    );

    const result = await detectIndonesianBadwords("some text");
    expect(result).toEqual([]);
  });
});
