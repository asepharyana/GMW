# Durable Memory Wiki

Consolidated knowledge and long-term facts.

## Core Learnings

- **Topic:** session
  **Context:** Failure observation: session
  *Promoted on:* 2026-06-10T03:02:46.068Z

- **Topic:** biome check diagnosticlevelerror
  **Context:** Failure observation: Exit code 1
$ biome check --diagnostic-level=error .
src/modules/voice-recording/recorder/segment.ts:1:1 assist/source/organizeImports  FIXABLE  ━━━━━━━━━━

  × Sort these imports
  *Promoted on:* 2026-06-10T03:02:46.068Z

- **Topic:** typecheck scope workspace
  **Context:** Failure observation: Exit code 2
$ pnpm -r run typecheck
Scope: 6 of 7 workspace projects
packages/shared typecheck$ tsc --noEmit
packages/shared typecheck: Done
services/backend typecheck$ tsc --noEmit
services/discord-g
  *Promoted on:* 2026-06-10T03:02:46.068Z

- **Topic:** eisdir illegal operation
  **Context:** Failure observation: EISDIR: illegal operation on a directory, read '/mnt/code/bete/packages/shared/src/types/'
  *Promoted on:* 2026-06-10T03:02:46.068Z

- **Topic:** exist current working
  **Context:** Failure observation: File does not exist. Note: your current working directory is /mnt/code/bete.
  *Promoted on:* 2026-06-10T03:02:46.068Z

- **Topic:** error 32603 pattern
  **Context:** Failure observation: MCP error -32603: pattern must be a non-empty string.
  *Promoted on:* 2026-06-10T03:02:46.068Z

- **Topic:** errpnpmnoscript missing script
  **Context:** Failure observation: Exit code 2
[ERR_PNPM_NO_SCRIPT] Missing script: build:shared

Command "build:shared" not found. Did you mean "pnpm run build:backend"?
$ tsc
$ pnpm --filter './services/backend' run build
$ tsc
$ pnp
  *Promoted on:* 2026-06-10T03:02:46.068Z

- **Topic:** projects matched filters
  **Context:** Failure observation: Exit code 1
No projects matched the filters "vendor/*" in "/mnt/code/bete"
Scope: 6 of 7 workspace projects
vendor/discord.js-selfbot-v13 test$ npm run lint && npm run test:typescript && npm run docs:
  *Promoted on:* 2026-06-10T03:02:46.068Z

- **Topic:** scope workspace projects
  **Context:** Failure observation: Exit code 1
$ pnpm -r run test
Scope: 6 of 7 workspace projects
vendor/discord.js-selfbot-v13 test$ npm run lint && npm run test:typescript && npm run docs:test
vendor/discord.js-selfbot-v13 test: > d
  *Promoted on:* 2026-06-10T03:02:46.068Z

- **Topic:** error 32603 include
  **Context:** Failure observation: MCP error -32603: include must be an array of strings.
  *Promoted on:* 2026-06-10T03:02:46.068Z

- **Topic:** nodeinternalmodulescjsloader1522 throw error
  **Context:** Failure observation: Exit code 1
node:internal/modules/cjs/loader:1522
  throw err;
  ^

Error: Cannot find module 'ioredis'
Require stack:
- /mnt/code/bete/[eval]
    at Module._resolveFilename (node:internal/modules/cjs
  *Promoted on:* 2026-06-10T03:02:46.068Z

- **Topic:** biome check diagnosticlevelerror
  **Context:** Failure observation: Exit code 1
$ biome check --diagnostic-level=error src/
src/features/messages/index.tsx:4:1 assist/source/organizeImports  FIXABLE  ━━━━━━━━━━━━━━━━━━━━━━�
  *Promoted on:* 2026-06-10T09:16:35.182Z

- **Topic:** eval1 matches found
  **Context:** Failure observation: Exit code 1
(eval):1: no matches found: tsconfig*.json
  *Promoted on:* 2026-06-10T09:49:12.792Z
