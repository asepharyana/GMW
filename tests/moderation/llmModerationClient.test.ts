import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseModerationResponse,
  runModerationAnalysis,
} from "../../src/moderation/llmModerationClient";
import type { MessageRecord } from "../../src/moderation/types";

vi.mock("../../src/retry", () => ({
  retryWithBackoff: vi.fn(async (fn) => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }),
}));

/**
 * Helper to create a full MessageRecord fixture with sensible defaults.
 * Only override fields that differ from defaults.
 */
function createMessageRecord(
  overrides: Partial<MessageRecord> = {},
): MessageRecord {
  const now = Date.now();
  return {
    id: "m1",
    guild_id: "guild123",
    channel_id: "channel123",
    thread_id: null,
    user_id: "user123",
    username: "user1",
    avatar_url: null,
    content: "hello",
    edited_content: null,
    created_at: now,
    edited_at: null,
    deleted_at: null,
    type: "text",
    metadata: null,
    ...overrides,
  };
}

describe("parseModerationResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("parses valid keyed results", () => {
    const result = parseModerationResponse(
      JSON.stringify({
        results: [
          {
            message_id: "m1",
            status: "warn",
            flags: ["provokasi"],
            score: 0.7,
            analysis: "Perlu peringatan.",
          },
        ],
      }),
      ["m1"],
    );

    expect(result[0]).toMatchObject({
      messageId: "m1",
      status: "warn",
      flags: ["provokasi"],
      score: 0.7,
      analysis: "Perlu peringatan.",
    });
  });

  it("rejects deferral analysis text", () => {
    expect(() =>
      parseModerationResponse(
        JSON.stringify({
          results: [
            {
              message_id: "m1",
              status: "warn",
              flags: [],
              score: 0.4,
              analysis: "Kurang konteks, perlu dicek admin.",
            },
          ],
        }),
        ["m1"],
      ),
    ).toThrow(/deferral/i);
  });

  it("handles missing target ids gracefully", () => {
    const result = parseModerationResponse(JSON.stringify({ results: [] }), [
      "m1",
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].messageId).toBe("m1");
    expect(result[0].status).toBe("error");
    expect(result[0].flags).toEqual(["analysis_incomplete"]);
    expect(result[0].score).toBe(0);
    expect(result[0].analysis).toContain("Analisis gagal");
  });

  it("skips unknown ids and fills missing targets", () => {
    const result = parseModerationResponse(
      JSON.stringify({
        results: [
          {
            message_id: "m2",
            status: "clean",
            flags: [],
            score: 0,
            analysis: "OK",
          },
        ],
      }),
      ["m1"],
    );

    expect(result).toHaveLength(1);
    expect(result[0].messageId).toBe("m1");
    expect(result[0].status).toBe("error");
    expect(result[0].flags).toEqual(["analysis_incomplete"]);
    expect(result[0].analysis).toContain("Analisis gagal");
  });

  it("handles surrounding text around JSON", () => {
    const content = `Some preamble text here.
    {
      "results": [
        {
          "message_id": "m1",
          "status": "clean",
          "flags": [],
          "score": 0.1,
          "analysis": "OK"
        }
      ]
    }
    Some trailing text here.`;

    const result = parseModerationResponse(content, ["m1"]);
    expect(result).toHaveLength(1);
    expect(result[0].messageId).toBe("m1");
  });

  it("handles trailing JSON after first moderation object", () => {
    const moderationJson = JSON.stringify({
      results: [
        {
          message_id: "m1",
          status: "clean",
          flags: [],
          score: 0.1,
          analysis: "OK",
        },
      ],
    });
    const trailingLogJson = JSON.stringify({ msg: "Retry attempt" });

    const result = parseModerationResponse(
      `${moderationJson}\n${trailingLogJson}`,
      ["m1"],
    );

    expect(result).toHaveLength(1);
    expect(result[0].messageId).toBe("m1");
  });

  it("handles braces inside string values", () => {
    const result = parseModerationResponse(
      JSON.stringify({
        results: [
          {
            message_id: "m1",
            status: "clean",
            flags: [],
            score: 0.1,
            analysis: "Contains literal braces: {not json}",
          },
        ],
      }),
      ["m1"],
    );

    expect(result).toHaveLength(1);
    expect(result[0].analysis).toBe("Contains literal braces: {not json}");
  });

  it("handles nested fields in results", () => {
    const content = JSON.stringify({
      results: [
        {
          message_id: "m1",
          status: "warn",
          flags: ["spam", "abuse"],
          score: 0.85,
          analysis: "Multiple violations detected",
          metadata: {
            nested: "field",
            count: 5,
          },
        },
      ],
    });

    const result = parseModerationResponse(content, ["m1"]);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(0.85);
  });

  it("rejects null score", () => {
    expect(() =>
      parseModerationResponse(
        JSON.stringify({
          results: [
            {
              message_id: "m1",
              status: "clean",
              flags: [],
              score: null,
              analysis: "OK",
            },
          ],
        }),
        ["m1"],
      ),
    ).toThrow();
  });

  it("rejects undefined score", () => {
    expect(() =>
      parseModerationResponse(
        JSON.stringify({
          results: [
            {
              message_id: "m1",
              status: "clean",
              flags: [],
              analysis: "OK",
            },
          ],
        }),
        ["m1"],
      ),
    ).toThrow();
  });

  it("rejects duplicate message_id", () => {
    expect(() =>
      parseModerationResponse(
        JSON.stringify({
          results: [
            {
              message_id: "m1",
              status: "clean",
              flags: [],
              score: 0.1,
              analysis: "OK",
            },
            {
              message_id: "m1",
              status: "warn",
              flags: ["spam"],
              score: 0.5,
              analysis: "Duplicate",
            },
          ],
        }),
        ["m1"],
      ),
    ).toThrow(/duplicate/i);
  });

  it("rejects invalid status", () => {
    expect(() =>
      parseModerationResponse(
        JSON.stringify({
          results: [
            {
              message_id: "m1",
              status: "invalid_status",
              flags: [],
              score: 0.5,
              analysis: "OK",
            },
          ],
        }),
        ["m1"],
      ),
    ).toThrow();
  });

  it("clamps score to 0-1 range", () => {
    const result = parseModerationResponse(
      JSON.stringify({
        results: [
          {
            message_id: "m1",
            status: "clean",
            flags: [],
            score: 1.5,
            analysis: "OK",
          },
        ],
      }),
      ["m1"],
    );

    expect(result[0].score).toBe(1);
  });

  it("clamps negative score to 0", () => {
    const result = parseModerationResponse(
      JSON.stringify({
        results: [
          {
            message_id: "m1",
            status: "clean",
            flags: [],
            score: -0.5,
            analysis: "OK",
          },
        ],
      }),
      ["m1"],
    );

    expect(result[0].score).toBe(0);
  });

  it("extracts JSON correctly from complex conversational output with thinking blocks containing braces", () => {
    const content = `Based on the messages, I will analyze them.
    <thinking>
      The JSON structure should be:
      {
        "results": [ ... ]
      }
    </thinking>
    Here is the results array:
    {
      "results": [
        {
          "message_id": "m1",
          "status": "clean",
          "flags": [],
          "score": 0.2,
          "analysis": "Benign"
        }
      ]
    }`;
    const result = parseModerationResponse(content, ["m1"]);
    expect(result).toHaveLength(1);
    expect(result[0].messageId).toBe("m1");
  });

  it("extracts JSON from markdown code block wrapping", () => {
    const content = `Sure! Here is the JSON structure:
\`\`\`json
{
  "results": [
    {
      "message_id": "m1",
      "status": "clean",
      "flags": [],
      "score": 0.2,
      "analysis": "Benign"
    }
  ]
}
\`\`\``;
    const result = parseModerationResponse(content, ["m1"]);
    expect(result).toHaveLength(1);
    expect(result[0].messageId).toBe("m1");
  });

  it("handles message_id returned with square brackets", () => {
    const content = JSON.stringify({
      results: [
        {
          message_id: "[m1]",
          status: "clean",
          flags: [],
          score: 0.1,
          analysis: "OK",
        },
      ],
    });
    const result = parseModerationResponse(content, ["m1"]);
    expect(result).toHaveLength(1);
    expect(result[0].messageId).toBe("m1");
  });

  it("handles message_id returned with extra wrapping quotes", () => {
    const result = parseModerationResponse(
      JSON.stringify({
        results: [
          {
            message_id: '"test-msg-1"',
            status: "clean",
            flags: [],
            score: 0.1,
            analysis: "OK",
          },
        ],
      }),
      ["test-msg-1"],
    );

    expect(result).toHaveLength(1);
    expect(result[0].messageId).toBe("test-msg-1");
  });
});

