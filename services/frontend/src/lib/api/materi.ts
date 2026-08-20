// Materi API client — talks to backend /trpc materi router
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { orpc } from "@/lib/orpc/client";
import type { MateriDocument, CreateMateriInput, MateriRagChatResult, MateriRagChatMessage } from "@/lib/types/materi";
import type { ORPCClient } from "@/lib/orpc/types";

const BACKEND_URL =
  process.env.GMW_BACKEND_URL?.replace(/\/+$/, "") || "http://127.0.0.1:4001";

let _serverClient: ORPCClient | null = null;
function serverOrpc(): ORPCClient {
  if (!_serverClient) {
    const link = new RPCLink({
      url: BACKEND_URL + "/trpc",
      fetch(url, init) {
        return fetch(url, { ...init, cache: "no-store" });
      },
    });
    _serverClient = createORPCClient(link) as unknown as ORPCClient;
  }
  return _serverClient;
}

// Server-side (SSR seed) — uses the HTTP RPCLink via oRPC
export async function listMateriSSR(limit = 50, search?: string): Promise<MateriDocument[]> {
  return (serverOrpc() as any).materi.list({
    limit,
    search,
  }) as unknown as Promise<MateriDocument[]>;
}

export async function getMateriSSR(id: string): Promise<MateriDocument | null> {
  return (serverOrpc() as any).materi.detail({
    id,
  }) as unknown as Promise<MateriDocument | null>;
}

// Client-side — browser WebSocket RPCLink (orpc is "use client")
export async function createMateri(input: CreateMateriInput): Promise<MateriDocument> {
  return orpc.materi.create(input) as unknown as Promise<MateriDocument>;
}

export async function updateMateri(
  id: string,
  input: Partial<CreateMateriInput>,
): Promise<MateriDocument | null> {
  return orpc.materi.update({ id, ...input }) as unknown as Promise<MateriDocument | null>;
}

export async function deleteMateri(id: string): Promise<boolean> {
  return orpc.materi.delete({ id }) as unknown as Promise<boolean>;
}

export async function searchMateri(
  query: string,
  history: MateriRagChatMessage[] = [],
  materiId?: string,
): Promise<MateriRagChatResult> {
  return orpc.materi.chat({
    message: query,
    history,
    materiId,
  }) as unknown as Promise<MateriRagChatResult>;
}
