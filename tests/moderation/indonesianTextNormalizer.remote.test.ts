import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../../src/config";

const mocks = vi.hoisted(() => ({
  axiosPost: vi.fn(),
  openaiCreate: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    post: mocks.axiosPost,
    isAxiosError: (error: unknown) =>
      Boolean(
        error &&
          typeof error === "object" &&
          "isAxiosError" in error &&
          (error as { isAxiosError?: unknown }).isAxiosError,
      ),
  },
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

describe("detectIndonesianBadwords remote fallback", () => {
  beforeEach(() => {
    mocks.axiosPost.mockReset();
    mocks.openaiCreate.mockReset();
    config.NVIDIA_NEMOTRON_API_KEY = "test-nemotron-key";
    config.AI_LLM_API_KEY = "test-primary-key";
  });

  it("falls back to primary AI after Nemotron rate limits and caches the result", async () => {
    mocks.axiosPost.mockRejectedValue({
      isAxiosError: true,
      response: { status: 429 },
      message: "Too Many Requests",
    });
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
    expect(mocks.axiosPost).toHaveBeenCalledTimes(1);
    expect(mocks.openaiCreate).toHaveBeenCalledTimes(1);
  });
});
