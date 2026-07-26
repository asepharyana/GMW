import { useState, useEffect } from "react";
import { configApi } from "@/lib/api";

export interface AppConfig {
  monitorGuildId: string | null;
  webserverPort?: number;
  nodeEnv?: string;
}

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    configApi
      .get()
      .then((cfg) => {
        setConfig({
          monitorGuildId: cfg.monitor_guild_id ?? null,
        });
      })
      .catch(() => {
        // silent — config fetch is not critical
      })
      .finally(() => setLoading(false));
  }, []);

  return { config, loading };
}
