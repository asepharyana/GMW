/**
 * Loosely-typed oRPC client shape shared by the browser (websocket RPCLink) and
 * server-side (fetch RPCLink) clients. The real router lives on the backend; we
 * do NOT import its type here (coupling the FE typecheck to the BE source tree
 * and its `@/` alias layout is fragile). Instead we describe the minimal shape
 * the api/* wrappers rely on: any path segment yields an object, and leaves are
 * callable functions returning a Promise. Leaf results are asserted to the
 * frontend's local types inside the api/* wrappers.
 */
export type ORPCClient = {
  [k: string]: ORPCClient;
} & ((input?: unknown) => Promise<unknown>);
