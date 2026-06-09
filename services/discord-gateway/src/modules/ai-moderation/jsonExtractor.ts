import { createChildLogger } from "@bete/shared/logger";

const log = createChildLogger("jsonExtractor");

/**
 * Helper to extract JSON from a potentially conversational or markdown-wrapped string.
 */
export function extractJson(content: string): unknown {
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g;
  const matches = content.matchAll(codeBlockRegex);
  for (const match of matches) {
    const codeContent = match[1].trim();
    try {
      const parsed = JSON.parse(codeContent);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch (err) {
      log.debug(
        { err: err instanceof Error ? err.message : String(err) },
        "Failed to parse JSON from code block — trying next block",
      );
    }
  }

  for (let start = 0; start < content.length; start++) {
    const firstChar = content[start];
    if (firstChar !== "{" && firstChar !== "[") continue;

    const stack = [firstChar];
    let inString = false;
    let escaped = false;

    for (let i = start + 1; i < content.length; i++) {
      const char = content[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{" || char === "[") {
        stack.push(char);
        continue;
      }

      const last = stack[stack.length - 1];
      if ((char === "}" && last === "{") || (char === "]" && last === "[")) {
        stack.pop();
        if (stack.length === 0) {
          const candidate = content.slice(start, i + 1);
          try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === "object") {
              return parsed;
            }
          } catch (err) {
            log.debug(
              { err: err instanceof Error ? err.message : String(err) },
              "Failed to parse JSON candidate — trying next position",
            );
          }
          break;
        }
      }
    }
  }

  throw new Error("No JSON object found in response");
}
