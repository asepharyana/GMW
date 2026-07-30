import { type PoolConfig as PgPoolConfig, Pool } from "pg";

export interface PoolConfig {
  url?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  min?: number;
  max?: number;
}

export function createPoolFromConfig(cfg: PoolConfig): Pool {
  const opts: PgPoolConfig = {
    min: cfg.min ?? 2,
    max: cfg.max ?? 10,
  };

  if (cfg.url) {
    opts.connectionString = cfg.url;
  } else {
    opts.host = cfg.host;
    opts.port = cfg.port;
    opts.user = cfg.user;
    opts.password = cfg.password;
    opts.database = cfg.database;
  }

  return new Pool(opts);
}

export function closePool(pool: Pool | null): Promise<void> {
  if (!pool) return Promise.resolve();
  return pool.end();
}
