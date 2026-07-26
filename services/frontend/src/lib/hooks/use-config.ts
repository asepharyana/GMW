import { useEffect, useState } from "react";
import { configApi } from "@/lib/api";
import type { AppConfig } from "@/lib/types/guild";

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    configApi
      .get()
      .then((cfg) => {
        setConfig(cfg);
      })
      .catch(() => {
        // silent — config fetch is not critical
      })
      .finally(() => setLoading(false));
  }, []);

  return { config, loading };
}
