/**
 * Loosely-typed tRPC client shape shared by the browser (wsLink) and
 * server-side (httpLink) clients. The real router lives on the backend; we do
 * NOT import its type here (coupling the FE typecheck to the BE source tree
 * and its `@/` alias layout is fragile). Instead we describe the minimal shape
 * the api/* wrappers rely on: any path segment yields an object with `query`
 * and `mutate`, and arbitrary further nesting is allowed. Leaf results are
 * asserted to the frontend's local types inside the api/* wrappers.
 */
export type TRPCClient = {
  [k: string]: TRPCClient;
} & {
  query(input?: unknown): Promise<unknown>;
  mutate(input?: unknown): Promise<unknown>;
};