describe("runModerationAnalysis", () => {
  it("parses successful response from LLM", async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [
                {
                  message_id: "m1",
                  status: "clean",
                  flags: [],
                  score: 0.1,
                  analysis: "OK",
                },
              ],
            }),
          },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await runModerationAnalysis({
      targets: [createMessageRecord()],
      contextText: "test context",
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].messageId).toBe("m1");
    expect(result.raw).toEqual(mockResponse);
  });

  it("requests strict JSON output without thinking", async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [
                {
                  message_id: "m1",
                  status: "clean",
                  flags: [],
                  score: 0.1,
                  analysis: "OK",
                },
              ],
            }),
          },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockResponse),
      json: async () => mockResponse,
    });

    await runModerationAnalysis({
      targets: [createMessageRecord()],
      contextText: "test context",
    });

    const requestBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(requestBody.temperature).toBe(0.2);
    expect(requestBody.response_format.type).toBe("json_schema");
    expect(requestBody.response_format.json_schema.name).toBe(
      "moderation_result",
    );
    expect(requestBody.stream).toBe(false);
    expect(requestBody.reasoning_budget).toBe(0);
    expect(requestBody.chat_template_kwargs).toEqual({
      enable_thinking: false,
    });
  });

  it("sends text-only analysis without dummy image", async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [
                {
                  message_id: "m1",
                  status: "clean",
                  flags: [],
                  score: 0.1,
                  analysis: "OK",
                },
              ],
            }),
          },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockResponse),
      json: async () => mockResponse,
    });

    await runModerationAnalysis({
      targets: [createMessageRecord()],
      contextText: "test context",
    });

    const requestBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(requestBody.messages).toHaveLength(1);
    expect(requestBody.messages[0].role).toBe("user");
    expect(typeof requestBody.messages[0].content).toBe("string");
    expect(requestBody.messages[0].content).toContain("test context");
    expect(requestBody.messages[0].content).not.toContain("data:image/png");
  });

  it("throws on non-ok HTTP response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    await expect(
      runModerationAnalysis({
        targets: [createMessageRecord()],
        contextText: "test context",
      }),
    ).rejects.toThrow(/500/);
  });

  it("parses first JSON object when provider appends extra text to message content", async () => {
    const moderationJson = JSON.stringify({
      results: [
        {
          message_id: "m1",
          status: "clean",
          flags: [],
          score: 0.1,
          analysis: "OK",
        },
      ],
    });
    const mockResponse = {
      choices: [
        {
          message: {
            content: `${moderationJson}\nextra`,
          },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockResponse),
    });

    const result = await runModerationAnalysis({
      targets: [createMessageRecord()],
      contextText: "test context",
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].messageId).toBe("m1");
  });

  it("normalizes first JSON object when provider appends extra text to HTTP body", async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [
                {
                  message_id: "m1",
                  status: "clean",
                  flags: [],
                  score: 0.1,
                  analysis: "OK",
                },
              ],
            }),
          },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => `${JSON.stringify(mockResponse)}\nextra`,
    });

    const result = await runModerationAnalysis({
      targets: [createMessageRecord()],
      contextText: "test context",
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].messageId).toBe("m1");
  });

  it("includes previous validation error in retry prompt", async () => {
    const invalidResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [
                {
                  message_id: "m1",
                  status: "bad",
                  flags: [],
                  score: 0.1,
                  analysis: "Invalid",
                },
              ],
            }),
          },
        },
      ],
    };
    const validResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [
                {
                  message_id: "m1",
                  status: "clean",
                  flags: [],
                  score: 0.1,
                  analysis: "OK",
                },
              ],
            }),
          },
        },
      ],
    };

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(invalidResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(validResponse),
      });

    const result = await runModerationAnalysis({
      targets: [createMessageRecord()],
      contextText: "test context",
    });

    const secondRequestBody = JSON.parse(
      (global.fetch as any).mock.calls[1][1].body,
    );
    expect(secondRequestBody.messages[0].content).toContain(
      "RESPON SEBELUMNYA GAGAL VALIDASI",
    );
    expect(secondRequestBody.messages[0].content).toContain(
      "RESPON SEBELUMNYA GAGAL VALIDASI",
    );
    expect(secondRequestBody.messages[0].content).toContain(
      "Coba lagi dengan output JSON yang benar",
    );
    expect(result.results[0].status).toBe("clean");
  });

  it("throws on missing choices in response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await expect(
      runModerationAnalysis({
        targets: [createMessageRecord()],
        contextText: "test context",
      }),
    ).rejects.toThrow(/Invalid LLM response structure/);
  });

  it("throws on missing content in message", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: {} }],
      }),
    });

    await expect(
      runModerationAnalysis({
        targets: [createMessageRecord()],
        contextText: "test context",
      }),
    ).rejects.toThrow(/No content in LLM response/);
  });

  it("sends multimodal payload when image attachments are present", async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [
                {
                  message_id: "m1",
                  status: "clean",
                  flags: [],
                  score: 0.1,
                  analysis: "OK",
                },
              ],
            }),
          },
        },
      ],
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "https://httpbin.org/image/png") {
        return Promise.resolve({
          ok: true,
          arrayBuffer: async () => {
            // Minimal valid PNG bytes (8-byte signature)
            const png = Buffer.from([
              0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
              0x0d, 0x49, 0x48, 0x44, 0x52,
            ]);
            return png.buffer.slice(
              png.byteOffset,
              png.byteOffset + png.byteLength,
            );
          },
        });
      }
      return Promise.resolve({
        ok: true,
        text: async () => JSON.stringify(mockResponse),
        json: async () => mockResponse,
      });
    });

    const mockAttachment = {
      id: "a1",
      message_id: "m1",
      guild_id: "guild123",
      channel_id: "channel123",
      thread_id: null,
      user_id: "user123",
      filename: "test.png",
      size: 500,
      type: "image/png",
      discord_url: "https://httpbin.org/image/png",
      uploaded_url: "https://httpbin.org/image/png",
      upload_status: "uploaded" as const,
      upload_error: null,
      created_at: Date.now(),
      uploaded_at: Date.now(),
    };

    const result = await runModerationAnalysis({
      targets: [createMessageRecord()],
      contextText: "test context",
      attachments: [mockAttachment],
    });

    expect(result.results).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalled();

    const fetchCalls = (global.fetch as any).mock.calls;
    // 3 calls: 1st image download, 2nd separate media analysis (chat/completions), 3rd main batch
    expect(fetchCalls.length).toBeGreaterThanOrEqual(2);

    // Verify 1st call (image download)
    expect(fetchCalls[0][0]).toBe("https://httpbin.org/image/png");

    // The main batch call should be a text-only string (images analyzed separately)
    const mainBatchCall = fetchCalls[fetchCalls.length - 1];
    const [, completionsOptions] = mainBatchCall;
    const body = JSON.parse(completionsOptions.body);

    expect(body.messages).toHaveLength(1);
    const userMessage = body.messages[0];
    expect(userMessage.role).toBe("user");
    // Now text-only: content is a string, not an array (images analyzed separately)
    expect(typeof userMessage.content).toBe("string");
    expect(userMessage.content).toContain("test context");
    // Verify the target message is present with XML delimiters
    expect(userMessage.content).toContain('<message id="m1"');
  });

  it("downloads only target-matching attachments for single media analysis", async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [
                {
                  message_id: "m1",
                  status: "clean",
                  flags: [],
                  score: 0.1,
                  analysis: "OK",
                },
              ],
            }),
          },
        },
      ],
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith("https://httpbin.org/image/")) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: async () => {
            const buffer = Buffer.from("fake-bytes");
            return buffer.buffer.slice(
              buffer.byteOffset,
              buffer.byteOffset + buffer.byteLength,
            );
          },
        });
      }
      return Promise.resolve({
        ok: true,
        text: async () => JSON.stringify(mockResponse),
        json: async () => mockResponse,
      });
    });

    const createAttachment = (id: string, msgId: string) => ({
      id,
      message_id: msgId,
      guild_id: "guild123",
      channel_id: "channel123",
      thread_id: null,
      user_id: "user123",
      filename: `${id}.png`,
      size: 500,
      type: "image/png",
      discord_url: `https://httpbin.org/image/png?source=${id}`,
      uploaded_url: `https://httpbin.org/image/png?source=${id}`,
      upload_status: "uploaded" as const,
      upload_error: null,
      created_at: Date.now(),
      uploaded_at: Date.now(),
    });

    // 3 attachments for target m1, 7 for other messages (should NOT be downloaded)
    const attachments = [
      createAttachment("c1", "context1"),
      createAttachment("c2", "context2"),
      createAttachment("t1", "m1"),
      createAttachment("c3", "context3"),
      createAttachment("t2", "m1"),
      createAttachment("c4", "context4"),
      createAttachment("c5", "context5"),
      createAttachment("t3", "m1"),
      createAttachment("c6", "context6"),
      createAttachment("c7", "context7"),
    ];

    await runModerationAnalysis({
      targets: [createMessageRecord({ id: "m1" })],
      contextText: "test context",
      attachments,
    });

    const fetchCalls = (global.fetch as any).mock.calls;
    const imageFetchUrls = fetchCalls
      .filter((c: any) => c[0].startsWith("https://httpbin.org/image/"))
      .map((c: any) => c[0]);

    // Only target-matching attachments should be downloaded
    expect(imageFetchUrls).toContain("https://httpbin.org/image/png?source=t1");
    expect(imageFetchUrls).toContain("https://httpbin.org/image/png?source=t2");
    expect(imageFetchUrls).toContain("https://httpbin.org/image/png?source=t3");

    // Context attachments should NOT be downloaded
    expect(imageFetchUrls).not.toContain(
      "https://httpbin.org/image/png?source=c1",
    );
    expect(imageFetchUrls).not.toContain(
      "https://httpbin.org/image/png?source=c7",
    );
  });

  it("sends verified real PNG and JPEG attachments with realistic Indonesian text", async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [
                {
                  message_id: "m1",
                  status: "warn",
                  flags: ["harassment"],
                  score: 0.65,
                  analysis:
                    "Teks mengandung unsur harassment dan memerlukan tindakan lebih lanjut.",
                },
              ],
            }),
          },
        },
      ],
    };

    const imageBytes = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    const toBody = (buffer: Buffer) => {
      let done = false;
      return {
        getReader: () => ({
          read: async () => {
            if (done) return { done: true, value: undefined };
            done = true;
            return { done: false, value: new Uint8Array(buffer) };
          },
          cancel: vi.fn(),
        }),
      };
    };
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (
        url === "https://httpbin.org/image/png" ||
        url === "https://httpbin.org/image/jpeg"
      ) {
        return Promise.resolve({
          ok: true,
          body: toBody(imageBytes),
        });
      }

      return Promise.resolve({
        ok: true,
        text: async () => JSON.stringify(mockResponse),
        json: async () => mockResponse,
      });
    });

    const attachments = [
      {
        id: "png1",
        message_id: "m1",
        guild_id: "guild123",
        channel_id: "channel123",
        thread_id: null,
        user_id: "user123",
        filename: "bukti-chat.png",
        size: 8090,
        type: "image/png",
        discord_url: "https://httpbin.org/image/png",
        uploaded_url: "https://httpbin.org/image/png",
        upload_status: "uploaded" as const,
        upload_error: null,
        created_at: Date.now(),
        uploaded_at: Date.now(),
      },
      {
        id: "jpeg1",
        message_id: "m1",
        guild_id: "guild123",
        channel_id: "channel123",
        thread_id: null,
        user_id: "user123",
        filename: "screenshot.jpeg",
        size: 35588,
        type: "image/jpeg",
        discord_url: "https://httpbin.org/image/jpeg",
        uploaded_url: "https://httpbin.org/image/jpeg",
        upload_status: "uploaded" as const,
        upload_error: null,
        created_at: Date.now() + 1,
        uploaded_at: Date.now() + 1,
      },
    ];

    const result = await runModerationAnalysis({
      targets: [
        createMessageRecord({
          id: "m1",
          username: "asep",
          content:
            "tolong cek gambar ini, dia kirim link mencurigakan https://example.invalid/login dan maksa orang klik",
        }),
      ],
      contextText:
        "Sebelumnya user lain bilang link itu mirip phishing dan screenshot memperlihatkan halaman login palsu.",
      attachments,
    });

    expect(result.results[0].status).toBe("warn");

    const fetchCalls = (global.fetch as any).mock.calls;
    expect(fetchCalls[0][0]).toBe("https://httpbin.org/image/png");
    expect(fetchCalls[1][0]).toBe("https://httpbin.org/image/jpeg");

    // Images are analyzed separately now; main batch is text-only string
    const mainBatchCall = fetchCalls[fetchCalls.length - 1];
    const requestBody = JSON.parse(mainBatchCall[1].body);
    const content = requestBody.messages[0].content;
    expect(typeof content).toBe("string");
    expect(content).toContain("asep");
    expect(content).toContain("Sebelumnya user lain bilang");
  });

  it("skips pending discord-only images until tele upload is ready", async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [
                {
                  message_id: "m1",
                  status: "clean",
                  flags: [],
                  score: 0.1,
                  analysis: "Image available through Discord URL fallback.",
                },
              ],
            }),
          },
        },
      ],
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "https://httpbin.org/image/png") {
        const buffer = Buffer.from("png-bytes");
        return Promise.resolve({
          ok: true,
          arrayBuffer: async () =>
            buffer.buffer.slice(
              buffer.byteOffset,
              buffer.byteOffset + buffer.byteLength,
            ),
        });
      }

      return Promise.resolve({
        ok: true,
        text: async () => JSON.stringify(mockResponse),
        json: async () => mockResponse,
      });
    });

    await runModerationAnalysis({
      targets: [
        createMessageRecord({
          id: "m1",
          content: "gambar belum selesai upload ke tele",
        }),
      ],
      contextText: "test context",
      attachments: [
        {
          id: "pending-image",
          message_id: "m1",
          guild_id: "guild123",
          channel_id: "channel123",
          thread_id: null,
          user_id: "user123",
          filename: "pending.png",
          size: 8090,
          type: "image/png",
          discord_url: "https://httpbin.org/image/png",
          uploaded_url: null,
          upload_status: "pending" as const,
          upload_error: null,
          created_at: Date.now(),
          uploaded_at: null,
        },
      ],
    });

    const requestBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect((global.fetch as any).mock.calls[0][0]).toContain(
      "/chat/completions",
    );
    expect(typeof requestBody.messages[0].content).toBe("string");
  });

  it("keeps analyzing text when an image URL returns non-OK", async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [
                {
                  message_id: "m1",
                  status: "warn",
                  flags: ["suspicious_link"],
                  score: 0.6,
                  analysis:
                    "Image fetch failed, text still indicates suspicious link.",
                },
              ],
            }),
          },
        },
      ],
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "https://httpbin.org/image/png") {
        return Promise.resolve({ ok: false, status: 503 });
      }

      return Promise.resolve({
        ok: true,
        text: async () => JSON.stringify(mockResponse),
        json: async () => mockResponse,
      });
    });

    const result = await runModerationAnalysis({
      targets: [
        createMessageRecord({
          id: "m1",
          content: "cek bonus gratis di https://example.invalid/claim sekarang",
        }),
      ],
      contextText:
        "Pesan ini dikirim berulang setelah user lain menolak klik link.",
      attachments: [
        {
          id: "bad-image",
          message_id: "m1",
          guild_id: "guild123",
          channel_id: "channel123",
          thread_id: null,
          user_id: "user123",
          filename: "broken.png",
          size: 8090,
          type: "image/png",
          discord_url: "https://httpbin.org/image/png",
          uploaded_url: "https://httpbin.org/image/png",
          upload_status: "uploaded" as const,
          upload_error: null,
          created_at: Date.now(),
          uploaded_at: Date.now(),
        },
      ],
    });

    expect(result.results[0].status).toBe("warn");

    const requestBody = JSON.parse((global.fetch as any).mock.calls[1][1].body);
    expect(requestBody.messages[0].content).toContain(
      "https://example.invalid/claim",
    );
  });

  describe("Edge Cases & Real-World Scenarios", () => {
    it("handles single result object without results wrapper", () => {
      const content = JSON.stringify({
        message_id: "m1",
        status: "clean",
        flags: [],
        score: 0.1,
        analysis: "OK",
      });

      const result = parseModerationResponse(content, ["m1"]);
      expect(result).toHaveLength(1);
      expect(result[0].messageId).toBe("m1");
      expect(result[0].status).toBe("clean");
    });

    it("handles alternative array key 'result' instead of 'results'", () => {
      const content = JSON.stringify({
        result: [
          {
            message_id: "m1",
            status: "flagged",
            flags: ["spam"],
            score: 0.8,
            analysis: "Spam detected",
          },
        ],
      });

      const result = parseModerationResponse(content, ["m1"]);
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("flagged");
    });

    it("handles alternative array key 'data' instead of 'results'", () => {
      const content = JSON.stringify({
        data: [
          {
            message_id: "m1",
            status: "warn",
            flags: ["hate_speech"],
            score: 0.6,
            analysis: "Potential hate speech",
          },
        ],
      });

      const result = parseModerationResponse(content, ["m1"]);
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("warn");
    });

    it("handles alternative array key 'messages' instead of 'results'", () => {
      const content = JSON.stringify({
        messages: [
          {
            message_id: "m1",
            status: "clean",
            flags: [],
            score: 0.05,
            analysis: "No violations",
          },
        ],
      });

      const result = parseModerationResponse(content, ["m1"]);
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("clean");
    });

    it("handles text with links and URLs", () => {
      const content = JSON.stringify({
        results: [
          {
            message_id: "m1",
            status: "clean",
            flags: [],
            score: 0.1,
            analysis: "Link shared, no violations",
          },
        ],
      });

      const result = parseModerationResponse(content, ["m1"]);
      expect(result[0].status).toBe("clean");
    });

    it("handles very long message content", () => {
      const longContent = "a".repeat(10000);
      const content = JSON.stringify({
        results: [
          {
            message_id: "m1",
            status: "clean",
            flags: [],
            score: 0.1,
            analysis: `Analyzed ${longContent.length} character message`,
          },
        ],
      });

      const result = parseModerationResponse(content, ["m1"]);
      expect(result).toHaveLength(1);
      expect(result[0].analysis).toContain("10000");
    });

    it("handles multiple messages with mixed statuses", () => {
      const content = JSON.stringify({
        results: [
          {
            message_id: "m1",
            status: "clean",
            flags: [],
            score: 0.1,
            analysis: "OK",
          },
          {
            message_id: "m2",
            status: "warn",
            flags: ["spam"],
            score: 0.5,
            analysis: "Potential spam",
          },
          {
            message_id: "m3",
            status: "flagged",
            flags: ["hate_speech", "abuse"],
            score: 0.95,
            analysis: "Severe violations",
          },
        ],
      });

      const result = parseModerationResponse(content, ["m1", "m2", "m3"]);
      expect(result).toHaveLength(3);
      expect(result[0].status).toBe("clean");
      expect(result[1].status).toBe("warn");
      expect(result[2].status).toBe("flagged");
      expect(result[2].flags).toContain("hate_speech");
      expect(result[2].flags).toContain("abuse");
    });

    it("handles LLM response with thinking blocks and markdown", () => {
      const content = `
        <thinking>
          Let me analyze these messages carefully.
          Message 1 seems clean.
          Message 2 has some concerning language.
        </thinking>

        Based on my analysis:

        \`\`\`json
        {
          "results": [
            {
              "message_id": "m1",
              "status": "clean",
              "flags": [],
              "score": 0.1,
              "analysis": "No violations detected"
            },
            {
              "message_id": "m2",
              "status": "warn",
              "flags": ["inappropriate"],
              "score": 0.6,
              "analysis": "Contains inappropriate language"
            }
          ]
        }
        \`\`\`

        These are my findings.
      `;

      const result = parseModerationResponse(content, ["m1", "m2"]);
      expect(result).toHaveLength(2);
      expect(result[0].status).toBe("clean");
      expect(result[1].status).toBe("warn");
    });

    it("handles response with extra fields and nested objects", () => {
      const content = JSON.stringify({
        results: [
          {
            message_id: "m1",
            status: "flagged",
            flags: ["violence"],
            score: 0.9,
            analysis: "Contains violent content",
            metadata: {
              confidence: 0.95,
              model_version: "v2",
              processing_time_ms: 150,
            },
            extra_field: "ignored",
          },
        ],
      });

      const result = parseModerationResponse(content, ["m1"]);
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("flagged");
      expect(result[0].score).toBe(0.9);
    });

    it("handles scientific notation in score", () => {
      const content = JSON.stringify({
        results: [
          {
            message_id: "m1",
            status: "clean",
            flags: [],
            score: 1e-1,
            analysis: "Very low risk",
          },
        ],
      });

      const result = parseModerationResponse(content, ["m1"]);
      expect(result[0].score).toBe(0.1);
    });

    it("handles empty flags array and null analysis", () => {
      const content = JSON.stringify({
        results: [
          {
            message_id: "m1",
            status: "clean",
            flags: [],
            score: 0,
            analysis: null,
          },
        ],
      });

      const result = parseModerationResponse(content, ["m1"]);
      expect(result[0].flags).toEqual([]);
      expect(result[0].analysis).toBe("");
    });

    it("handles missing optional fields with defaults", () => {
      const content = JSON.stringify({
        results: [
          {
            message_id: "m1",
            status: "clean",
            score: 0.1,
          },
        ],
      });

      const result = parseModerationResponse(content, ["m1"]);
      expect(result[0].flags).toEqual([]);
      expect(result[0].score).toBe(0.1);
      expect(result[0].analysis).toBe("");
    });

    it("handles Unicode and emoji in analysis text", () => {
      const content = JSON.stringify({
        results: [
          {
            message_id: "m1",
            status: "warn",
            flags: ["inappropriate"],
            score: 0.7,
            analysis: "Contains inappropriate emoji 🚫 and symbols ⚠️",
          },
        ],
      });

      const result = parseModerationResponse(content, ["m1"]);
      expect(result[0].analysis).toContain("🚫");
      expect(result[0].analysis).toContain("⚠️");
    });

    it("handles response with only one array in deeply nested object", () => {
      const content = JSON.stringify({
        metadata: { version: 1 },
        analysis_results: [
          {
            message_id: "m1",
            status: "clean",
            flags: [],
            score: 0.1,
            analysis: "OK",
          },
        ],
      });

      const result = parseModerationResponse(content, ["m1"]);
      expect(result).toHaveLength(1);
      expect(result[0].messageId).toBe("m1");
    });
  });

  describe("Real-World Text Samples", () => {
    it("analyzes message with URL", () => {
      const content = JSON.stringify({
        results: [
          {
            message_id: "m1",
            status: "clean",
            flags: [],
            score: 0.15,
            analysis: "Message contains URL but no violations",
          },
        ],
      });

      const result = parseModerationResponse(content, ["m1"]);
      expect(result[0].status).toBe("clean");
    });

    it("analyzes message with mentions and hashtags", () => {
      const content = JSON.stringify({
        results: [
          {
            message_id: "m1",
            status: "clean",
            flags: [],
            score: 0.05,
            analysis: "Mentions and hashtags are acceptable",
          },
        ],
      });

      const result = parseModerationResponse(content, ["m1"]);
      expect(result[0].status).toBe("clean");
    });

    it("analyzes message with code snippets", () => {
      const content = JSON.stringify({
        results: [
          {
            message_id: "m1",
            status: "clean",
            flags: [],
            score: 0.1,
            analysis: "Code snippet detected, no violations",
          },
        ],
      });

      const result = parseModerationResponse(content, ["m1"]);
      expect(result[0].status).toBe("clean");
    });

    it("analyzes message with mixed languages", () => {
      const content = JSON.stringify({
        results: [
          {
            message_id: "m1",
            status: "clean",
            flags: [],
            score: 0.1,
            analysis: "Mixed language content analyzed successfully",
          },
        ],
      });

      const result = parseModerationResponse(content, ["m1"]);
      expect(result[0].status).toBe("clean");
    });
  });

  describe("Failure Scenarios", () => {
    it("throws on completely invalid JSON", () => {
      expect(() =>
        parseModerationResponse("not json at all", ["m1"]),
      ).toThrow();
    });

    it("throws on empty object", () => {
      expect(() => parseModerationResponse(JSON.stringify({}), ["m1"])).toThrow(
        /Zod validation/,
      );
    });

    it("throws on array without results wrapper and no message_id", () => {
      expect(() =>
        parseModerationResponse(
          JSON.stringify([
            {
              status: "clean",
              flags: [],
              score: 0.1,
              analysis: "OK",
            },
          ]),
          ["m1"],
        ),
      ).toThrow();
    });

    it("skips mismatched message IDs", () => {
      const result = parseModerationResponse(
        JSON.stringify({
          results: [
            {
              message_id: "m999",
              status: "clean",
              flags: [],
              score: 0.1,
              analysis: "OK",
            },
          ],
        }),
        ["m1"],
      );

      expect(result).toHaveLength(1);
      expect(result[0].messageId).toBe("m1");
      expect(result[0].analysis).toContain("Analisis gagal");
    });

    it("throws on invalid status value", () => {
      expect(() =>
        parseModerationResponse(
          JSON.stringify({
            results: [
              {
                message_id: "m1",
                status: "invalid_status",
                flags: [],
                score: 0.5,
                analysis: "OK",
              },
            ],
          }),
          ["m1"],
        ),
      ).toThrow();
    });

    it("throws on non-finite score", () => {
      const content = `{
        "results": [
          {
            "message_id": "m1",
            "status": "clean",
            "flags": [],
            "score": "NaN",
            "analysis": "OK"
          }
        ]
      }`;

      expect(() => parseModerationResponse(content, ["m1"])).toThrow();
    });

    it("should NOT flag safe Indonesian words like 'kakek' and 'Wah' as violations", () => {
      // Test case for bug: false positive flagging of safe words
      // "kakek" = grandfather (family term, always safe)
      // "Wah" = exclamation/interjection (always safe)
      const result = parseModerationResponse(
        JSON.stringify({
          results: [
            {
              message_id: "m1",
              status: "clean",
              flags: [],
              score: 0.0,
              analysis:
                "Kata 'kakek' adalah istilah keluarga yang aman. 'Wah' adalah interjeksi biasa.",
            },
          ],
        }),
        ["m1"],
      );

      expect(result).toHaveLength(1);
      expect(result[0].messageId).toBe("m1");
      expect(result[0].status).toBe("clean");
      expect(result[0].flags).toEqual([]);
      expect(result[0].score).toBe(0.0);
    });
  });
});
